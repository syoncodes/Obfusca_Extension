/**
 * Obfusca UI Components
 * Central export for all overlay and toast components.
 */

// Design system
export { OBFUSCA_STYLES, escapeHtml, maskValue } from './styles';

// Block overlay - full modal for blocking mode
export { showBlockOverlay, removeBlockOverlay, isBlockOverlayVisible } from './blockOverlay';
export type { BlockOverlayOptions } from './blockOverlay';

// Warning toast - non-blocking notification for warn mode
export { showWarningToast, removeWarningToast } from './warningToast';

// Redact overlay - side-by-side comparison modal for redact mode
export {
  showRedactOverlay,
  removeRedactOverlay,
  isRedactOverlayVisible,
} from './redactOverlay';
export type { RedactOverlayOptions, ObfuscationData, MappingItem } from './redactOverlay';

// Monitor toast - subtle indicator for monitor mode
export { showMonitorToast, removeMonitorToast } from './monitorToast';

// Enterprise toast notification system
export { showToast, dismissAllToasts, removeToastContainer } from './toast';
export type { ToastOptions, ToastVariant } from './toast';

// Unified detection popup - inline popup above chat input (replaces full-screen overlays)
export {
  showDetectionPopup,
  removeDetectionPopup,
  isDetectionPopupVisible,
} from './detectionPopup';
export type {
  DetectionPopupOptions,
  FileDetectionGroup,
  ObfuscationData as PopupObfuscationData,
  MappingItem as PopupMappingItem,
} from './detectionPopup';

// Multi-item detection popup - tab-based navigation for multiple flagged items
export {
  showMultiItemPopup,
  removeMultiItemPopup,
  isMultiItemPopupVisible,
} from './detectionPopup';
export type {
  FlaggedItem,
  PopupState,
  MultiItemCallbacks,
} from './detectionPopup';

// Legacy exports for backwards compatibility
// TODO: Remove once all consumers are updated
export { showBlockOverlay as showLegacyBlockOverlay } from './blockOverlay';
