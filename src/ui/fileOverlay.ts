/**
 * File overlay UI components for Obfusca.
 * Shows when sensitive data is detected in uploaded files.
 * Updated to use the Obfusca dark design system.
 */

import type { FileAnalysisResult, FileDetection, FileScanError } from '../fileScanner';
import { OBFUSCA_STYLES, escapeHtml, addHoverEffect, getFooterBrandingHtml } from './styles';

const FILE_OVERLAY_ID = 'obfusca-file-overlay';

export interface FileOverlayOptions {
  onRemoveFile: () => void;
  onAllowAnyway: () => void;
  onDismiss: () => void;
}

/** Hardcoded fallback map for common type identifiers. */
const TYPE_LABEL_MAP: Record<string, string> = {
  ssn: 'Social Security Number',
  credit_card: 'Credit Card Number',
  aws_key: 'AWS Access Key',
  aws_secret: 'AWS Secret Key',
  api_key: 'API Key',
  private_key: 'Private Key',
  email: 'Email Address',
  phone: 'Phone Number',
  jwt: 'JWT Token',
  connection_string: 'Connection String',
  custom: 'Custom Pattern',
  passwords: 'Password',
  credentials: 'Credential',
  secret: 'Secret',
};

/**
 * Format an unknown type string into a readable label.
 * E.g. "aws_secret_key" -> "Aws Secret Key"
 */
function formatTypeString(type: string): string {
  return type.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Get human-readable detection type name from a detection object or raw type string.
 * Priority: display_name > hardcoded map > formatTypeString fallback.
 * Handles compound types like "PASSWORDS__CREDENTIALS" by splitting on "__".
 */
function getDetectionTypeName(detection: { type: string; display_name?: string | null } | string): string {
  // Accept either a detection object or a bare type string
  if (typeof detection === 'string') {
    const baseType = detection.split('__')[0].toLowerCase();
    return TYPE_LABEL_MAP[baseType] || TYPE_LABEL_MAP[detection.toLowerCase()] || formatTypeString(baseType);
  }

  // Prefer explicit display name from backend
  if (detection.display_name) return detection.display_name;

  // Handle compound types like "PASSWORDS__CREDENTIALS"
  const rawType = detection.type || '';
  const baseType = rawType.split('__')[0].toLowerCase();

  return TYPE_LABEL_MAP[baseType] || TYPE_LABEL_MAP[rawType.toLowerCase()] || formatTypeString(baseType);
}

/**
 * Get unique detection types from a list, preserving display_name.
 */
function getUniqueDetectionTypes(detections: FileDetection[]): { type: string; display_name?: string | null; severity: string; count: number }[] {
  const typeMap = new Map<string, { display_name?: string | null; severity: string; count: number }>();

  for (const detection of detections) {
    const existing = typeMap.get(detection.type);
    if (existing) {
      existing.count++;
      const severityOrder = ['critical', 'high', 'medium', 'low'];
      if (severityOrder.indexOf(detection.severity) < severityOrder.indexOf(existing.severity)) {
        existing.severity = detection.severity;
      }
      // Keep display_name if not already set
      if (!existing.display_name && detection.display_name) {
        existing.display_name = detection.display_name;
      }
    } else {
      typeMap.set(detection.type, { display_name: detection.display_name, severity: detection.severity, count: 1 });
    }
  }

  return Array.from(typeMap.entries()).map(([type, data]) => ({
    type,
    display_name: data.display_name,
    severity: data.severity,
    count: data.count,
  }));
}

/**
 * Truncate a filename for display.
 */
function truncateFilename(filename: string, maxLength: number): string {
  if (filename.length <= maxLength) return filename;

  const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
  const nameWithoutExt = filename.slice(0, filename.length - ext.length);
  const truncatedName = nameWithoutExt.slice(0, maxLength - ext.length - 3);

  return `${truncatedName}...${ext}`;
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} chars`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Create and show the file block overlay.
 * Shows when a file contains sensitive data.
 * Uses the Obfusca dark design system.
 */
export function showFileBlockOverlay(
  file: File,
  result: FileAnalysisResult,
  _anchorElement: HTMLElement,
  options: FileOverlayOptions
): HTMLElement {
  console.log('[Obfusca Files] showFileBlockOverlay START');

  // Remove any existing overlay
  hideFileOverlay();

  const container = document.createElement('div');
  container.id = FILE_OVERLAY_ID;
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
  `;

  const uniqueTypes = getUniqueDetectionTypes(result.detections);

  container.innerHTML = `
    <!-- Backdrop -->
    <div style="
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
    " id="obfusca-file-backdrop"></div>

    <!-- Card -->
    <div style="
      position: relative;
      background: ${OBFUSCA_STYLES.colors.card};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-radius: ${OBFUSCA_STYLES.radius['2xl']};
      box-shadow: ${OBFUSCA_STYLES.shadows.xl};
      max-width: 440px;
      width: 90vw;
      overflow: hidden;
    ">
      <!-- Header -->
      <div style="
        background: linear-gradient(135deg, ${OBFUSCA_STYLES.colors.destructive}15, transparent);
        border-bottom: 1px solid ${OBFUSCA_STYLES.colors.border};
        padding: 20px 24px;
      ">
        <div style="display: flex; align-items: center; gap: 14px;">
          <!-- File icon -->
          <div style="
            width: 44px;
            height: 44px;
            background: ${OBFUSCA_STYLES.colors.destructive}20;
            border-radius: ${OBFUSCA_STYLES.radius.lg};
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${OBFUSCA_STYLES.colors.destructive}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <div>
            <h2 style="
              margin: 0;
              font-size: 17px;
              font-weight: 600;
              color: ${OBFUSCA_STYLES.colors.foreground};
              letter-spacing: -0.02em;
            ">Sensitive Data in File</h2>
            <p style="
              margin: 4px 0 0 0;
              font-size: 13px;
              color: ${OBFUSCA_STYLES.colors.mutedForeground};
            " title="${escapeHtml(file.name)}">${escapeHtml(truncateFilename(file.name, 35))}</p>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div style="padding: 20px 24px;">
        <!-- File stats -->
        <div style="
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
          padding: 12px;
          background: ${OBFUSCA_STYLES.colors.secondary};
          border-radius: ${OBFUSCA_STYLES.radius.lg};
        ">
          <div>
            <div style="
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: ${OBFUSCA_STYLES.colors.ring};
              margin-bottom: 2px;
            ">File Type</div>
            <div style="
              font-size: 13px;
              font-weight: 500;
              color: ${OBFUSCA_STYLES.colors.foreground};
            ">${escapeHtml(result.fileType)}</div>
          </div>
          <div>
            <div style="
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: ${OBFUSCA_STYLES.colors.ring};
              margin-bottom: 2px;
            ">Analyzed</div>
            <div style="
              font-size: 13px;
              font-weight: 500;
              color: ${OBFUSCA_STYLES.colors.foreground};
            ">${formatBytes(result.extractedLength)}</div>
          </div>
        </div>

        <!-- Detection badges -->
        <div style="
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        ">
          ${uniqueTypes.map(item => `
            <span style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 6px 12px;
              background: ${OBFUSCA_STYLES.colors.obscured};
              border-radius: ${OBFUSCA_STYLES.radius.full};
              font-size: 13px;
              color: ${OBFUSCA_STYLES.colors.foreground};
            ">
              <span style="
                width: 6px;
                height: 6px;
                background: ${OBFUSCA_STYLES.colors.destructive};
                border-radius: 50%;
              "></span>
              ${escapeHtml(getDetectionTypeName(item))}${item.count > 1 ? ` (${item.count})` : ''}
            </span>
          `).join('')}
        </div>

        <!-- Message -->
        <p style="
          margin: 0;
          font-size: 14px;
          color: ${OBFUSCA_STYLES.colors.mutedForeground};
          line-height: 1.5;
        ">
          ${escapeHtml(result.message)}
        </p>
      </div>

      <!-- Footer Actions -->
      <div style="
        padding: 16px 24px;
        border-top: 1px solid ${OBFUSCA_STYLES.colors.border};
        display: flex;
        gap: 12px;
      ">
        <button id="obfusca-file-remove" style="
          flex: 1;
          padding: 12px 20px;
          background: ${OBFUSCA_STYLES.colors.foreground};
          color: ${OBFUSCA_STYLES.colors.background};
          border: none;
          border-radius: ${OBFUSCA_STYLES.radius.lg};
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        ">Remove File</button>

        <button id="obfusca-file-allow" style="
          padding: 12px 20px;
          background: transparent;
          color: ${OBFUSCA_STYLES.colors.destructive};
          border: 1px solid ${OBFUSCA_STYLES.colors.destructive}40;
          border-radius: ${OBFUSCA_STYLES.radius.lg};
          font-size: 14px;
          cursor: pointer;
          transition: background 0.15s;
        ">Upload Anyway</button>
      </div>

      <!-- Footer branding -->
      ${getFooterBrandingHtml()}
    </div>
  `;

  document.body.appendChild(container);

  // Event handlers
  document.getElementById('obfusca-file-backdrop')?.addEventListener('click', () => {
    hideFileOverlay();
    options.onDismiss();
  });

  document.getElementById('obfusca-file-remove')?.addEventListener('click', () => {
    hideFileOverlay();
    options.onRemoveFile();
  });

  document.getElementById('obfusca-file-allow')?.addEventListener('click', () => {
    if (confirm('Are you sure? This file contains sensitive data.')) {
      hideFileOverlay();
      options.onAllowAnyway();
    }
  });

  // Hover effects
  addHoverEffect('obfusca-file-remove', { opacity: '0.9' });
  addHoverEffect('obfusca-file-allow', { background: `${OBFUSCA_STYLES.colors.destructive}10` });

  // Escape key
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideFileOverlay();
      options.onDismiss();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Focus the remove button
  const removeBtn = document.getElementById('obfusca-file-remove') as HTMLButtonElement;
  removeBtn?.focus();

  console.log('[Obfusca Files] showFileBlockOverlay END');
  return container;
}

/**
 * Show warning overlay for files with medium-severity detections.
 */
export function showFileWarningOverlay(
  file: File,
  result: FileAnalysisResult,
  _anchorElement: HTMLElement,
  options: FileOverlayOptions
): HTMLElement {
  return showFileBlockOverlay(file, result, _anchorElement, options);
}

/**
 * Show error overlay when file scanning fails.
 */
export function showFileScanErrorOverlay(
  file: File,
  error: FileScanError,
  _anchorElement: HTMLElement,
  options: { onDismiss: () => void }
): HTMLElement {
  console.log('[Obfusca Files] showFileScanErrorOverlay START');

  hideFileOverlay();

  const container = document.createElement('div');
  container.id = FILE_OVERLAY_ID;
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
  `;

  const errorMessages: Record<string, string> = {
    unsupported: `File type "${file.name.split('.').pop()}" is not supported for scanning.`,
    too_large: `File is too large to scan (max 10MB).`,
    network: 'Could not connect to scanning service.',
    extraction: 'Could not extract text from file.',
    unknown: 'An unexpected error occurred.',
  };

  container.innerHTML = `
    <!-- Backdrop -->
    <div style="
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
    " id="obfusca-error-backdrop"></div>

    <!-- Card -->
    <div style="
      position: relative;
      background: ${OBFUSCA_STYLES.colors.card};
      border: 1px solid ${OBFUSCA_STYLES.colors.border};
      border-radius: ${OBFUSCA_STYLES.radius['2xl']};
      box-shadow: ${OBFUSCA_STYLES.shadows.xl};
      max-width: 400px;
      width: 90vw;
      overflow: hidden;
    ">
      <!-- Header -->
      <div style="
        padding: 20px 24px;
        border-bottom: 1px solid ${OBFUSCA_STYLES.colors.border};
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 40px;
            height: 40px;
            background: ${OBFUSCA_STYLES.colors.secondary};
            border-radius: ${OBFUSCA_STYLES.radius.lg};
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${OBFUSCA_STYLES.colors.warning}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <h2 style="
              margin: 0;
              font-size: 16px;
              font-weight: 600;
              color: ${OBFUSCA_STYLES.colors.foreground};
            ">Scan Error</h2>
            <p style="
              margin: 2px 0 0 0;
              font-size: 13px;
              color: ${OBFUSCA_STYLES.colors.mutedForeground};
            " title="${escapeHtml(file.name)}">${escapeHtml(truncateFilename(file.name, 35))}</p>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div style="padding: 20px 24px;">
        <p style="
          margin: 0 0 8px 0;
          font-size: 14px;
          color: ${OBFUSCA_STYLES.colors.foreground};
          line-height: 1.5;
        ">${errorMessages[error.code] || escapeHtml(error.message)}</p>
        <p style="
          margin: 0;
          font-size: 13px;
          color: ${OBFUSCA_STYLES.colors.mutedForeground};
        ">The file will be uploaded without scanning.</p>
      </div>

      <!-- Footer -->
      <div style="
        padding: 16px 24px;
        border-top: 1px solid ${OBFUSCA_STYLES.colors.border};
      ">
        <button id="obfusca-error-ok" style="
          width: 100%;
          padding: 12px 20px;
          background: ${OBFUSCA_STYLES.colors.foreground};
          color: ${OBFUSCA_STYLES.colors.background};
          border: none;
          border-radius: ${OBFUSCA_STYLES.radius.lg};
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        ">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  // Event handlers
  document.getElementById('obfusca-error-backdrop')?.addEventListener('click', () => {
    hideFileOverlay();
    options.onDismiss();
  });

  document.getElementById('obfusca-error-ok')?.addEventListener('click', () => {
    hideFileOverlay();
    options.onDismiss();
  });

  // Hover effect
  addHoverEffect('obfusca-error-ok', { opacity: '0.9' });

  // Escape key
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideFileOverlay();
      options.onDismiss();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  console.log('[Obfusca Files] showFileScanErrorOverlay END');
  return container;
}

/**
 * Hide and remove the file overlay.
 */
export function hideFileOverlay(): void {
  const existingOverlay = document.getElementById(FILE_OVERLAY_ID);
  if (existingOverlay) {
    existingOverlay.remove();
    console.log('[Obfusca Files] Overlay removed from DOM');
  }
}

/**
 * Check if a file overlay is currently visible.
 */
export function isFileOverlayVisible(): boolean {
  return document.getElementById(FILE_OVERLAY_ID) !== null;
}
