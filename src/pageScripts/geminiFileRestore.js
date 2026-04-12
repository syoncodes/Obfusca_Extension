/**
 * Obfusca page-context script for Gemini file input restoration.
 *
 * Runs in the PAGE's JavaScript world (not the content script's isolated world).
 *
 * Approach: Replay a paste event on Gemini's contenteditable editor with the
 * protected file as clipboardData. Angular's paste handler extracts files from
 * clipboardData and processes them through its normal upload pipeline — this is
 * the TOP of the pipeline, triggering the entire file upload flow naturally
 * inside Angular's zone. No need to intercept createElement, change handlers,
 * or input.click().
 *
 * Communication via CustomEvents on window:
 *   Content -> Page:  'obfusca-gemini-restore-file'   { fileName, fileType, fileData }
 *   Page -> Content:  'obfusca-gemini-restore-result'  { success, error? }
 *
 * Loaded as a web_accessible_resource via <script src="chrome-extension://...">.
 */
(function () {
  'use strict';

  // --- Listen for restore requests from content script ---
  window.addEventListener('obfusca-gemini-restore-file', (event) => {
    try {
      const { fileName, fileType, fileData } = event.detail;
      console.log('[Obfusca Gemini Page] Received restore request for:', fileName);

      // Convert base64 to File
      const byteCharacters = atob(fileData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const file = new File([byteArray], fileName, { type: fileType });

      // Find the contenteditable editor (Gemini's input area)
      const editor = document.querySelector('.ql-editor')
        || document.querySelector('[contenteditable="true"]')
        || document.querySelector('.text-input-field')
        || document.querySelector('[role="textbox"]');

      if (!editor) {
        throw new Error('Editor element not found');
      }

      console.log('[Obfusca Gemini Page] Found editor:', editor.tagName, editor.className.substring(0, 60));

      // Build a DataTransfer with our file
      const dt = new DataTransfer();
      dt.items.add(file);

      // Strategy 1: ClipboardEvent with clipboardData
      // Matches the original paste flow — Angular's paste handler reads clipboardData.files
      let dispatched = false;
      try {
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        dispatched = editor.dispatchEvent(pasteEvent);
        console.log('[Obfusca Gemini Page] ClipboardEvent paste dispatched, default prevented:', !dispatched);
      } catch (clipErr) {
        console.warn('[Obfusca Gemini Page] ClipboardEvent constructor failed:', clipErr.message);
      }

      // Strategy 2: Fallback — generic Event with clipboardData via Object.defineProperty
      // Some browsers restrict clipboardData on synthetic ClipboardEvent
      if (!dispatched) {
        console.log('[Obfusca Gemini Page] Trying fallback: Event with defineProperty clipboardData');
        const fallbackEvent = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(fallbackEvent, 'clipboardData', {
          value: dt,
          writable: false,
        });
        editor.dispatchEvent(fallbackEvent);
      }

      // Give Angular a moment to process the paste, then report success
      setTimeout(() => {
        console.log('[Obfusca Gemini Page] Post-paste processing complete');
        window.dispatchEvent(new CustomEvent('obfusca-gemini-restore-result', {
          detail: { success: true },
        }));
      }, 100);

    } catch (err) {
      console.error('[Obfusca Gemini Page] Restore error:', err);
      window.dispatchEvent(new CustomEvent('obfusca-gemini-restore-result', {
        detail: { success: false, error: err.message },
      }));
    }
  });

  console.log('[Obfusca Gemini Page] File restore script loaded (paste replay approach)');
})();
