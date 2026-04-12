/**
 * Obfusca page-context script for React file input restoration.
 *
 * Runs in the PAGE's JavaScript world (not the content script's isolated world).
 * This is necessary because content scripts can't access React's internal props
 * on DOM elements (isolated JS worlds).
 *
 * Approach: Receive file data (base64) from content script, reconstruct the
 * File object in the page context, set it on the input via DataTransfer, and
 * call React's onChange handler directly with the real DOM input as target.
 * React's handler reads e.target.files from the DOM element, which has our
 * DataTransfer files, triggering the component's state update naturally.
 *
 * Communication via CustomEvents on window:
 *   Content -> Page:  'obfusca-restore-file'   { fileName, fileType, fileData }
 *   Page -> Content:  'obfusca-restore-result'  { success, error? }
 *
 * Loaded as a web_accessible_resource via <script src="chrome-extension://...">.
 */
(function () {
  window.addEventListener('obfusca-restore-file', function (event) {
    var detail = event.detail || {};
    var fileName = detail.fileName;
    var fileType = detail.fileType;
    var fileData = detail.fileData; // base64-encoded file content

    console.log('[Obfusca Page] Received restore request for:', fileName);

    try {
      // 1. Convert base64 back to File in the page's JS context
      var byteCharacters = atob(fileData);
      var byteNumbers = new Array(byteCharacters.length);
      for (var i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      var byteArray = new Uint8Array(byteNumbers);
      var file = new File([byteArray], fileName, { type: fileType });

      // 2. Find the file input
      var fileInput = document.getElementById('image-uploader');
      if (!fileInput) {
        throw new Error('Could not find #image-uploader input');
      }

      // 3. Set files on the real DOM input via DataTransfer
      var dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      console.log('[Obfusca Page] Files set on input:', fileInput.files.length, fileInput.files[0] && fileInput.files[0].name);

      // 4. Find React's onChange handler via internal props
      var reactPropsKey = Object.keys(fileInput).find(function (k) {
        return k.startsWith('__reactProps$');
      });
      var onChange = reactPropsKey ? fileInput[reactPropsKey] && fileInput[reactPropsKey].onChange : null;

      if (!onChange) {
        throw new Error('Could not find React onChange on #image-uploader');
      }

      // 5. Call onChange directly with the real input element as target
      //    React's handler reads e.target.files from the DOM, which has our DataTransfer files
      onChange({ target: fileInput, currentTarget: fileInput });

      console.log('[Obfusca Page] React onChange called directly — file should appear in UI');

      window.dispatchEvent(new CustomEvent('obfusca-restore-result', {
        detail: { success: true }
      }));
    } catch (err) {
      console.error('[Obfusca Page] Error restoring file:', err);
      window.dispatchEvent(new CustomEvent('obfusca-restore-result', {
        detail: { success: false, error: err.message }
      }));
    }
  });

  console.log('[Obfusca Page] React file restore script loaded (direct onChange approach)');
})();
