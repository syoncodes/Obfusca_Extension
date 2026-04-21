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

const SYSTEM_PROMPT = `You are a PII classification API. Given text, return a JSON array of sensitive items found.

Format: [{"type":"name","value":"Dr. Sarah Chen"},{"type":"money","value":"$185,000"}]

Types: name, money, medical, id_doc, addr, dob, ip

Return ONLY the JSON array.`;

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

    const response = await _engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
      name: 'person_name' as DetectionType,
      person_name: 'person_name' as DetectionType,
      money: 'financial' as DetectionType,
      financial: 'financial' as DetectionType,
      medical: 'medical_record' as DetectionType,
      medical_record: 'medical_record' as DetectionType,
      medical_condition: 'medical_record' as DetectionType,
      id_doc: 'identity_document' as DetectionType,
      identity_document: 'identity_document' as DetectionType,
      addr: 'address' as DetectionType,
      address: 'address' as DetectionType,
      phone: 'phone' as DetectionType,
      email: 'email' as DetectionType,
      dob: 'date' as DetectionType,
      date_of_birth: 'date' as DetectionType,
      ip: 'ip_address' as DetectionType,
      ip_address: 'ip_address' as DetectionType,
      credential: 'api_key' as DetectionType,
      organization: 'organization' as DetectionType,
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
      person_name: 'Person Name',
      financial: 'Financial Information',
      medical_record: 'Medical Record',
      medical_condition: 'Medical Condition',
      identity_document: 'Identity Document',
      address: 'Physical Address',
      phone: 'Phone Number',
      email: 'Email Address',
      date_of_birth: 'Date of Birth',
      ip_address: 'IP Address',
      credential: 'Credential / Secret',
      organization: 'Organization Name',
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
