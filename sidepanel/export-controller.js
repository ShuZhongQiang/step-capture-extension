(function initExportController(global) {
  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',', 2);
    const header = parts[0] || '';
    const base64 = parts[1] || '';
    const match = /^data:(.*?);base64$/.exec(header);
    const mimeType = match ? match[1] : 'application/octet-stream';

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
  }

  function createFolderName() {
    const now = new Date();
    const pad = function pad(value) {
      return String(value).padStart(2, '0');
    };

    return 'step-guide-' + now.getFullYear()
      + pad(now.getMonth() + 1)
      + pad(now.getDate())
      + '-'
      + pad(now.getHours())
      + pad(now.getMinutes())
      + pad(now.getSeconds());
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(function revokeUrl() {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  function downloadBlobWithChrome(blob, filename) {
    return new Promise(function resolveDownload(resolve, reject) {
      const url = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      }, function onDownloaded(downloadId) {
        setTimeout(function revokeUrl() {
          URL.revokeObjectURL(url);
        }, 10000);

        if (chrome.runtime.lastError || !downloadId) {
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'download_failed'));
          return;
        }

        resolve(downloadId);
      });
    });
  }

  async function requestDocumentBuild(sessionId, format, useAi, options) {
    const messages = global.StepRecorderMessages;
    const opts = options || {};
    const result = await sendPanelCommand(messages.COMMAND.DOCUMENT_BUILD, {
      sessionId: sessionId,
      format: format,
      useAi: Boolean(useAi),
      prompt: opts.prompt || ''
    });

    if (!result || result.ok === false) {
      throw new Error(result && result.error ? result.error : 'document_build_failed');
    }

    return result;
  }

  async function downloadExportBundle(buildResult) {
    if (!buildResult || !buildResult.rendered) {
      throw new Error('invalid_build_result');
    }

    const folderName = createFolderName();
    const rendered = buildResult.rendered;
    const assets = Array.isArray(buildResult.assets) ? buildResult.assets : [];

    const mainBlob = new Blob([rendered.content || ''], {
      type: rendered.mimeType || 'text/plain;charset=utf-8'
    });

    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      zip.file(rendered.filename || 'steps-guide.txt', mainBlob);

      for (const asset of assets) {
        if (!asset || !asset.filename || !asset.dataUrl) {
          continue;
        }
        zip.file(asset.filename, dataUrlToBlob(asset.dataUrl));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(zipBlob, folderName + '.zip');
      return;
    }

    const canUseDownloads = chrome.downloads && typeof chrome.downloads.download === 'function';

    if (canUseDownloads) {
      await downloadBlobWithChrome(mainBlob, folderName + '/' + (rendered.filename || 'steps-guide.txt'));
      for (const asset of assets) {
        if (!asset || !asset.filename || !asset.dataUrl) {
          continue;
        }
        await downloadBlobWithChrome(dataUrlToBlob(asset.dataUrl), folderName + '/' + asset.filename);
      }
      return;
    }

    triggerBlobDownload(mainBlob, rendered.filename || 'steps-guide.txt');
    for (const asset of assets) {
      if (!asset || !asset.filename || !asset.dataUrl) {
        continue;
      }
      const fileName = asset.filename.split('/').pop() || asset.filename;
      triggerBlobDownload(dataUrlToBlob(asset.dataUrl), fileName);
    }
  }

  global.requestDocumentBuild = requestDocumentBuild;
  global.downloadExportBundle = downloadExportBundle;
})(typeof self !== 'undefined' ? self : window);
