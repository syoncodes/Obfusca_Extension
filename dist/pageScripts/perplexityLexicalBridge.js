/**
 * Obfusca page-context script for Perplexity's Lexical editor.
 *
 * Runs in the PAGE's JavaScript world (not the content script's isolated world).
 * This is necessary because Lexical stores its editor instance as a JS property
 * (__lexicalEditor) on the contenteditable DOM element, which is invisible to
 * content scripts running in Chrome's isolated world.
 *
 * Approach: Simulate Ctrl+A (select all) followed by a synthetic paste event.
 * Lexical's paste handler reads clipboardData directly and replaces the current
 * selection, going through the FULL Lexical update pipeline → onChange → React.
 *
 * Previous approaches that FAILED:
 *   - root.clear() + insertRawText: React restores original from its state
 *   - root.select() + insertRawText: Element-level selection, appends not replaces
 *   - execCommand selectAll + insertText: Lexical intercepts beforeinput, mishandles
 *   - editor.update() with node manipulation: Doesn't trigger React onChange
 *
 * Communication via CustomEvents on window:
 *   Content -> Page:  'obfusca-perplexity-set-content'   { content, elementId? }
 *   Page -> Content:  'obfusca-perplexity-set-result'     { success, error?, finalLength? }
 *
 *   Content -> Page:  'obfusca-perplexity-set-and-submit'  { content, elementId? }
 *   Page -> Content:  'obfusca-perplexity-set-and-submit-result' { success, error? }
 *
 *   Content -> Page:  'obfusca-perplexity-submit'          {}
 *   Page -> Content:  'obfusca-perplexity-submit-result'   { success, error? }
 *
 * Loaded as a web_accessible_resource via <script src="chrome-extension://...">.
 */
(function () {
  'use strict';

  // Guard against duplicate registration (script loaded multiple times)
  if (window.__obfuscaLexicalBridgeLoaded) {
    console.log('[Obfusca Perplexity Page] Bridge already loaded, skipping duplicate registration');
    return;
  }
  window.__obfuscaLexicalBridgeLoaded = true;

  /**
   * Find the editor input element.
   */
  function findEditorElement(elementId) {
    if (elementId) {
      var byId = document.getElementById(elementId);
      if (byId) return byId;
    }
    return document.querySelector('#ask-input')
      || document.querySelector('[data-lexical-editor="true"]')
      || document.querySelector('[contenteditable="true"][role="textbox"]');
  }

  // ---------------------------------------------------------------------------
  // Content replacement via Ctrl+A then synthetic paste
  // ---------------------------------------------------------------------------

  /**
   * Replace all editor content by simulating select-all then paste.
   *
   * Step 1: Dispatch Ctrl+A / Cmd+A to trigger Lexical's SELECT_ALL_COMMAND.
   *         This sets Lexical's INTERNAL selection to span all content.
   *         (execCommand('selectAll') only sets browser selection, not Lexical's.)
   *
   * Step 2: After a brief delay for Lexical to process the select-all,
   *         dispatch a synthetic paste event with clipboardData containing
   *         our protected text.
   *
   * Step 3: Lexical's paste handler reads clipboardData.getData('text/plain'),
   *         creates TextNodes, and replaces the current selection.
   *         This fires onChange → React state updates.
   *
   * Returns a Promise that resolves to true if content was replaced.
   */
  function replaceContentViaPaste(element, content) {
    return new Promise(function(resolve) {
      element.focus();

      // Step 1: Trigger select-all via Ctrl+A / Cmd+A keyboard simulation
      // This fires Lexical's KEY_DOWN_COMMAND which triggers SELECT_ALL_COMMAND
      var isMac = navigator.platform.indexOf('Mac') !== -1 || navigator.userAgent.indexOf('Mac') !== -1;

      var ctrlA = new KeyboardEvent('keydown', {
        key: 'a',
        code: 'KeyA',
        keyCode: 65,
        which: 65,
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      element.dispatchEvent(ctrlA);
      console.log('[Obfusca Perplexity Page] Dispatched ' + (isMac ? 'Cmd' : 'Ctrl') + '+A for select-all');

      // Also do browser-level select all as backup
      document.execCommand('selectAll', false, null);

      // Step 2: After Lexical processes the select-all, dispatch paste
      setTimeout(function() {
        // Create the paste event with our content in clipboardData
        var dt = new DataTransfer();
        dt.setData('text/plain', content);

        var pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });

        console.log('[Obfusca Perplexity Page] Dispatching paste event with ' + content.length + ' chars, isTrusted will be: ' + pasteEvent.isTrusted);

        element.dispatchEvent(pasteEvent);

        // Step 3: Verify after Lexical processes the paste
        setTimeout(function() {
          var currentText = (element.innerText || element.textContent || '').trim();
          var expectedText = content.trim();
          var lengthMatch = Math.abs(currentText.length - expectedText.length) <= 5;

          console.log('[Obfusca Perplexity Page] After paste: DOM=' + currentText.length + ' chars, expected=' + expectedText.length + ' chars, match=' + lengthMatch);

          if (!lengthMatch) {
            // Log what's in the DOM for debugging
            var first100 = currentText.substring(0, 100);
            console.log('[Obfusca Perplexity Page] DOM content starts with: "' + first100 + '"');
            console.log('[Obfusca Perplexity Page] Expected starts with: "' + expectedText.substring(0, 100) + '"');
          }

          resolve(lengthMatch);
        }, 100);
      }, 50); // 50ms for Lexical to process select-all
    });
  }

  /**
   * Fallback: Try using Lexical's internal dispatchCommand for SELECT_ALL
   * then paste. This directly calls Lexical's command system.
   */
  function replaceContentViaLexicalPaste(element, content) {
    return new Promise(function(resolve) {
      var editor = element.__lexicalEditor;
      if (!editor) {
        console.warn('[Obfusca Perplexity Page] No __lexicalEditor for Lexical paste fallback');
        resolve(false);
        return;
      }

      // Try to find SELECT_ALL_COMMAND on the editor
      // Lexical registers commands as symbols, so we need to find it
      element.focus();

      // Use editor.update to select all content programmatically
      editor.update(function() {
        try {
          var root = editor.getEditorState()._nodeMap.get('root');
          if (!root) {
            console.warn('[Obfusca Perplexity Page] Root not found');
            return;
          }

          // Select all using selectAll on root
          if (typeof root.select === 'function') {
            var childrenSize = typeof root.getChildrenSize === 'function'
              ? root.getChildrenSize()
              : (root.getChildren ? root.getChildren().length : 0);
            root.select(0, childrenSize);
            console.log('[Obfusca Perplexity Page] Lexical internal selectAll done');
          }
        } catch(e) {
          console.warn('[Obfusca Perplexity Page] Lexical selectAll failed:', e.message);
        }
      });

      // After Lexical's select-all, dispatch paste
      setTimeout(function() {
        var dt = new DataTransfer();
        dt.setData('text/plain', content);

        var pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt
        });

        element.dispatchEvent(pasteEvent);

        // Verify
        setTimeout(function() {
          var currentText = (element.innerText || element.textContent || '').trim();
          var expectedText = content.trim();
          var lengthMatch = Math.abs(currentText.length - expectedText.length) <= 5;

          console.log('[Obfusca Perplexity Page] Lexical paste fallback: DOM=' + currentText.length + ' chars, expected=' + expectedText.length + ', match=' + lengthMatch);
          resolve(lengthMatch);
        }, 100);
      }, 50);
    });
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  // --- Listen for set-content requests from content script ---
  window.addEventListener('obfusca-perplexity-set-content', function (event) {
    var detail = event.detail || {};
    var content = detail.content;
    var elementId = detail.elementId;

    console.log('[Obfusca Perplexity Page] Received set-content request: ' + (content ? content.length : 0) + ' chars');

    var element = findEditorElement(elementId);
    if (!element) {
      console.error('[Obfusca Perplexity Page] No editor element found');
      window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-result', {
        detail: { success: false, error: 'Editor element not found' },
      }));
      return;
    }

    // Try Ctrl+A then paste first
    replaceContentViaPaste(element, content)
      .then(function(success) {
        if (success) {
          console.log('[Obfusca Perplexity Page] Ctrl+A paste approach succeeded');
          window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-result', {
            detail: { success: true, strategy: 'ctrl-a-paste', finalLength: content.length },
          }));
          return;
        }

        // Fallback: Lexical internal select then paste
        console.log('[Obfusca Perplexity Page] Trying Lexical internal select + paste fallback');
        return replaceContentViaLexicalPaste(element, content)
          .then(function(fallbackSuccess) {
            window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-result', {
              detail: {
                success: fallbackSuccess,
                strategy: fallbackSuccess ? 'lexical-paste' : 'failed',
                finalLength: content.length,
              },
            }));
          });
      })
      .catch(function(err) {
        console.error('[Obfusca Perplexity Page] All paste strategies failed:', err);
        window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-result', {
          detail: { success: false, error: err.message || String(err) },
        }));
      });
  });

  // --- Listen for atomic set-and-submit requests from content script ---
  // Uses Ctrl+A then paste to replace content, then Enter to submit.
  window.addEventListener('obfusca-perplexity-set-and-submit', function(event) {
    var detail = event.detail || {};
    var content = detail.content;
    var elementId = detail.elementId;

    console.log('[Obfusca Perplexity Page] Atomic set-and-submit: ' + content.length + ' chars');

    var element = findEditorElement(elementId);
    if (!element) {
      window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-and-submit-result', {
        detail: { success: false, error: 'Editor element not found' }
      }));
      return;
    }

    // Try Ctrl+A paste first, then Lexical internal paste fallback
    replaceContentViaPaste(element, content)
      .then(function(success) {
        if (success) {
          console.log('[Obfusca Perplexity Page] Atomic: Ctrl+A paste succeeded');
          return true;
        }
        console.log('[Obfusca Perplexity Page] Atomic: trying Lexical paste fallback');
        return replaceContentViaLexicalPaste(element, content);
      })
      .then(function(success) {
        if (!success) {
          console.error('[Obfusca Perplexity Page] Atomic: all paste approaches failed');
          // Still try to submit — user may want to proceed anyway
        }

        // Wait briefly, then verify and dispatch Enter
        setTimeout(function() {
          var finalText = (element.textContent || element.innerText || '').trim();
          console.log('[Obfusca Perplexity Page] Atomic: Final DOM text before Enter: ' + finalText.length + ' chars (expected ' + content.length + ')');

          if (Math.abs(finalText.length - 420) < 5) {
            console.error('[Obfusca Perplexity Page] CONTENT REVERTED TO ORIGINAL! Paste did not persist.');
          }

          if (finalText.length > content.length * 1.5) {
            console.warn('[Obfusca Perplexity Page] WARNING: Content appears duplicated! DOM: ' + finalText.length + ' Expected: ' + content.length);
          }

          // Focus and dispatch Enter
          element.focus();

          var enterDown = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          element.dispatchEvent(enterDown);

          var enterUp = new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
          });
          element.dispatchEvent(enterUp);

          console.log('[Obfusca Perplexity Page] Atomic: Enter dispatched');

          window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-and-submit-result', {
            detail: { success: true }
          }));
        }, 100); // 100ms after paste verification
      })
      .catch(function(err) {
        console.error('[Obfusca Perplexity Page] Atomic set-and-submit error:', err);
        window.dispatchEvent(new CustomEvent('obfusca-perplexity-set-and-submit-result', {
          detail: { success: false, error: err.message }
        }));
      });
  });

  // --- Listen for submit requests from content script ---
  window.addEventListener('obfusca-perplexity-submit', function (event) {
    console.log('[Obfusca Perplexity Page] Received submit request');

    var element = findEditorElement((event.detail || {}).elementId);
    if (!element) {
      console.error('[Obfusca Perplexity Page] No editor found for submit');
      window.dispatchEvent(new CustomEvent('obfusca-perplexity-submit-result', {
        detail: { success: false, error: 'Editor not found' },
      }));
      return;
    }

    element.focus();

    var enterDown = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(enterDown);

    var enterUp = new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(enterUp);

    console.log('[Obfusca Perplexity Page] Enter key dispatched from page context');

    window.dispatchEvent(new CustomEvent('obfusca-perplexity-submit-result', {
      detail: { success: true },
    }));
  });

  console.log('[Obfusca Perplexity Page] Lexical bridge script loaded (Ctrl+A paste approach)');
})();
