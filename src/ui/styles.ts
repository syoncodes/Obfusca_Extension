/**
 * Obfusca Design System
 * Shared style constants for consistent UI across all overlays.
 *
 * Enterprise-grade, shadcn-inspired dark design system.
 * Zinc-based monochrome palette with semantic accent colors.
 */

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

export const OBFUSCA_STYLES = {
  colors: {
    background: '#09090B',       // zinc-950
    foreground: '#FAFAFA',       // zinc-50
    card: '#18181B',             // zinc-900
    secondary: '#27272A',        // zinc-800 (used for muted surfaces)
    muted: '#27272A',            // zinc-800
    mutedForeground: '#A1A1AA',  // zinc-400
    border: '#27272A',           // zinc-800
    ring: '#FAFAFA',             // zinc-50
    obscured: '#3F3F46',         // zinc-700
    obscuredText: '#71717A',     // zinc-500

    // Semantic colors
    destructive: '#EF4444',      // red-500
    success: '#22C55E',          // green-500
    warning: '#F59E0B',          // amber-500
    info: '#3B82F6',             // blue-500

    // Primary / brand accent
    primary: '#8B5CF6',          // violet-500
    primaryForeground: '#FFFFFF',

    // Smart replacement / magic wand accent colors
    magicPrimary: '#8B5CF6',     // violet-500
    magicSecondary: '#6366F1',   // indigo-500
    magicGlow: 'rgba(139, 92, 246, 0.4)',
    accent: '#00D1D1',

    // Highlight colors for preview
    dummyHighlight: 'rgba(139, 92, 246, 0.25)',
    redactedHighlight: 'rgba(113, 113, 122, 0.25)',

    // Severity-specific gradient endpoints
    blockGradientStart: '#DC2626',
    blockGradientEnd: '#991B1B',
    warnGradientStart: '#F59E0B',
    warnGradientEnd: '#D97706',
    infoGradientStart: '#3B82F6',
    infoGradientEnd: '#1D4ED8',
  },
  radius: {
    sm: '6px',
    md: '8px',
    lg: '10px',
    xl: '14px',
    '2xl': '18px',
    full: '9999px',
  },
  fonts: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  },
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 16px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 40px rgba(0, 0, 0, 0.5)',
    xl: '0 20px 60px rgba(0, 0, 0, 0.6)',
  },
  transitions: {
    fast: '0.1s ease',
    base: '0.15s ease',
    smooth: '0.2s ease',
    slow: '0.3s ease',
  },
} as const;

// ---------------------------------------------------------------------------
// Base layout helpers
// ---------------------------------------------------------------------------

/**
 * Base overlay container styles
 */
export function getOverlayContainerStyles(): string {
  return `
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
}

/**
 * Backdrop styles
 */
export function getBackdropStyles(): string {
  return `
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(8px);
  `;
}

/**
 * Card/modal styles
 */
export function getCardStyles(): string {
  return `
    position: relative;
    background: ${OBFUSCA_STYLES.colors.card};
    border: 1px solid ${OBFUSCA_STYLES.colors.border};
    border-radius: ${OBFUSCA_STYLES.radius['2xl']};
    box-shadow: ${OBFUSCA_STYLES.shadows.xl};
    max-width: 480px;
    width: 90vw;
    max-height: 85vh;
    overflow: hidden;
  `;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape special regex characters
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Add hover effect to an element
 */
export function addHoverEffect(id: string, hoverStyles: Record<string, string>): void {
  const el = document.getElementById(id) as HTMLElement;
  if (!el) return;

  const originalStyles: Record<string, string> = {};
  for (const key of Object.keys(hoverStyles)) {
    originalStyles[key] = (el.style as any)[key];
  }

  el.addEventListener('mouseenter', () => {
    for (const [key, value] of Object.entries(hoverStyles)) {
      (el.style as any)[key] = value;
    }
  });

  el.addEventListener('mouseleave', () => {
    for (const [key, value] of Object.entries(originalStyles)) {
      (el.style as any)[key] = value;
    }
  });
}

/**
 * Mask a sensitive value for display
 */
export function maskValue(value: string, type: string): string {
  if (type === 'ssn' || type === 'credit_card') {
    return '\u2022\u2022\u2022' + value.slice(-4);
  } else if (type === 'email') {
    const parts = value.split('@');
    if (parts.length === 2) {
      return parts[0][0] + '\u2022\u2022\u2022@' + parts[1];
    }
    return '\u2022\u2022\u2022';
  } else if (type.includes('key') || type.includes('token') || type.includes('jwt')) {
    if (value.length > 12) return value.slice(0, 4) + '\u2022\u2022\u2022' + value.slice(-4);
    return '\u2022\u2022\u2022';
  }
  if (value.length > 6) return value.slice(0, 2) + '\u2022\u2022\u2022' + value.slice(-2);
  return '\u2022\u2022\u2022';
}

// ---------------------------------------------------------------------------
// Component factory functions
// ---------------------------------------------------------------------------

/**
 * Create a styled button element.
 *
 * @param variant - Button style variant
 * @param size - Button size
 */
export function createButton(
  label: string,
  opts: {
    variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    id?: string;
    icon?: string;
    disabled?: boolean;
  } = {}
): HTMLButtonElement {
  const {
    variant = 'primary',
    size = 'md',
    id,
    icon,
    disabled = false,
  } = opts;

  const btn = document.createElement('button');
  if (id) btn.id = id;
  if (disabled) btn.disabled = true;

  const sizePadding: Record<string, string> = {
    sm: '5px 10px',
    md: '10px 16px',
    lg: '12px 20px',
  };
  const sizeFontSize: Record<string, string> = {
    sm: '12px',
    md: '13px',
    lg: '14px',
  };

  let bg: string;
  let color: string;
  let border: string;
  let hoverBg: string;

  switch (variant) {
    case 'primary':
      bg = OBFUSCA_STYLES.colors.foreground;
      color = OBFUSCA_STYLES.colors.background;
      border = 'none';
      hoverBg = '#E4E4E7'; // zinc-200
      break;
    case 'secondary':
      bg = OBFUSCA_STYLES.colors.secondary;
      color = OBFUSCA_STYLES.colors.foreground;
      border = `1px solid ${OBFUSCA_STYLES.colors.border}`;
      hoverBg = '#3F3F46'; // zinc-700
      break;
    case 'outline':
      bg = 'transparent';
      color = OBFUSCA_STYLES.colors.foreground;
      border = `1px solid ${OBFUSCA_STYLES.colors.border}`;
      hoverBg = OBFUSCA_STYLES.colors.secondary;
      break;
    case 'destructive':
      bg = 'transparent';
      color = OBFUSCA_STYLES.colors.destructive;
      border = `1px solid ${OBFUSCA_STYLES.colors.destructive}`;
      hoverBg = `${OBFUSCA_STYLES.colors.destructive}15`;
      break;
    case 'ghost':
      bg = 'transparent';
      color = OBFUSCA_STYLES.colors.mutedForeground;
      border = 'none';
      hoverBg = OBFUSCA_STYLES.colors.secondary;
      break;
  }

  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: ${sizePadding[size]};
    font-size: ${sizeFontSize[size]};
    font-weight: 500;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    background: ${bg};
    color: ${color};
    border: ${border};
    border-radius: ${OBFUSCA_STYLES.radius.md};
    cursor: ${disabled ? 'not-allowed' : 'pointer'};
    opacity: ${disabled ? '0.5' : '1'};
    transition: all ${OBFUSCA_STYLES.transitions.base};
    white-space: nowrap;
    user-select: none;
    line-height: 1;
  `;

  if (icon) {
    btn.innerHTML = `${icon}<span>${escapeHtml(label)}</span>`;
  } else {
    btn.textContent = label;
  }

  // Hover effects
  if (!disabled) {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = hoverBg;
      if (variant === 'primary') btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = bg;
      btn.style.transform = '';
    });
  }

  return btn;
}

/**
 * Create a badge element.
 */
export function createBadge(
  label: string,
  opts: {
    variant?: 'default' | 'destructive' | 'warning' | 'success' | 'info' | 'primary' | 'outline';
    size?: 'sm' | 'md';
  } = {}
): HTMLSpanElement {
  const { variant = 'default', size = 'sm' } = opts;

  const badge = document.createElement('span');

  const colorMap: Record<string, { bg: string; color: string; border?: string }> = {
    default: { bg: OBFUSCA_STYLES.colors.secondary, color: OBFUSCA_STYLES.colors.mutedForeground },
    destructive: { bg: `${OBFUSCA_STYLES.colors.destructive}20`, color: OBFUSCA_STYLES.colors.destructive },
    warning: { bg: `${OBFUSCA_STYLES.colors.warning}20`, color: OBFUSCA_STYLES.colors.warning },
    success: { bg: `${OBFUSCA_STYLES.colors.success}20`, color: OBFUSCA_STYLES.colors.success },
    info: { bg: `${OBFUSCA_STYLES.colors.info}20`, color: OBFUSCA_STYLES.colors.info },
    primary: { bg: `${OBFUSCA_STYLES.colors.primary}20`, color: OBFUSCA_STYLES.colors.primary },
    outline: { bg: 'transparent', color: OBFUSCA_STYLES.colors.mutedForeground, border: `1px solid ${OBFUSCA_STYLES.colors.border}` },
  };

  const c = colorMap[variant] || colorMap.default;
  const padding = size === 'sm' ? '2px 8px' : '4px 10px';
  const fontSize = size === 'sm' ? '10px' : '12px';

  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: ${padding};
    font-size: ${fontSize};
    font-weight: 500;
    font-family: ${OBFUSCA_STYLES.fonts.sans};
    background: ${c.bg};
    color: ${c.color};
    border: ${c.border || 'none'};
    border-radius: ${OBFUSCA_STYLES.radius.full};
    white-space: nowrap;
    letter-spacing: 0.3px;
    line-height: 1.4;
    text-transform: uppercase;
  `;
  badge.textContent = label;

  return badge;
}

/**
 * Create a styled checkbox element with custom appearance.
 */
export function createCheckbox(
  checked: boolean,
  opts: {
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
  } = {}
): HTMLInputElement {
  const { disabled = false, onChange } = opts;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.disabled = disabled;

  cb.style.cssText = `
    width: 16px;
    height: 16px;
    accent-color: ${OBFUSCA_STYLES.colors.primary};
    cursor: ${disabled ? 'not-allowed' : 'pointer'};
    flex-shrink: 0;
    margin: 0;
  `;

  if (onChange) {
    cb.addEventListener('change', () => onChange(cb.checked));
  }

  return cb;
}

// ---------------------------------------------------------------------------
// Animation styles injection
// ---------------------------------------------------------------------------

const ANIMATION_STYLE_ID = 'obfusca-design-system-animations';

/**
 * Inject global animation keyframes into the document.
 * Called once; subsequent calls are no-ops.
 */
export function injectAnimationStyles(): void {
  if (document.getElementById(ANIMATION_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = ANIMATION_STYLE_ID;
  style.textContent = `
    @keyframes obfusca-popup-enter {
      from {
        opacity: 0;
        clip-path: inset(100% 0 0 0);
      }
      to {
        opacity: 1;
        clip-path: inset(0% 0 0 0);
      }
    }

    @keyframes obfusca-popup-exit {
      from {
        opacity: 1;
        clip-path: inset(0% 0 0 0);
      }
      to {
        opacity: 0;
        clip-path: inset(100% 0 0 0);
      }
    }

    @keyframes obfusca-slide-up {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes obfusca-slide-down {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(12px);
      }
    }

    @keyframes obfusca-highlight-pulse {
      0% { background-color: rgba(139, 92, 246, 0.3); }
      50% { background-color: rgba(139, 92, 246, 0.15); }
      100% { background-color: rgba(139, 92, 246, 0.3); }
    }

    @keyframes obfusca-toast-enter {
      from {
        opacity: 0;
        transform: translateX(100%) translateY(0);
      }
      to {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }
    }

    @keyframes obfusca-toast-exit {
      from {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }
      to {
        opacity: 0;
        transform: translateX(100%) translateY(0);
      }
    }

    @keyframes obfusca-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    @keyframes obfusca-success-flash {
      0% { background-color: rgba(34, 197, 94, 0.2); }
      100% { background-color: transparent; }
    }

    @keyframes obfusca-error-flash {
      0% { background-color: rgba(239, 68, 68, 0.25); }
      50% { background-color: rgba(239, 68, 68, 0.15); }
      100% { background-color: transparent; }
    }

    @keyframes obfusca-fade-in {
      from { opacity: 0; transform: translateY(2px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes obfusca-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes obfusca-progress-bar {
      0% { width: 0%; }
      100% { width: 100%; }
    }

    @keyframes obfusca-wand-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes obfusca-wand-pulse {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 1; }
    }

    @keyframes obfusca-sparkle-burst {
      0% { transform: scale(0); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.8; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    @keyframes obfusca-typewriter-cursor {
      0%, 100% { border-right-color: transparent; }
      50% { border-right-color: ${OBFUSCA_STYLES.colors.magicPrimary}; }
    }
  `;

  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

/** Shield icon for headers */
export const ICON_SHIELD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
</svg>`;

/** Shield with alert */
export const ICON_SHIELD_ALERT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
  <line x1="12" y1="8" x2="12" y2="12"/>
  <line x1="12" y1="16" x2="12.01" y2="16"/>
</svg>`;

/** Shield with check */
export const ICON_SHIELD_CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
  <path d="m9 12 2 2 4-4"/>
</svg>`;

/** Close X icon */
export const ICON_X = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="18" y1="6" x2="6" y2="18"/>
  <line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

/** Checkmark icon */
export const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="m5 12 5 5L20 7"/>
</svg>`;

/** File icon */
export const ICON_FILE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
</svg>`;

/** Download icon */
export const ICON_DOWNLOAD = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" y1="15" x2="12" y2="3"/>
</svg>`;

/** Arrow right icon */
export const ICON_ARROW_RIGHT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <line x1="5" y1="12" x2="19" y2="12"/>
  <polyline points="12 5 19 12 12 19"/>
</svg>`;

/** Info circle icon */
export const ICON_INFO = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <line x1="12" y1="16" x2="12" y2="12"/>
  <line x1="12" y1="8" x2="12.01" y2="8"/>
</svg>`;

/** Spinner icon */
export const ICON_SPINNER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: obfusca-spin 1s linear infinite;">
  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
</svg>`;

/** Enter/Return key icon (CornerDownLeft from lucide) */
export const ICON_ENTER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="9 10 4 15 9 20"/>
  <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
</svg>`;

/**
 * SVG icon for the magic wand button.
 */
export const MAGIC_WAND_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M15 4V2"/>
  <path d="M15 16v-2"/>
  <path d="M8 9h2"/>
  <path d="M20 9h2"/>
  <path d="M17.8 11.8L19 13"/>
  <path d="M15 9h0"/>
  <path d="M17.8 6.2L19 5"/>
  <path d="M3 21l9-9"/>
  <path d="M12.2 6.2L11 5"/>
</svg>`;

/**
 * Official Obfusca Icon SVG (fingerprint pattern) for footer branding
 * Use at 14px height in overlay footers
 */
export const OBFUSCA_ICON_SVG = `
<svg viewBox="0 0 375 375" fill="currentColor" style="width: 14px; height: 14px;">
  <path d="M 107.003906 288.296875 L 107.039062 288.035156 C 108.871094 279.472656 113.992188 272.40625 120.835938 267.957031 C 127.675781 263.507812 136.164062 261.675781 144.765625 263.507812 C 153.324219 265.339844 160.390625 270.464844 164.804688 277.304688 C 169.214844 284.109375 171.046875 292.558594 169.289062 301.085938 L 169.253906 301.234375 C 166.710938 313.234375 163.644531 325.050781 160.054688 336.640625 C 156.464844 348.34375 152.351562 359.78125 147.753906 370.960938 C 146.632812 373.652344 143.566406 374.960938 140.875 373.839844 C 138.183594 372.71875 136.875 369.652344 137.996094 366.960938 C 142.445312 356.117188 146.445312 344.976562 149.960938 333.574219 C 153.398438 322.394531 156.390625 310.878906 158.894531 299.101562 C 160.09375 293.382812 158.894531 287.699219 155.941406 283.136719 C 152.988281 278.578125 148.277344 275.175781 142.558594 273.941406 C 136.835938 272.746094 131.117188 273.941406 126.59375 276.894531 C 122.105469 279.8125 118.742188 284.410156 117.46875 290.015625 L 117.433594 290.277344 C 116.648438 293.941406 115.789062 297.71875 114.851562 301.496094 C 113.917969 305.308594 112.945312 309.011719 111.9375 312.636719 C 111.152344 315.441406 108.234375 317.085938 105.433594 316.300781 C 102.628906 315.515625 100.984375 312.601562 101.769531 309.796875 C 102.777344 306.167969 103.75 302.542969 104.609375 298.992188 C 105.433594 295.511719 106.21875 291.960938 107.003906 288.296875 Z M 350.769531 339.707031 C 349.761719 344.492188 348.601562 349.613281 347.292969 355.035156 C 345.984375 360.566406 344.675781 365.652344 343.441406 370.289062 C 342.695312 373.09375 339.777344 374.777344 336.976562 374.027344 C 334.132812 373.28125 332.488281 370.363281 333.234375 367.558594 C 334.65625 362.214844 335.929688 357.203125 337.050781 352.605469 C 338.171875 347.96875 339.292969 342.921875 340.453125 337.5 C 341.910156 330.65625 342.992188 323.851562 343.742188 317.046875 C 344.527344 310.09375 344.9375 303.214844 344.976562 296.484375 C 344.976562 296 345.050781 295.550781 345.164062 295.101562 C 345.050781 294.652344 344.976562 294.167969 344.976562 293.679688 C 344.789062 245.601562 327.738281 199.988281 298.429688 163.984375 C 269.675781 128.652344 229.109375 102.554688 181.066406 92.386719 C 171.570312 90.367188 162.113281 89.058594 152.691406 88.386719 C 143.082031 87.710938 133.546875 87.710938 124.164062 88.308594 C 121.246094 88.496094 118.742188 86.292969 118.515625 83.375 C 118.332031 80.457031 120.535156 77.953125 123.453125 77.730469 C 133.324219 77.054688 143.34375 77.054688 153.4375 77.804688 C 163.308594 78.515625 173.289062 79.898438 183.273438 82.027344 C 233.746094 92.722656 276.40625 120.164062 306.652344 157.328125 C 337.460938 195.164062 355.371094 243.132812 355.554688 293.71875 C 355.554688 294.203125 355.480469 294.691406 355.371094 295.140625 C 355.519531 295.589844 355.554688 296.113281 355.554688 296.597656 C 355.480469 303.851562 355.070312 311.066406 354.285156 318.246094 C 353.425781 325.347656 352.304688 332.527344 350.769531 339.707031 Z M 324.859375 334.210938 C 323.589844 340.230469 322.207031 346.285156 320.671875 352.378906 C 319.179688 358.472656 317.609375 364.492188 315.925781 370.363281 C 315.140625 373.167969 312.222656 374.8125 309.417969 374.027344 C 306.617188 373.242188 304.96875 370.328125 305.753906 367.523438 C 307.402344 361.613281 308.972656 355.746094 310.429688 349.875 C 311.851562 344.082031 313.234375 338.097656 314.503906 332.003906 C 318.019531 315.367188 319.140625 298.765625 318.054688 282.578125 C 316.933594 265.902344 313.496094 249.636719 308 234.199219 C 307.027344 231.429688 308.449219 228.402344 311.214844 227.429688 C 313.980469 226.457031 317.007812 227.878906 317.980469 230.644531 C 323.8125 246.945312 327.441406 264.21875 328.636719 281.941406 C 329.757812 299.027344 328.5625 316.601562 324.859375 334.210938 Z M 287.847656 329.871094 C 288.445312 327.03125 291.285156 325.199219 294.128906 325.796875 C 296.96875 326.433594 298.800781 329.238281 298.203125 332.078125 C 296.859375 338.246094 295.324219 344.640625 293.605469 351.332031 C 291.921875 357.949219 290.164062 364.308594 288.332031 370.402344 C 287.511719 373.207031 284.558594 374.8125 281.753906 373.992188 C 278.949219 373.167969 277.339844 370.214844 278.164062 367.410156 C 280.03125 361.054688 281.789062 354.808594 283.359375 348.714844 C 284.894531 342.808594 286.390625 336.527344 287.847656 329.871094 Z M 273.003906 323.179688 C 271.320312 331.070312 269.453125 339.03125 267.359375 346.996094 C 265.265625 355.035156 262.984375 362.847656 260.589844 370.476562 C 259.730469 373.242188 256.742188 374.8125 253.972656 373.953125 C 251.167969 373.09375 249.636719 370.101562 250.496094 367.335938 C 252.890625 359.671875 255.132812 351.96875 257.113281 344.34375 C 259.097656 336.753906 260.929688 328.976562 262.648438 321.011719 C 265.003906 309.796875 265.863281 298.617188 265.265625 287.699219 C 264.667969 276.445312 262.535156 265.453125 259.097656 254.949219 C 258.199219 252.179688 259.730469 249.191406 262.5 248.292969 C 265.265625 247.394531 268.253906 248.929688 269.152344 251.695312 C 272.890625 263.023438 275.171875 274.949219 275.808594 287.175781 C 276.445312 298.992188 275.546875 311.105469 273.003906 323.179688 Z M 247.09375 317.570312 L 247.058594 317.722656 C 245.148438 326.808594 242.980469 335.707031 240.625 344.378906 C 238.308594 352.980469 235.652344 361.726562 232.699219 370.589844 C 231.800781 373.355469 228.8125 374.851562 226.042969 373.953125 C 223.277344 373.054688 221.78125 370.066406 222.679688 367.296875 C 225.410156 359.109375 227.988281 350.546875 230.417969 341.648438 C 232.773438 332.976562 234.867188 324.265625 236.738281 315.554688 C 242.496094 288.335938 236.699219 261.378906 222.644531 239.769531 C 208.585938 218.15625 186.300781 201.894531 159.082031 196.136719 C 148.953125 194.003906 138.894531 193.445312 129.171875 194.304688 C 119.078125 195.203125 109.320312 197.632812 100.121094 201.410156 C 97.429688 202.492188 94.328125 201.222656 93.242188 198.53125 C 92.121094 195.835938 93.429688 192.734375 96.121094 191.648438 C 106.253906 187.5 117.097656 184.808594 128.277344 183.796875 C 139.082031 182.828125 150.183594 183.425781 161.289062 185.78125 C 191.347656 192.136719 215.988281 210.121094 231.539062 234.011719 C 246.980469 257.789062 253.414062 287.550781 247.09375 317.570312 Z M 221.148438 312.226562 C 219.015625 322.207031 216.585938 332.042969 213.855469 341.761719 C 211.089844 351.558594 208.023438 361.242188 204.660156 370.699219 C 203.6875 373.46875 200.660156 374.886719 197.929688 373.914062 C 195.164062 372.945312 193.742188 369.914062 194.714844 367.1875 C 198.003906 357.914062 200.996094 348.492188 203.6875 338.921875 C 206.339844 329.460938 208.734375 319.816406 210.789062 310.058594 C 213.59375 296.785156 212.660156 283.585938 208.695312 271.546875 C 204.585938 259.097656 197.257812 247.882812 187.421875 239.171875 C 185.253906 237.226562 185.03125 233.859375 186.972656 231.691406 C 188.917969 229.523438 192.246094 229.300781 194.453125 231.242188 C 205.667969 241.226562 214.042969 254.011719 218.753906 268.21875 C 223.277344 281.941406 224.363281 297.046875 221.148438 312.226562 Z M 183.234375 311.738281 C 183.871094 308.898438 186.714844 307.105469 189.554688 307.777344 C 192.394531 308.414062 194.191406 311.253906 193.515625 314.09375 C 191.3125 323.703125 188.769531 333.273438 185.851562 342.773438 C 182.9375 352.417969 179.722656 361.765625 176.320312 370.8125 C 175.273438 373.542969 172.207031 374.925781 169.476562 373.878906 C 166.746094 372.832031 165.363281 369.765625 166.410156 367.035156 C 169.851562 357.949219 172.992188 348.828125 175.757812 339.707031 C 178.5625 330.65625 181.066406 321.3125 183.234375 311.738281 Z M 132.988281 293.53125 C 133.585938 290.691406 136.390625 288.859375 139.269531 289.457031 C 142.109375 290.054688 143.941406 292.859375 143.34375 295.738281 C 140.578125 308.785156 137.136719 321.609375 133.097656 334.097656 C 128.984375 346.773438 124.238281 359.109375 118.929688 371.074219 C 117.730469 373.730469 114.628906 374.925781 111.9375 373.730469 C 109.28125 372.53125 108.085938 369.429688 109.28125 366.738281 C 114.441406 355.148438 119.039062 343.144531 123.042969 330.84375 C 126.96875 318.769531 130.292969 306.320312 132.988281 293.53125 Z M 95.1875 330.507812 C 96.160156 327.742188 99.152344 326.285156 101.917969 327.253906 C 104.683594 328.226562 106.140625 331.21875 105.171875 333.984375 C 102.890625 340.453125 100.496094 346.734375 97.917969 352.867188 C 95.261719 359.183594 92.496094 365.316406 89.617188 371.261719 C 88.34375 373.914062 85.167969 375 82.550781 373.730469 C 79.933594 372.457031 78.8125 369.28125 80.121094 366.664062 C 83 360.753906 85.691406 354.808594 88.195312 348.828125 C 90.699219 342.695312 93.054688 336.601562 95.1875 330.507812 Z M 91.523438 284.519531 L 91.484375 284.746094 C 88.234375 300.113281 83.933594 314.992188 78.660156 329.3125 C 73.316406 343.929688 66.960938 357.988281 59.707031 371.410156 C 58.324219 373.992188 55.109375 374.960938 52.527344 373.578125 C 49.949219 372.195312 48.976562 368.980469 50.359375 366.402344 C 57.351562 353.425781 63.519531 339.816406 68.71875 325.648438 C 73.765625 311.851562 77.914062 297.53125 81.054688 282.765625 L 81.09375 282.539062 C 84.417969 266.800781 93.839844 253.902344 106.367188 245.75 C 118.890625 237.601562 134.480469 234.234375 150.222656 237.601562 C 163.195312 240.367188 174.261719 247.246094 182.339844 256.628906 C 190.5625 266.203125 195.609375 278.351562 196.359375 291.289062 C 196.507812 294.203125 194.300781 296.710938 191.386719 296.859375 C 188.46875 297.007812 185.964844 294.765625 185.816406 291.886719 C 185.21875 281.304688 181.066406 271.359375 174.335938 263.507812 C 167.757812 255.882812 158.710938 250.238281 148.089844 247.992188 C 135.191406 245.265625 122.40625 248.03125 112.160156 254.6875 C 101.992188 261.230469 94.289062 271.734375 91.523438 284.519531 Z M 65.613281 279.027344 L 65.578125 279.25 C 62.0625 295.773438 57.277344 311.703125 51.257812 326.882812 C 45.125 342.472656 37.722656 357.316406 29.273438 371.296875 C 27.777344 373.804688 24.523438 374.625 22.019531 373.09375 C 19.515625 371.597656 18.691406 368.34375 20.226562 365.839844 C 28.375 352.34375 35.515625 338.023438 41.421875 323.03125 C 47.179688 308.414062 51.816406 293.121094 55.183594 277.269531 L 55.21875 277.042969 C 60.082031 254.164062 73.765625 235.355469 91.972656 223.542969 C 110.179688 211.726562 132.875 206.828125 155.792969 211.652344 C 159.15625 212.363281 162.410156 213.261719 165.589844 214.34375 C 168.765625 215.429688 171.871094 216.699219 174.9375 218.195312 C 177.554688 219.464844 178.675781 222.605469 177.402344 225.222656 C 176.132812 227.839844 172.992188 228.964844 170.375 227.730469 C 167.792969 226.496094 165.066406 225.375 162.1875 224.402344 C 159.417969 223.46875 156.539062 222.683594 153.585938 222.046875 C 133.511719 217.785156 113.65625 222.082031 97.730469 232.441406 C 81.839844 242.722656 69.875 259.058594 65.613281 279.027344 Z M 39.667969 273.566406 L 39.628906 273.714844 C 38.359375 279.699219 36.898438 285.605469 35.253906 291.4375 C 33.574219 297.382812 31.742188 303.179688 29.722656 308.785156 C 28.75 311.554688 25.722656 312.972656 22.953125 312 C 20.1875 311.03125 18.765625 308 19.738281 305.234375 C 21.71875 299.699219 23.476562 294.167969 25.046875 288.597656 C 26.617188 283.0625 28 277.417969 29.234375 271.734375 L 29.273438 271.546875 C 32.339844 257.078125 38.097656 243.878906 45.871094 232.367188 C 53.949219 220.402344 64.269531 210.195312 76.121094 202.269531 C 78.550781 200.660156 81.839844 201.296875 83.449219 203.726562 C 85.054688 206.15625 84.417969 209.445312 81.988281 211.054688 C 71.335938 218.234375 61.988281 227.429688 54.660156 238.308594 C 47.628906 248.667969 42.433594 260.554688 39.667969 273.566406 Z M 176.058594 10.878906 C 173.179688 10.507812 171.121094 7.8125 171.535156 4.933594 C 171.90625 2.054688 174.597656 0 177.476562 0.410156 C 182.414062 1.085938 187.347656 1.871094 192.320312 2.804688 C 197.480469 3.777344 202.378906 4.785156 207.050781 5.90625 C 209.894531 6.582031 211.652344 9.421875 210.976562 12.300781 C 210.304688 15.140625 207.464844 16.898438 204.585938 16.226562 C 199.648438 15.066406 194.9375 14.058594 190.414062 13.199219 C 185.667969 12.261719 180.878906 11.515625 176.058594 10.878906 Z M 143.195312 34.84375 C 140.277344 34.808594 137.960938 32.378906 138.035156 29.460938 C 138.070312 26.546875 140.5 24.226562 143.417969 24.300781 C 158.449219 24.601562 173.289062 26.132812 187.796875 28.863281 C 202.492188 31.59375 216.886719 35.554688 230.792969 40.601562 C 233.523438 41.613281 234.941406 44.640625 233.972656 47.371094 C 232.960938 50.101562 229.933594 51.519531 227.203125 50.546875 C 213.820312 45.6875 199.984375 41.875 185.890625 39.257812 C 171.871094 36.640625 157.585938 35.144531 143.195312 34.84375 Z M 247.46875 58.960938 C 244.8125 57.726562 243.65625 54.585938 244.886719 51.933594 C 246.121094 49.277344 249.261719 48.117188 251.917969 49.351562 C 272.03125 58.660156 290.988281 70.476562 308.371094 84.570312 C 325.460938 98.40625 340.976562 114.480469 354.472656 132.503906 C 356.230469 134.820312 355.742188 138.148438 353.425781 139.90625 C 351.105469 141.664062 347.78125 141.175781 346.023438 138.859375 C 333.050781 121.546875 318.132812 106.105469 301.679688 92.757812 C 285.042969 79.261719 266.835938 67.933594 247.46875 58.960938 Z M 103.414062 63.933594 C 100.535156 64.382812 97.804688 62.363281 97.394531 59.484375 C 96.945312 56.605469 98.964844 53.875 101.84375 53.464844 C 130.816406 49.089844 159.71875 50.0625 187.386719 55.78125 C 215.6875 61.613281 242.644531 72.457031 266.984375 87.636719 C 269.453125 89.171875 270.238281 92.460938 268.667969 94.925781 C 267.132812 97.394531 263.84375 98.179688 261.375 96.609375 C 238.046875 82.066406 212.25 71.710938 185.21875 66.140625 C 158.859375 60.644531 131.191406 59.746094 103.414062 63.933594 Z M 279.210938 108.835938 C 276.890625 107.078125 276.445312 103.75 278.199219 101.433594 C 279.957031 99.113281 283.285156 98.667969 285.605469 100.421875 C 299.960938 111.339844 313.160156 123.828125 324.898438 137.8125 C 336.375 151.496094 346.507812 166.601562 354.957031 183.011719 C 356.304688 185.59375 355.257812 188.808594 352.675781 190.117188 C 350.097656 191.464844 346.882812 190.417969 345.535156 187.835938 C 337.460938 172.171875 327.777344 157.703125 316.746094 144.578125 C 305.492188 131.15625 292.855469 119.191406 279.210938 108.835938 Z M 27.554688 119.976562 C 25.085938 121.546875 21.832031 120.800781 20.261719 118.332031 C 18.691406 115.863281 19.441406 112.613281 21.90625 111.042969 C 33.910156 103.414062 46.695312 96.984375 60.003906 91.824219 C 73.242188 86.703125 86.960938 82.890625 101.058594 80.421875 C 103.9375 79.933594 106.664062 81.878906 107.152344 84.757812 C 107.636719 87.636719 105.695312 90.367188 102.816406 90.851562 C 89.390625 93.171875 76.304688 96.835938 63.78125 101.65625 C 51.183594 106.59375 38.992188 112.722656 27.554688 119.976562 Z M 27.964844 152.019531 C 25.644531 153.8125 22.320312 153.363281 20.5625 151.085938 C 18.765625 148.765625 19.214844 145.4375 21.496094 143.679688 C 31.742188 135.753906 42.507812 129.0625 53.613281 123.566406 C 94.101562 103.488281 139.15625 99.113281 180.957031 108.761719 C 222.792969 118.40625 261.414062 142 289.042969 177.816406 C 296.632812 187.648438 303.363281 198.378906 309.121094 209.96875 C 310.390625 212.585938 309.34375 215.765625 306.726562 217.035156 C 304.109375 218.308594 300.933594 217.261719 299.660156 214.644531 C 294.203125 203.6875 287.847656 193.558594 280.707031 184.285156 C 254.609375 150.484375 218.117188 128.203125 178.601562 119.082031 C 139.082031 109.996094 96.535156 114.070312 58.285156 133.0625 C 47.816406 138.183594 37.648438 144.542969 27.964844 152.019531 Z M 28.523438 186.863281 C 26.46875 188.957031 23.140625 188.957031 21.046875 186.9375 C 18.953125 184.882812 18.953125 181.554688 20.972656 179.460938 C 47.179688 152.839844 80.605469 136.726562 115.527344 131.867188 C 150.558594 126.96875 187.085938 133.398438 219.425781 151.757812 C 221.96875 153.179688 222.867188 156.429688 221.410156 158.972656 C 219.949219 161.515625 216.734375 162.414062 214.191406 160.953125 C 183.945312 143.757812 149.738281 137.773438 116.945312 142.335938 C 84.269531 146.898438 53.015625 161.964844 28.523438 186.863281 Z M 231.203125 172.171875 C 228.886719 170.414062 228.4375 167.085938 230.195312 164.769531 C 231.953125 162.449219 235.28125 162 237.597656 163.757812 C 259.992188 180.808594 277.566406 203.316406 288.746094 228.851562 C 299.699219 253.824219 304.484375 281.71875 301.753906 310.28125 C 301.492188 313.199219 298.914062 315.328125 295.996094 315.03125 C 293.082031 314.769531 290.949219 312.1875 291.25 309.273438 C 293.828125 282.578125 289.304688 256.441406 279.097656 233.074219 C 268.59375 209.183594 252.140625 188.136719 231.203125 172.171875 Z M 29.273438 228.777344 C 27.777344 231.28125 24.523438 232.105469 22.019531 230.570312 C 19.515625 229.074219 18.691406 225.824219 20.226562 223.316406 C 35.179688 198.605469 57.464844 179.425781 83.523438 168.132812 C 108.871094 157.140625 137.734375 153.664062 166.785156 159.796875 C 187.125 164.09375 205.480469 172.730469 221.109375 184.472656 C 237.296875 196.660156 250.535156 212.289062 259.957031 229.972656 C 261.339844 232.550781 260.328125 235.769531 257.75 237.152344 C 255.171875 238.535156 251.953125 237.523438 250.570312 234.945312 C 241.898438 218.605469 229.671875 204.175781 214.714844 192.921875 C 200.320312 182.078125 183.386719 174.113281 164.578125 170.152344 C 137.734375 164.46875 111.078125 167.683594 87.710938 177.816406 C 63.667969 188.210938 43.070312 205.933594 29.273438 228.777344 Z" fill-opacity="1" fill-rule="nonzero"/>
</svg>`;

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

/**
 * Footer branding HTML for overlays
 */
export function getFooterBrandingHtml(): string {
  return `
    <div style="
      padding: 12px 24px;
      border-top: 1px solid ${OBFUSCA_STYLES.colors.border};
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: ${OBFUSCA_STYLES.colors.mutedForeground};
    ">
      ${OBFUSCA_ICON_SVG}
      <span style="
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">Protected by Obfusca</span>
    </div>
  `;
}

/**
 * Returns the CSS keyframes and classes for magic wand animations.
 * @deprecated Use injectAnimationStyles() instead
 */
export function getMagicWandAnimationStyles(): string {
  return `
    @keyframes obfusca-wand-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes obfusca-wand-pulse {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 1; }
    }

    @keyframes obfusca-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    @keyframes obfusca-sparkle-burst {
      0% { transform: scale(0); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.8; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    @keyframes obfusca-typewriter-cursor {
      0%, 100% { border-right-color: transparent; }
      50% { border-right-color: ${OBFUSCA_STYLES.colors.magicPrimary}; }
    }

    @keyframes obfusca-success-flash {
      0% { background-color: rgba(34, 197, 94, 0.2); }
      100% { background-color: transparent; }
    }

    @keyframes obfusca-error-flash {
      0% { background-color: rgba(239, 68, 68, 0.25); }
      50% { background-color: rgba(239, 68, 68, 0.15); }
      100% { background-color: transparent; }
    }

    @keyframes obfusca-fade-in {
      from { opacity: 0; transform: translateY(2px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes obfusca-progress-bar {
      0% { width: 0%; }
      100% { width: 100%; }
    }
  `;
}
