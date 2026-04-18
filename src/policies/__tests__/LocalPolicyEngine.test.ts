/**
 * Unit tests for LocalPolicyEngine.
 *
 * Coverage:
 *   - Action hierarchy (BLOCK > REDACT > WARN > ALLOW)
 *   - Per-type rule overrides (explicit rules beat severity defaults)
 *   - Disabled rules are ignored
 *   - Monitor-mode rules are not enforced (excluded from ruleMap)
 *   - Severity-based defaults for all four protection profiles
 *   - Multiple detections: highest-priority action wins
 *   - Triggering detection and rule are surfaced in the result
 *   - Fallback when policy is null (personal_protection defaults)
 *   - Destination-specific rules (escalate-only)
 *   - Wildcard and exact hostname matching
 *   - Result shape (profile, isSimulated, triggeredBy, triggeringDetection)
 *
 * Run with:
 *   npx vitest run src/policies/__tests__/LocalPolicyEngine.test.ts
 *
 * Note: The root vitest.config.ts include pattern is 'tests/**' — this file
 * lives under src/policies/__tests__/ per mission spec. Run it directly via
 * the command above, or update vitest.config.ts to also include
 * 'src/**\/__tests__/**\/*.test.ts'.
 */

import { describe, it, expect } from 'vitest';
import { LocalPolicyEngine, mergeActions, getProfileDefault } from '../LocalPolicyEngine';
import type { Detection, Policy, PolicyRule, PolicyAction, ProtectionProfile } from '../types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const engine = new LocalPolicyEngine();

function makeDetection(
  type: string,
  severity: Detection['severity'],
  confidence = 0.95,
  destination?: string,
): Detection {
  return { type, severity, confidence, ...(destination ? { destination } : {}) };
}

function makeRule(
  patternType: string,
  action: PolicyAction,
  opts: {
    enabled?: boolean;
    mode?: 'enforce' | 'monitor';
    severityOverride?: Detection['severity'] | null;
    id?: string;
  } = {},
): PolicyRule {
  return {
    id: opts.id ?? `rule-${patternType}`,
    patternType,
    action,
    severityOverride: opts.severityOverride ?? null,
    enabled: opts.enabled ?? true,
    mode: opts.mode ?? 'enforce',
  };
}

function makePolicy(
  profile: ProtectionProfile = 'personal_protection',
  rules: PolicyRule[] = [],
  destinationRules: Policy['destinationRules'] = [],
): Policy {
  return { profile, rules, destinationRules, lastSyncedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// 1. Action hierarchy: BLOCK > REDACT > WARN > ALLOW
// ---------------------------------------------------------------------------

describe('action hierarchy: BLOCK > REDACT > WARN > ALLOW', () => {
  it('1. returns ALLOW when there are no detections', () => {
    const result = engine.evaluate([], makePolicy());
    expect(result.action).toBe('allow');
    expect(result.triggeredBy).toBeNull();
    expect(result.triggeringDetection).toBeNull();
  });

  it('2. BLOCK beats REDACT across two detections', () => {
    const detections = [
      makeDetection('ssn', 'critical'),
      makeDetection('email', 'high'),
    ];
    const policy = makePolicy('personal_protection', [
      makeRule('ssn', 'block'),
      makeRule('email', 'redact'),
    ]);
    expect(engine.evaluate(detections, policy).action).toBe('block');
  });

  it('3. BLOCK beats WARN across two detections', () => {
    const detections = [
      makeDetection('credit_card', 'critical'),
      makeDetection('name', 'low'),
    ];
    const policy = makePolicy('personal_protection', [
      makeRule('credit_card', 'block'),
      makeRule('name', 'warn'),
    ]);
    expect(engine.evaluate(detections, policy).action).toBe('block');
  });

  it('4. BLOCK beats ALLOW across two detections', () => {
    const detections = [
      makeDetection('ssn', 'critical'),
      makeDetection('name', 'low'),
    ];
    const policy = makePolicy('personal_protection', [
      makeRule('ssn', 'block'),
      makeRule('name', 'allow'),
    ]);
    expect(engine.evaluate(detections, policy).action).toBe('block');
  });

  it('5. REDACT beats WARN across two detections', () => {
    const detections = [
      makeDetection('credit_card', 'high'),
      makeDetection('email', 'low'),
    ];
    const policy = makePolicy('personal_protection', [
      makeRule('credit_card', 'redact'),
      makeRule('email', 'warn'),
    ]);
    expect(engine.evaluate(detections, policy).action).toBe('redact');
  });

  it('6. WARN beats ALLOW across two detections', () => {
    const detections = [
      makeDetection('phone', 'medium'),
      makeDetection('name', 'low'),
    ];
    const policy = makePolicy('personal_protection', [
      makeRule('phone', 'warn'),
      makeRule('name', 'allow'),
    ]);
    expect(engine.evaluate(detections, policy).action).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// 2. Per-type rule overrides
// ---------------------------------------------------------------------------

describe('per-type rule overrides', () => {
  it('7. SSN rule configured to block always blocks', () => {
    const detections = [makeDetection('ssn', 'critical')];
    const policy = makePolicy('personal_protection', [makeRule('ssn', 'block')]);
    const result = engine.evaluate(detections, policy);
    expect(result.action).toBe('block');
    expect(result.triggeredBy?.patternType).toBe('ssn');
    expect(result.triggeredBy?.action).toBe('block');
  });

  it('8. email rule configured to warn only emits warn even at high severity', () => {
    // Without this rule, personal_protection would redact high-severity detections.
    const detections = [makeDetection('email', 'high')];
    const policy = makePolicy('personal_protection', [makeRule('email', 'warn')]);
    const result = engine.evaluate(detections, policy);
    expect(result.action).toBe('warn');
    expect(result.triggeredBy?.patternType).toBe('email');
  });

  it('9. disabled rule is ignored — severity default applies instead', () => {
    const detections = [makeDetection('ssn', 'critical')];
    const policy = makePolicy('personal_protection', [
      makeRule('ssn', 'allow', { enabled: false }),
    ]);
    // personal_protection critical → block (default, since rule is disabled)
    expect(engine.evaluate(detections, policy).action).toBe('block');
    expect(engine.evaluate(detections, policy).triggeredBy).toBeNull();
  });

  it('10. monitor-mode rule is excluded from enforcement — falls back to profile default', () => {
    const detections = [makeDetection('credit_card', 'medium')];
    const policy = makePolicy('personal_protection', [
      makeRule('credit_card', 'block', { mode: 'monitor' }),
    ]);
    // Monitor rule is not in the enforce ruleMap.
    // personal_protection medium → warn (profile default).
    const result = engine.evaluate(detections, policy);
    expect(result.action).toBe('warn');
    expect(result.triggeredBy).toBeNull();
  });

  it('11. per-type allow rule can suppress action below severity default', () => {
    // business_standard: low → warn. But an explicit allow rule wins.
    const detections = [makeDetection('name', 'low')];
    const policy = makePolicy('business_standard', [makeRule('name', 'allow')]);
    expect(engine.evaluate(detections, policy).action).toBe('allow');
  });
});

// ---------------------------------------------------------------------------
// 3. Severity-based defaults (no matching rule)
// ---------------------------------------------------------------------------

describe('severity-based defaults — personal_protection profile', () => {
  const profile = makePolicy('personal_protection');

  it('12. critical severity → BLOCK', () => {
    expect(engine.evaluate([makeDetection('unknown', 'critical')], profile).action).toBe('block');
  });

  it('13. high severity → REDACT', () => {
    expect(engine.evaluate([makeDetection('custom_x', 'high')], profile).action).toBe('redact');
  });

  it('14. medium severity → WARN', () => {
    expect(engine.evaluate([makeDetection('semantic', 'medium')], profile).action).toBe('warn');
  });

  it('15. low severity → ALLOW', () => {
    expect(engine.evaluate([makeDetection('name', 'low')], profile).action).toBe('allow');
  });
});

// ---------------------------------------------------------------------------
// 4. Protection profiles
// ---------------------------------------------------------------------------

describe('protection profiles — all four profiles', () => {
  it('16. personal_protection: critical→block, high→redact, medium→warn, low→allow', () => {
    const p = makePolicy('personal_protection');
    expect(engine.evaluate([makeDetection('d', 'critical')], p).action).toBe('block');
    expect(engine.evaluate([makeDetection('d', 'high')], p).action).toBe('redact');
    expect(engine.evaluate([makeDetection('d', 'medium')], p).action).toBe('warn');
    expect(engine.evaluate([makeDetection('d', 'low')], p).action).toBe('allow');
  });

  it('17. business_standard: critical→block, high→block, medium→redact, low→warn', () => {
    const p = makePolicy('business_standard');
    expect(engine.evaluate([makeDetection('d', 'critical')], p).action).toBe('block');
    expect(engine.evaluate([makeDetection('d', 'high')], p).action).toBe('block');
    expect(engine.evaluate([makeDetection('d', 'medium')], p).action).toBe('redact');
    expect(engine.evaluate([makeDetection('d', 'low')], p).action).toBe('warn');
  });

  it('18. strict_compliance: critical→block, high→block, medium→block, low→redact', () => {
    const p = makePolicy('strict_compliance');
    expect(engine.evaluate([makeDetection('d', 'critical')], p).action).toBe('block');
    expect(engine.evaluate([makeDetection('d', 'high')], p).action).toBe('block');
    expect(engine.evaluate([makeDetection('d', 'medium')], p).action).toBe('block');
    expect(engine.evaluate([makeDetection('d', 'low')], p).action).toBe('redact');
  });

  it('19. monitor_only: all severities → warn (never blocks or redacts)', () => {
    const p = makePolicy('monitor_only');
    for (const sev of ['critical', 'high', 'medium', 'low'] as const) {
      expect(engine.evaluate([makeDetection('d', sev)], p).action).toBe('warn');
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Multiple detections: highest severity wins
// ---------------------------------------------------------------------------

describe('multiple detections', () => {
  it('20. highest-severity detection drives the action', () => {
    const detections = [
      makeDetection('email', 'low'),
      makeDetection('phone', 'medium'),
      makeDetection('ssn', 'critical'),
    ];
    const result = engine.evaluate(detections, makePolicy('personal_protection'));
    expect(result.action).toBe('block');
    expect(result.triggeringDetection?.type).toBe('ssn');
  });

  it('21. rule-driven block beats profile-driven redact across mixed detections', () => {
    const detections = [
      makeDetection('email', 'high'),     // no rule → personal_protection high → redact
      makeDetection('credit_card', 'low'), // rule → block
    ];
    const policy = makePolicy('personal_protection', [makeRule('credit_card', 'block')]);
    const result = engine.evaluate(detections, policy);
    expect(result.action).toBe('block');
    expect(result.triggeredBy?.patternType).toBe('credit_card');
  });

  it('22. all-allow scenario: no detection triggers enforcement', () => {
    const detections = [
      makeDetection('name', 'low'),
      makeDetection('date', 'low'),
    ];
    const policy = makePolicy('personal_protection', [
      makeRule('name', 'allow'),
      makeRule('date', 'allow'),
    ]);
    expect(engine.evaluate(detections, policy).action).toBe('allow');
  });

  it('23. triggeredBy is null when action comes from severity default (no rule)', () => {
    const detections = [makeDetection('api_key', 'high')];
    const result = engine.evaluate(detections, makePolicy('business_standard'));
    expect(result.action).toBe('block');
    expect(result.triggeredBy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Fallback when no policies are synced (null policy)
// ---------------------------------------------------------------------------

describe('fallback when policy is null', () => {
  it('24. null policy uses personal_protection defaults', () => {
    expect(engine.evaluate([makeDetection('ssn', 'critical')], null).action).toBe('block');
  });

  it('25. null policy, high severity → redact', () => {
    expect(engine.evaluate([makeDetection('cc', 'high')], null).action).toBe('redact');
  });

  it('26. null policy, medium severity → warn', () => {
    expect(engine.evaluate([makeDetection('email', 'medium')], null).action).toBe('warn');
  });

  it('27. null policy, low severity → allow', () => {
    expect(engine.evaluate([makeDetection('name', 'low')], null).action).toBe('allow');
  });

  it('28. null policy, no detections → allow with profile=personal_protection', () => {
    const result = engine.evaluate([], null);
    expect(result.action).toBe('allow');
    expect(result.profile).toBe('personal_protection');
  });
});

// ---------------------------------------------------------------------------
// 7. Destination-specific rules
// ---------------------------------------------------------------------------

describe('destination-specific rules', () => {
  it('29. destination rule escalates action (allow → warn for external)', () => {
    const detections = [makeDetection('email', 'low')];
    const policy = makePolicy('personal_protection', [], [
      { destination: 'external', action: 'warn' },
    ]);
    // personal_protection low → allow, but external rule escalates to warn
    expect(engine.evaluate(detections, policy, 'chatgpt.com').action).toBe('warn');
  });

  it('30. destination rule never reduces a higher base action', () => {
    const detections = [makeDetection('ssn', 'critical')];
    const policy = makePolicy('personal_protection', [makeRule('ssn', 'block')], [
      { destination: 'external', action: 'warn' },
    ]);
    // block > warn — destination rule does not downgrade
    expect(engine.evaluate(detections, policy, 'unknown-site.com').action).toBe('block');
  });

  it('31. destination rules are ignored when no destination is provided', () => {
    const detections = [makeDetection('email', 'low')];
    const policy = makePolicy('personal_protection', [], [
      { destination: 'external', action: 'block' },
    ]);
    // No destination passed → destination rules not evaluated
    expect(engine.evaluate(detections, policy).action).toBe('allow');
  });

  it('32. exact hostname destination rule matches correctly', () => {
    const detections = [makeDetection('name', 'low')];
    const policy = makePolicy('personal_protection', [], [
      { destination: 'chatgpt.com', action: 'redact' },
    ]);
    expect(engine.evaluate(detections, policy, 'chatgpt.com').action).toBe('redact');
  });

  it('33. exact hostname destination rule does not match a different hostname', () => {
    const detections = [makeDetection('name', 'low')];
    const policy = makePolicy('personal_protection', [], [
      { destination: 'chatgpt.com', action: 'block' },
    ]);
    expect(engine.evaluate(detections, policy, 'gemini.google.com').action).toBe('allow');
  });

  it('34. wildcard hostname matches subdomain', () => {
    const detections = [makeDetection('email', 'low')];
    const policy = makePolicy('personal_protection', [], [
      { destination: '*.openai.com', action: 'warn' },
    ]);
    expect(engine.evaluate(detections, policy, 'chat.openai.com').action).toBe('warn');
  });

  it('35. wildcard hostname matches the apex domain itself', () => {
    const detections = [makeDetection('email', 'low')];
    const policy = makePolicy('personal_protection', [], [
      { destination: '*.openai.com', action: 'warn' },
    ]);
    expect(engine.evaluate(detections, policy, 'openai.com').action).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// 8. Result shape and metadata
// ---------------------------------------------------------------------------

describe('evaluation result shape', () => {
  it('36. result.profile reflects the policy profile', () => {
    const result = engine.evaluate([], makePolicy('strict_compliance'));
    expect(result.profile).toBe('strict_compliance');
  });

  it('37. result.profile is personal_protection when policy is null', () => {
    const result = engine.evaluate([], null);
    expect(result.profile).toBe('personal_protection');
  });

  it('38. isSimulated is false for enforce-mode results', () => {
    const detections = [makeDetection('ssn', 'critical')];
    const policy = makePolicy('personal_protection', [makeRule('ssn', 'block')]);
    expect(engine.evaluate(detections, policy).isSimulated).toBe(false);
  });

  it('39. isSimulated is false when action comes from severity default (no rule)', () => {
    const detections = [makeDetection('unknown', 'high')];
    expect(engine.evaluate(detections, makePolicy('business_standard')).isSimulated).toBe(false);
  });

  it('40. triggeringDetection type matches the winning detection', () => {
    const detections = [
      makeDetection('email', 'low'),
      makeDetection('credit_card', 'critical'),
    ];
    const result = engine.evaluate(detections, makePolicy('personal_protection'));
    expect(result.triggeringDetection?.type).toBe('credit_card');
    expect(result.triggeringDetection?.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// 9. Exported utilities
// ---------------------------------------------------------------------------

describe('exported utility functions', () => {
  it('41. mergeActions returns the more restrictive action', () => {
    expect(mergeActions('allow', 'block')).toBe('block');
    expect(mergeActions('warn', 'redact')).toBe('redact');
    expect(mergeActions('block', 'warn')).toBe('block');
    expect(mergeActions('allow', 'allow')).toBe('allow');
  });

  it('42. getProfileDefault returns correct severity→action for each profile', () => {
    expect(getProfileDefault('personal_protection', 'critical')).toBe('block');
    expect(getProfileDefault('personal_protection', 'high')).toBe('redact');
    expect(getProfileDefault('business_standard', 'medium')).toBe('redact');
    expect(getProfileDefault('strict_compliance', 'low')).toBe('redact');
    expect(getProfileDefault('monitor_only', 'critical')).toBe('warn');
  });
});
