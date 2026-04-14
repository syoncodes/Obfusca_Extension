/**
 * Policy types for the LocalPolicyEngine.
 *
 * These interfaces mirror the backend policy model (app/routes/policies.py and
 * app/routes/presets.py) so that synced policies map directly without
 * field-level translation.
 *
 * Naming follows camelCase for TypeScript; the sync layer is responsible for
 * converting snake_case backend field names.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** The four enforcement actions, ordered by increasing restrictiveness. */
export type PolicyAction = 'allow' | 'warn' | 'redact' | 'block';

/** Severity levels, matching the backend Severity enum. */
export type PolicySeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Policy evaluation mode.
 *   enforce — the action is applied and enforcement UI is shown.
 *   monitor — the rule is evaluated and logged but the action is NOT enforced
 *             (useful for shadowing a new policy before going live).
 */
export type PolicyMode = 'enforce' | 'monitor';

// ---------------------------------------------------------------------------
// Protection Profiles
// ---------------------------------------------------------------------------

/**
 * Named protection profiles correspond to policy preset slugs in the backend.
 * Each profile defines a default severity→action mapping used when no
 * per-type rule matches a detection.
 *
 *   personal_protection  — light touch; only blocks critical, warns on medium.
 *   business_standard    — blocks critical+high; redacts medium.
 *   strict_compliance    — blocks everything ≥ medium; redacts low.
 *   monitor_only         — never blocks; all detections emit a warn for logging.
 */
export type ProtectionProfile =
  | 'personal_protection'
  | 'business_standard'
  | 'strict_compliance'
  | 'monitor_only';

// ---------------------------------------------------------------------------
// Policy Rules
// ---------------------------------------------------------------------------

/**
 * A single per-type policy rule.
 *
 * Mirrors backend PolicyResponse. One rule per detection pattern type
 * (e.g. 'ssn', 'credit_card', 'email', 'custom_123').
 */
export interface PolicyRule {
  /** UUID from the backend. */
  id: string;

  /**
   * The detection pattern type this rule applies to.
   * Must match the `type` field returned by the detection pipeline.
   * Examples: 'ssn', 'credit_card', 'aws_key', 'email', 'custom_abc123'.
   */
  patternType: string;

  /** Enforcement action when this pattern type is detected. */
  action: PolicyAction;

  /**
   * Optional severity override.
   * When set, the engine uses this severity for default-table lookup if no
   * explicit action is set. In practice the action field takes priority, so
   * this is mainly informational for the UI.
   */
  severityOverride: PolicySeverity | null;

  /** Whether this rule is active. Disabled rules are ignored during evaluation. */
  enabled: boolean;

  /** Evaluation mode: 'enforce' applies the action; 'monitor' only logs. */
  mode: PolicyMode;
}

// ---------------------------------------------------------------------------
// Destination-specific rules
// ---------------------------------------------------------------------------

/**
 * A destination-specific override.
 *
 * Destination rules can only ESCALATE the enforcement action (never reduce).
 * They are evaluated AFTER per-type rules and profile defaults, and the
 * result is merged using max(baseAction, destinationAction).
 *
 * Supported destination patterns:
 *   - Exact hostname:   'chatgpt.com'
 *   - Wildcard suffix:  '*.openai.com'  (matches 'chat.openai.com', 'api.openai.com')
 *   - Special category: 'external'      (matches any destination — use for blanket rules)
 */
export interface DestinationRule {
  /** Hostname pattern or special category ('external'). */
  destination: string;
  /** Action to apply when content is sent to this destination. */
  action: PolicyAction;
}

// ---------------------------------------------------------------------------
// Full synced policy
// ---------------------------------------------------------------------------

/**
 * The complete policy configuration for a tenant, as stored in the
 * PolicyCache (chrome.storage.local).
 *
 * This is the top-level object passed to LocalPolicyEngine.evaluate().
 */
export interface Policy {
  /** Active protection profile — drives default severity→action mapping. */
  profile: ProtectionProfile;

  /** Per-type policy rules synced from GET /policies. */
  rules: PolicyRule[];

  /** Optional destination-specific overrides. */
  destinationRules?: DestinationRule[];

  /** Unix timestamp (ms) of the last successful sync. 0 if never synced. */
  lastSyncedAt: number;
}

// ---------------------------------------------------------------------------
// Detections (input to the engine)
// ---------------------------------------------------------------------------

/**
 * A single detection result from the local detection pipeline.
 *
 * This is the minimal shape the policy engine needs; the full Detection type
 * (with start/end positions, display name, etc.) is a superset of this.
 */
export interface Detection {
  /**
   * Pattern type — must match PolicyRule.patternType for rule lookup.
   * Examples: 'ssn', 'credit_card', 'email', 'custom_abc123'.
   */
  type: string;

  /** Severity level assigned by the detector. */
  severity: PolicySeverity;

  /** Confidence score from the detector (0.0–1.0). */
  confidence: number;

  /**
   * Optional destination hostname for destination-specific rule evaluation.
   * If provided, destination rules are evaluated after per-type + profile rules.
   */
  destination?: string;
}

// ---------------------------------------------------------------------------
// Evaluation result
// ---------------------------------------------------------------------------

/**
 * The result returned by LocalPolicyEngine.evaluate().
 */
export interface PolicyEvaluationResult {
  /**
   * The resolved enforcement action — the maximum (most restrictive) action
   * across all detections and destination rules.
   *
   *   BLOCK > REDACT > WARN > ALLOW
   */
  action: PolicyAction;

  /**
   * The specific PolicyRule that triggered the winning action.
   * Null if the action was determined by the profile's severity defaults.
   */
  triggeredBy: PolicyRule | null;

  /**
   * The detection that caused the winning action to be selected.
   * Null only when there are no detections (action === 'allow').
   */
  triggeringDetection: Detection | null;

  /**
   * True if the winning rule is in monitor mode.
   * When true, the caller SHOULD log the event but SHOULD NOT enforce the
   * action in the UI — show the content through and record the simulation.
   */
  isSimulated: boolean;

  /** The protection profile that was active during evaluation. */
  profile: ProtectionProfile;
}
