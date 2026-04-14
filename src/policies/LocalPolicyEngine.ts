/**
 * LocalPolicyEngine — client-side policy evaluation for Obfusca.
 *
 * Evaluates a set of detections against synced policy rules to determine
 * the enforcement action (block / redact / warn / allow) without any
 * network call. This replaces the server-side action decision that previously
 * came from the /analyze response.
 *
 * Design goals:
 *   - Deterministic: same inputs always produce the same output.
 *   - Fast: < 1ms for typical evaluation (tens of detections, tens of rules).
 *   - Safe fallback: null policy → personal_protection defaults (never silent allow).
 *
 * Evaluation algorithm:
 *   1. For each detection, find a matching enabled enforce-mode rule by patternType.
 *   2. If a rule matches → use its configured action.
 *   3. If no rule matches → look up the detection's severity in the active
 *      profile's default severity→action table.
 *   4. Collect the per-detection actions and take the maximum (most restrictive).
 *   5. If a destination is provided, evaluate destination-specific rules and
 *      merge using max(detectionAction, destinationAction).
 *
 * Action priority (highest → lowest): BLOCK > REDACT > WARN > ALLOW
 */

import type {
  PolicyAction,
  PolicySeverity,
  PolicyRule,
  Detection,
  Policy,
  PolicyEvaluationResult,
  ProtectionProfile,
  DestinationRule,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Numeric rank for each action. Higher number = more restrictive.
 * Used to determine which action "wins" when multiple detections fire.
 */
const ACTION_RANK: Record<PolicyAction, number> = {
  allow: 0,
  warn: 1,
  redact: 2,
  block: 3,
};

/**
 * Default severity→action mapping per protection profile.
 *
 * personal_protection  — low-friction; critical blocks, medium warns.
 * business_standard    — high severity blocks; medium is redacted.
 * strict_compliance    — everything above low is blocked; low is redacted.
 * monitor_only         — no enforcement; all detections emit warn for logging only.
 */
const PROFILE_SEVERITY_DEFAULTS: Record<
  ProtectionProfile,
  Record<PolicySeverity, PolicyAction>
> = {
  personal_protection: {
    critical: 'block',
    high: 'redact',
    medium: 'warn',
    low: 'allow',
  },
  business_standard: {
    critical: 'block',
    high: 'block',
    medium: 'redact',
    low: 'warn',
  },
  strict_compliance: {
    critical: 'block',
    high: 'block',
    medium: 'block',
    low: 'redact',
  },
  monitor_only: {
    critical: 'warn',
    high: 'warn',
    medium: 'warn',
    low: 'warn',
  },
};

/**
 * Fallback profile used when policy is null (no sync has occurred).
 * personal_protection is the safest choice: it blocks critical data but
 * doesn't aggressively block lower-severity detections for first-time users.
 */
const FALLBACK_PROFILE: ProtectionProfile = 'personal_protection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the more restrictive of two actions. */
function maxAction(a: PolicyAction, b: PolicyAction): PolicyAction {
  return ACTION_RANK[a] >= ACTION_RANK[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * LocalPolicyEngine evaluates synced policies against a set of detections.
 *
 * Instantiated as a singleton (`localPolicyEngine`) for use across the
 * extension, but also exported as a class for unit-testing with isolated
 * instances.
 */
export class LocalPolicyEngine {
  /**
   * Evaluate a set of detections against the provided policy.
   *
   * @param detections  - Detection results from the local pipeline.
   * @param policy      - Synced policy from PolicyCache. Pass null to use
   *                      personal_protection defaults (safe for pre-sync state).
   * @param destination - Optional hostname of the destination site (e.g.
   *                      'chatgpt.com'). When provided, destination-specific
   *                      rules are evaluated and can escalate the action.
   * @returns PolicyEvaluationResult with the resolved action and debug context.
   */
  evaluate(
    detections: Detection[],
    policy: Policy | null,
    destination?: string,
  ): PolicyEvaluationResult {
    const profile = policy?.profile ?? FALLBACK_PROFILE;

    // Fast path: nothing to evaluate.
    if (detections.length === 0) {
      return this.buildResult('allow', null, null, false, profile);
    }

    const rules = policy?.rules ?? [];
    const destinationRules = policy?.destinationRules ?? [];

    // Build a fast lookup: patternType → PolicyRule.
    // Only include rules that are enabled AND in enforce mode.
    // Disabled rules and monitor-mode rules do not affect the action.
    const ruleMap = new Map<string, PolicyRule>();
    for (const rule of rules) {
      if (rule.enabled && rule.mode === 'enforce') {
        ruleMap.set(rule.patternType, rule);
      }
    }

    // Evaluate each detection and track the most restrictive action.
    let bestAction: PolicyAction = 'allow';
    let bestRule: PolicyRule | null = null;
    let bestDetection: Detection | null = null;

    for (const detection of detections) {
      const { action, rule } = this.resolveDetectionAction(detection, ruleMap, profile);

      if (ACTION_RANK[action] > ACTION_RANK[bestAction]) {
        bestAction = action;
        bestRule = rule;
        bestDetection = detection;
      }
    }

    // Apply destination-specific rules.
    // These can only ESCALATE the action — never reduce it.
    if (destination && destinationRules.length > 0) {
      const destAction = this.resolveDestinationAction(destination, destinationRules);
      if (destAction !== null && ACTION_RANK[destAction] > ACTION_RANK[bestAction]) {
        bestAction = destAction;
        // Note: destination escalation clears triggeredBy/triggeringDetection
        // because the escalation isn't caused by a specific PolicyRule or Detection.
        // bestRule and bestDetection are kept from the detection pass so callers
        // still know what detection caused the base action.
      }
    }

    return this.buildResult(bestAction, bestRule, bestDetection, false, profile);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the enforcement action for a single detection.
   *
   * Priority:
   *   1. Explicit per-type rule (enabled, enforce mode) → use rule.action.
   *   2. No matching rule → look up detection.severity in profile defaults.
   */
  private resolveDetectionAction(
    detection: Detection,
    ruleMap: Map<string, PolicyRule>,
    profile: ProtectionProfile,
  ): { action: PolicyAction; rule: PolicyRule | null } {
    const rule = ruleMap.get(detection.type) ?? null;

    if (rule !== null) {
      // Explicit rule takes priority over severity-based defaults.
      return { action: rule.action, rule };
    }

    // No rule matches — fall back to profile severity defaults.
    const profileDefaults = PROFILE_SEVERITY_DEFAULTS[profile];
    const action = profileDefaults[detection.severity] ?? 'warn';
    return { action, rule: null };
  }

  /**
   * Resolve the most restrictive action from destination rules that match
   * the given destination hostname.
   *
   * Returns null if no rule matches.
   */
  private resolveDestinationAction(
    destination: string,
    destinationRules: DestinationRule[],
  ): PolicyAction | null {
    let best: PolicyAction | null = null;

    for (const rule of destinationRules) {
      if (this.matchesDestination(destination, rule.destination)) {
        if (best === null || ACTION_RANK[rule.action] > ACTION_RANK[best]) {
          best = rule.action;
        }
      }
    }

    return best;
  }

  /**
   * Check whether a concrete destination hostname matches a rule pattern.
   *
   * Supported patterns:
   *   'external'        — matches any hostname (use for blanket external rules).
   *   '*.example.com'   — suffix wildcard; matches 'api.example.com' etc.
   *   'chatgpt.com'     — exact hostname match.
   */
  private matchesDestination(hostname: string, pattern: string): boolean {
    if (pattern === 'external') {
      return true;
    }
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2); // e.g. 'openai.com'
      return hostname === suffix || hostname.endsWith('.' + suffix);
    }
    return hostname === pattern;
  }

  /** Construct a PolicyEvaluationResult. */
  private buildResult(
    action: PolicyAction,
    triggeredBy: PolicyRule | null,
    triggeringDetection: Detection | null,
    isSimulated: boolean,
    profile: ProtectionProfile,
  ): PolicyEvaluationResult {
    return { action, triggeredBy, triggeringDetection, isSimulated, profile };
  }
}

// ---------------------------------------------------------------------------
// Exported utilities
// ---------------------------------------------------------------------------

/**
 * Singleton engine instance for use across the extension.
 * Import this directly rather than instantiating a new engine per call.
 */
export const localPolicyEngine = new LocalPolicyEngine();

/**
 * Compare two PolicyActions and return the more restrictive one.
 * Exported for use by callers that need to merge actions from different sources.
 *
 *   mergeActions('warn', 'block') → 'block'
 *   mergeActions('redact', 'allow') → 'redact'
 */
export function mergeActions(a: PolicyAction, b: PolicyAction): PolicyAction {
  return maxAction(a, b);
}

/**
 * Get the default action for a severity level under the given profile.
 * Exported for use in UI components that display per-severity defaults.
 */
export function getProfileDefault(
  profile: ProtectionProfile,
  severity: PolicySeverity,
): PolicyAction {
  return PROFILE_SEVERITY_DEFAULTS[profile][severity] ?? 'warn';
}
