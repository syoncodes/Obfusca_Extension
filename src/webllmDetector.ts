/// <reference types="@webgpu/types" />
/**
 * WebLLM-powered PII Detector — replaces NER + Layer 2 + Layer 3 + Groq
 * with a single local LLM call using structured JSON output.
 *
 * Architecture:
 *   1. Regex catches obvious patterns (SSN, credit card, API key) — instant
 *   2. WebLLM classifies everything else with full context understanding — ~1-2s
 *   3. Falls back to NER pipeline if WebGPU unavailable
 */

import type { Detection, DetectionType, Severity } from './detection';

let _engine: any = null;
let _initializing = false;
let _available: boolean | null = null;

const MODEL_ID = 'Qwen2.5-3B-Instruct-q4f16_1-MLC';

const FALLBACK_PROMPT = 'You are a PII classification API. Given text, return a JSON array. Format: [{"type":"name","value":"Dr. Sarah Chen"}] Types: name, money, medical, id_doc, addr, dob, ip. Return ONLY JSON.';
let _cachedRulePrompt: string | null = null;
let _cachedRuleHash = '';
async function getSystemPrompt(): Promise<string> {
  try {
    const storage = await chrome.storage.local.get(['semanticRules']);
    const rules = Array.isArray(storage.semanticRules) ? storage.semanticRules.filter((r: any) => r.enabled) : [];
    if (rules.length === 0) return FALLBACK_PROMPT;
    const ruleHash = rules.map((r: any) => r.name).sort().join(',');
    if (_cachedRulePrompt && ruleHash === _cachedRuleHash) return _cachedRulePrompt;
    const ruleNames = [...new Set(rules.map((r: any) => r.name))];
    _cachedRulePrompt = 'You are a DLP scanner. Find ALL sensitive info. Return JSON array: [{"type":"LABEL","value":"text"}]. Use ONLY these labels: ' + ruleNames.join(', ') + '. Rules: Full Legal Name=real human names ONLY not job titles. Income/Salary Information=currency amounts. Home Address=street addresses. Workplace/Employer=company names AND job titles. Medical Conditions=diagnoses vitals labs. Personal Email Address=emails. Personal Phone Number=phones. Passwords & Credentials=passwords API keys tokens. Skip non-sensitive items. Return ONLY JSON array.';
    _cachedRuleHash = ruleHash;
    return _cachedRulePrompt;
  } catch { return FALLBACK_PROMPT; }
}

/**
 * Check if WebGPU is available in this browser.
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    if (!navigator.gpu) {
      _available = false;
      return false;
    }
    const adapter = await navigator.gpu.requestAdapter();
    _available = adapter !== null;
    return _available;
  } catch {
    _available = false;
    return false;
  }
}

/**
 * Initialize the WebLLM engine. Call once, model is cached after first download.
 */
export async function initWebLLM(
  onProgress?: (progress: { text: string; progress: number }) => void
): Promise<boolean> {
  if (_engine) return true;
  if (_initializing) {
    while (_initializing) await new Promise(r => setTimeout(r, 100));
    return _engine !== null;
  }

  _initializing = true;

  try {
    if (!(await isWebGPUAvailable())) {
      console.log('[Obfusca WebLLM] WebGPU not available, skipping');
      _initializing = false;
      return false;
    }

    console.log('[Obfusca WebLLM] Initializing engine with model:', MODEL_ID);

    const webllm = await import('@mlc-ai/web-llm');

    _engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (report: any) => {
        console.log(`[Obfusca WebLLM] Loading: ${report.text}`);
        if (onProgress) {
          onProgress({ text: report.text, progress: report.progress || 0 });
        }
      },
      appConfig: {
        model_list: [{
          model_id: MODEL_ID,
          model: 'https://huggingface.co/mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC',
          model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Qwen2.5-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
          overrides: {
            context_window_size: 16384,
          },
        }],
      },
    });

    console.log('[Obfusca WebLLM] Engine ready');
    _initializing = false;
    return true;
  } catch (err) {
    console.error('[Obfusca WebLLM] Init failed:', err);
    _initializing = false;
    return false;
  }
}

/**
 * Detect PII using WebLLM. Returns detections in the same format as the NER pipeline.
 */
export async function detectWithWebLLM(text: string): Promise<Detection[]> {
  if (!_engine) {
    const ok = await initWebLLM();
    if (!ok) return [];
  }

  try {
    const startTime = performance.now();

    const systemPrompt = await getSystemPrompt();
    const response = await _engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    });

    const elapsed = performance.now() - startTime;
    const content = response.choices[0]?.message?.content || '{}';

    console.log(`[Obfusca WebLLM] Inference took ${elapsed.toFixed(0)}ms`);
    console.log(`[Obfusca WebLLM] Raw output: ${content.substring(0, 200)}`);

    let cleaned = content.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
    if (cleaned.startsWith('\`\`\`')) {
      cleaned = cleaned.replace(/\`\`\`json?/g, '').replace(/\`\`\`/g, '').trim();
    }
    if (cleaned.startsWith('[')) {
      const lastBracket = cleaned.lastIndexOf(']');
      if (lastBracket !== -1) cleaned = cleaned.substring(0, lastBracket + 1);
    } else if (cleaned.startsWith('{')) {
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace !== -1) cleaned = cleaned.substring(0, lastBrace + 1);
    } else {
      const arrIdx = cleaned.indexOf('[');
      if (arrIdx !== -1) {
        cleaned = cleaned.substring(arrIdx);
        const lastBracket = cleaned.lastIndexOf(']');
        if (lastBracket !== -1) cleaned = cleaned.substring(0, lastBracket + 1);
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.log('[Obfusca WebLLM] JSON parse failed, trying to extract detections array');
      const arrMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrMatch) {
        try {
          parsed = { detections: JSON.parse(arrMatch[0]) };
        } catch {
          console.log('[Obfusca WebLLM] Array extraction failed, trying regex');
          const items: any[] = [];
          const re = /\{[^}]*?["'](?:type|t(?:ype)?)["']\s*:\s*["']([^"']+)["'][^}]*?["'](?:value|v(?:alue)?)["']\s*:\s*["']([^"']*)["'][^}]*?\}/g;
          let rm;
          while ((rm = re.exec(cleaned)) !== null) {
            items.push({ type: rm[1], value: rm[2] });
          }
          if (items.length === 0) {
            const re2 = /\{[^}]*?["'](?:value|v(?:alue)?)["']\s*:\s*["']([^"']*)["'][^}]*?["'](?:type|t(?:ype)?)["']\s*:\s*["']([^"']+)["'][^}]*?\}/g;
            while ((rm = re2.exec(cleaned)) !== null) {
              items.push({ type: rm[2], value: rm[1] });
            }
          }
          if (items.length > 0) {
            console.log('[Obfusca WebLLM] Regex extracted ' + items.length + ' items');
            parsed = { detections: items };
          } else {
            return [];
          }
        }
      } else {
        return [];
      }
    }
    const rawDetections = Array.isArray(parsed) ? parsed : (parsed.detections || parsed.d || parsed.results || []);

    const TYPE_MAP: Record<string, DetectionType> = {
      // Short type names from default prompt
      name: 'person_name' as DetectionType,
      money: 'financial' as DetectionType,
      medical: 'medical_record' as DetectionType,
      id_doc: 'identity_document' as DetectionType,
      addr: 'address' as DetectionType,
      dob: 'date' as DetectionType,
      ip: 'ip_address' as DetectionType,
      phone: 'phone' as DetectionType,
      email: 'email' as DetectionType,
      org: 'organization' as DetectionType,
      ssn: 'ssn' as DetectionType,
      credential: 'api_key' as DetectionType,
      // Dashboard rule names (from rule-aware prompt)
      'Full Legal Name': 'person_name' as DetectionType,
      'Income/Salary Information': 'financial' as DetectionType,
      'Medical Conditions': 'medical_record' as DetectionType,
      'Medical Record Numbers': 'medical_record' as DetectionType,
      'Health Insurance Information': 'medical_record' as DetectionType,
      'Medications': 'medical_record' as DetectionType,
      'Passport Number': 'identity_document' as DetectionType,
      "Driver's License Number": 'identity_document' as DetectionType,
      'Social Security Number': 'ssn' as DetectionType,
      'Home Address': 'address' as DetectionType,
      'Current Location': 'address' as DetectionType,
      'Personal Phone Number': 'phone' as DetectionType,
      'Personal Email Address': 'email' as DetectionType,
      'IP Address': 'ip_address' as DetectionType,
      'Workplace/Employer': 'organization' as DetectionType,
      'Date of Birth': 'date' as DetectionType,
      'Passwords & Credentials': 'api_key' as DetectionType,
      'Credit Card Number': 'credit_card' as DetectionType,
      'Bank Account Number': 'financial' as DetectionType,
      'Tax Information': 'financial' as DetectionType,
      'Family Member Names': 'person_name' as DetectionType,
      "Children's Information": 'person_name' as DetectionType,
      'Username/Account Names': 'email' as DetectionType,
    };

    const SEVERITY_MAP: Record<string, Severity> = {
      person_name: 'medium' as Severity,
      financial: 'high' as Severity,
      medical_record: 'high' as Severity,
      medical_condition: 'high' as Severity,
      identity_document: 'critical' as Severity,
      address: 'medium' as Severity,
      phone: 'medium' as Severity,
      email: 'low' as Severity,
      date_of_birth: 'medium' as Severity,
      ip_address: 'medium' as Severity,
      credential: 'critical' as Severity,
      organization: 'low' as Severity,
    };

    const DISPLAY_NAMES: Record<string, string> = {
      person_name: 'Full Legal Name',
      financial: 'Income/Salary Information',
      medical_record: 'Medical Record Numbers',
      medical_condition: 'Medical Conditions',
      identity_document: 'Passport Number',
      address: 'Home Address',
      phone: 'Personal Phone Number',
      email: 'Personal Email Address',
      date: 'Date of Birth',
      date_of_birth: 'Date of Birth',
      ip_address: 'IP Address',
      credential: 'Passwords & Credentials',
      organization: 'Workplace/Employer',
      ssn: 'Social Security Number',
      credit_card: 'Credit Card Number',
      aws_key: 'Passwords & Credentials',
      aws_secret: 'Passwords & Credentials',
      api_key: 'Passwords & Credentials',
      jwt: 'Passwords & Credentials',
      connection_string: 'Passwords & Credentials',
      // Rule names pass through as-is
      'Full Legal Name': 'Full Legal Name',
      'Income/Salary Information': 'Income/Salary Information',
      'Medical Conditions': 'Medical Conditions',
      'Medical Record Numbers': 'Medical Record Numbers',
      'Health Insurance Information': 'Health Insurance Information',
      'Passport Number': 'Passport Number',
      "Driver's License Number": "Driver's License Number",
      'Social Security Number': 'Social Security Number',
      'Home Address': 'Home Address',
      'Personal Phone Number': 'Personal Phone Number',
      'Personal Email Address': 'Personal Email Address',
      'IP Address': 'IP Address',
      'Workplace/Employer': 'Workplace/Employer',
      'Date of Birth': 'Date of Birth',
      'Passwords & Credentials': 'Passwords & Credentials',
      'Credit Card Number': 'Credit Card Number',
      'Bank Account Number': 'Bank Account Number',
      'Tax Information': 'Tax Information',
      'Family Member Names': 'Family Member Names',
      "Children's Information": "Children's Information",
      'Current Location': 'Current Location',
      'Username/Account Names': 'Username/Account Names',
      'Medications': 'Medications',
    };

    const detections: Detection[] = [];

    for (const d of rawDetections) {
      const dtype = d.type || d.t || d.category || '';
      const type = TYPE_MAP[dtype];
      if (!type) continue;

      const value = d.value || d.v;
      let start = d.start;
      let end = d.end;

      if (typeof start !== 'number' || typeof end !== 'number') {
        const idx = text.indexOf(value);
        if (idx === -1) continue;
        start = idx;
        end = idx + value.length;
      }

      if (start < 0 || end > text.length || start >= end) continue;

      detections.push({
        type,
        displayName: DISPLAY_NAMES[d.type] || d.type,
        severity: SEVERITY_MAP[d.type] || ('medium' as Severity),
        start,
        end,
        confidence: 0.92,
      });
    }

    // Post-process: fix common WebLLM mislabels
    for (const det of detections) {
      const val = text.substring(det.start, det.end).toLowerCase();
      // Blood pressure, A1C, vitals, medication dosages are medical, not financial
      if (det.type === ('financial' as DetectionType) || det.type === ('person_name' as DetectionType)) {
        if (/^\d{2,3}\/\d{2,3}$/.test(val) || /^\d+\.\d+%$/.test(val) ||
            /^\d+mg$/i.test(val) || /metformin|aspirin|insulin|lisinopril|amoxicillin|ibuprofen/i.test(val) ||
            /^[a-z]{2,3}-?\d{4,}$/i.test(val)) {
          det.type = 'medical_record' as DetectionType;
          det.displayName = 'Medical Record';
          det.severity = 'high' as Severity;
        }
      }
      // Standalone numbers that look like MRN/policy numbers, not financial
      if (det.type === ('financial' as DetectionType) && /^[A-Z]{0,3}\d{5,}$/i.test(val)) {
        det.type = 'medical_record' as DetectionType;
        det.displayName = 'Medical Record';
      }
    }

    console.log(`[Obfusca WebLLM] Found ${detections.length} detections in ${elapsed.toFixed(0)}ms`);
    return detections;
  } catch (err) {
    console.error('[Obfusca WebLLM] Detection failed:', err);
    return [];
  }
}

/**
 * Check if WebLLM engine is loaded and ready.
 */
export function isWebLLMReady(): boolean {
  return _engine !== null;
}

/**
 * Use WebLLM to validate and correct detection labels.
 * Dynamically builds validation prompt from the tenant's actual dashboard rules.
 */
export async function validateDetectionLabels(
  text: string,
  detections: Detection[]
): Promise<Detection[]> {
  // Validation merged into detection prompt — skip second LLM call
  return detections;

  // Load the tenant's semantic rules to build a dynamic validation prompt
  let ruleNames: string[] = [];
  try {
    const rulesRaw = await new Promise<any[]>((resolve) => {
      chrome.storage.local.get(['semanticRules'], (result) => {
        const rules = Array.isArray(result.semanticRules) ? result.semanticRules.filter((r: any) => r.enabled) : [];
        console.log(`[Obfusca WebLLM] Loaded ${rules.length} semantic rules for validation`);
        resolve(rules);
      });
    });
    ruleNames = rulesRaw.map((r: any) => r.name);
  } catch (err) {
    console.log('[Obfusca WebLLM] Failed to load semantic rules:', err);
    return detections;
  }

  if (ruleNames.length === 0) {
    console.log('[Obfusca WebLLM] No semantic rules found, skipping validation');
    return detections;
  }

  // Build a compact list of detections for the model to review
  const items = detections.map((d, i) => ({
    i,
    label: d.displayName,
    value: text.substring(d.start, d.end).substring(0, 60),
  }));

  // Build dynamic rule list from dashboard
  const ruleList = [...new Set(ruleNames)].join(', ');

  const VALIDATE_PROMPT = `You are a data classification validator for a DLP system. The organization has these active detection rules:
${ruleList}

Review each detected item below. For each item, verify the "label" matches the correct rule from the list above.
Return a JSON array of corrections: [{"i":INDEX,"label":"CORRECT_RULE_NAME"}]
Only include items that need correction. If all labels are correct, return [].

CRITICAL: Be CONSERVATIVE. When in doubt, KEEP the detection — do NOT drop it.
Only use "drop" for items that are CLEARLY not sensitive: job titles (Senior Engineer), document headers (Candidate Assessment), common words.

NEVER drop: email addresses (contain @), phone numbers (digits with dashes/parens), dates (MM/DD/YYYY), real person names (First Last), currency amounts ($X), street addresses, SSNs, credit cards, medical records, passwords.

Only correct labels that are WRONG. If unsure, leave the item unchanged (do not include it in corrections array).

Items to review:
${JSON.stringify(items)}`;

  try {
    const response = await _engine.chat.completions.create({
      messages: [
        { role: 'system', content: VALIDATE_PROMPT },
        { role: 'user', content: 'Validate and return corrections as JSON array.' },
      ],
      temperature: 0.1,
      max_tokens: 800,
    });

    const output = response.choices[0]?.message?.content || '[]';
    console.log('[Obfusca WebLLM] Validation output:', output.substring(0, 200));

    // Parse corrections
    let corrections: any[] = [];
    try {
      const cleaned = output.replace(/\`\`\`json?/g, '').replace(/\`\`\`/g, '').trim();
      // Try parsing as array first
      const bracket = cleaned.indexOf('[');
      if (bracket !== -1) {
        const lastBracket = cleaned.lastIndexOf(']');
        if (lastBracket !== -1) {
          corrections = JSON.parse(cleaned.substring(bracket, lastBracket + 1));
        }
      }
    } catch {
      // Regex fallback
      const re = /\{"i"\s*:\s*(\d+)\s*,\s*"label"\s*:\s*"([^"]+)"\s*\}/g;
      let m;
      while ((m = re.exec(output)) !== null) {
        corrections.push({ i: parseInt(m[1]), label: m[2] });
      }
    }

    if (!Array.isArray(corrections) || corrections.length === 0) {
      console.log('[Obfusca WebLLM] No label corrections needed');
      return detections;
    }

    // Build reverse lookup: rule name -> DetectionType + severity
    const RULE_TO_TYPE: Record<string, { type: DetectionType; severity: Severity }> = {
      'Full Legal Name': { type: 'person_name' as DetectionType, severity: 'medium' as Severity },
      'Income/Salary Information': { type: 'financial' as DetectionType, severity: 'high' as Severity },
      'Medical Conditions': { type: 'medical_record' as DetectionType, severity: 'high' as Severity },
      'Medical Record Numbers': { type: 'medical_record' as DetectionType, severity: 'high' as Severity },
      'Health Insurance Information': { type: 'medical_record' as DetectionType, severity: 'high' as Severity },
      'Medications': { type: 'medical_record' as DetectionType, severity: 'medium' as Severity },
      'Passport Number': { type: 'identity_document' as DetectionType, severity: 'critical' as Severity },
      "Driver's License Number": { type: 'identity_document' as DetectionType, severity: 'critical' as Severity },
      'Social Security Number': { type: 'ssn' as DetectionType, severity: 'critical' as Severity },
      'Home Address': { type: 'address' as DetectionType, severity: 'medium' as Severity },
      'Personal Phone Number': { type: 'phone' as DetectionType, severity: 'medium' as Severity },
      'Personal Email Address': { type: 'email' as DetectionType, severity: 'low' as Severity },
      'IP Address': { type: 'ip_address' as DetectionType, severity: 'medium' as Severity },
      'Workplace/Employer': { type: 'organization' as DetectionType, severity: 'medium' as Severity },
      'Date of Birth': { type: 'date' as DetectionType, severity: 'medium' as Severity },
      'Passwords & Credentials': { type: 'api_key' as DetectionType, severity: 'critical' as Severity },
      'Credit Card Number': { type: 'credit_card' as DetectionType, severity: 'critical' as Severity },
      'Bank Account Number': { type: 'financial' as DetectionType, severity: 'critical' as Severity },
      'Tax Information': { type: 'financial' as DetectionType, severity: 'critical' as Severity },
      'Family Member Names': { type: 'person_name' as DetectionType, severity: 'medium' as Severity },
      "Children's Information": { type: 'person_name' as DetectionType, severity: 'high' as Severity },
      'Current Location': { type: 'address' as DetectionType, severity: 'medium' as Severity },
      'Username/Account Names': { type: 'email' as DetectionType, severity: 'medium' as Severity },
      'Sensitive Personal Beliefs': { type: 'custom' as DetectionType, severity: 'medium' as Severity },
    };

    let correctionCount = 0;
    let dropCount = 0;
    for (const c of corrections) {
      const idx = c.i;
      const newLabel = c.label;
      if (typeof idx !== 'number' || idx < 0 || idx >= detections.length) continue;

      if (newLabel === 'drop' || newLabel === 'none' || newLabel === 'false_positive' || newLabel === 'not_pii') {
        detections[idx].confidence = 0;
        dropCount++;
        console.log(`[Obfusca WebLLM] Dropping #${idx} (${detections[idx].displayName}: "${text.substring(detections[idx].start, detections[idx].end).substring(0, 30)}")`);
        continue;
      }

      const mapping = RULE_TO_TYPE[newLabel];
      if (mapping) {
        const oldLabel = detections[idx].displayName;
        detections[idx].type = mapping.type;
        detections[idx].displayName = newLabel;
        detections[idx].severity = mapping.severity;
        correctionCount++;
        console.log(`[Obfusca WebLLM] Relabeled #${idx}: "${oldLabel}" → "${newLabel}"`);
      }
    }

    const result = detections.filter(d => d.confidence > 0);
    console.log(`[Obfusca WebLLM] Validation: ${correctionCount} relabeled, ${dropCount} dropped, ${result.length} final`);
    return result;

  } catch (err) {
    console.log('[Obfusca WebLLM] Validation failed, keeping original labels:', err);
    return detections;
  }
}
