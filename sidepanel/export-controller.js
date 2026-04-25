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

  function sanitizeFilename(name) {
    return String(name || '')
      .replace(/[\\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 50);
  }

  function createExportFilename(documentPayload) {
    const now = new Date();
    const pad = function pad(value) {
      return String(value).padStart(2, '0');
    };
    const timestamp = now.getFullYear()
      + pad(now.getMonth() + 1)
      + pad(now.getDate())
      + '-'
      + pad(now.getHours())
      + pad(now.getMinutes());

    var baseName = 'step-guide';
    if (documentPayload && documentPayload.title) {
      var sanitized = sanitizeFilename(documentPayload.title);
      if (sanitized.length > 3) {
        baseName = sanitized;
      }
    }

    return baseName + '-' + timestamp;
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
    const timeoutMs = Number(opts.timeoutMs) > 0
      ? Number(opts.timeoutMs)
      : (useAi ? 90000 : 45000);
    const result = await sendPanelCommand(messages.COMMAND.DOCUMENT_BUILD, {
      sessionId: sessionId,
      format: format,
      useAi: Boolean(useAi),
      prompt: opts.prompt || ''
    }, {
      timeoutMs: timeoutMs
    });

    if (!result || result.ok === false) {
      throw new Error(result && result.error ? result.error : 'document_build_failed');
    }

    return result;
  }

  async function downloadExportBundle(buildResult, options) {
    if (!buildResult || !buildResult.rendered) {
      throw new Error('invalid_build_result');
    }

    const opts = options || {};
    const rendered = buildResult.rendered;
    const documentPayload = buildResult.document;
    const rawAssets = Array.isArray(buildResult.assets) ? buildResult.assets : [];

    const exportFilename = createExportFilename(documentPayload);

    const mainBlob = new Blob([rendered.content || ''], {
      type: rendered.mimeType || 'text/plain;charset=utf-8'
    });

    var assetMap = rawAssets.map(function mapAsset(asset) {
      return {
        filename: asset.filename || ('images/' + asset.assetId + '.png'),
        original: asset
      };
    });

    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();
      zip.file(rendered.filename || 'steps-guide.md', mainBlob);

      for (var i = 0; i < assetMap.length; i++) {
        const mapping = assetMap[i];
        if (!mapping || !mapping.original || !mapping.original.dataUrl) {
          continue;
        }
        zip.file(mapping.filename, dataUrlToBlob(mapping.original.dataUrl));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(zipBlob, exportFilename + '.zip');
      return;
    }

    const canUseDownloads = chrome.downloads && typeof chrome.downloads.download === 'function';

    if (canUseDownloads) {
      await downloadBlobWithChrome(mainBlob, exportFilename + '/' + (rendered.filename || 'steps-guide.md'));
      for (var j = 0; j < assetMap.length; j++) {
        const mapping = assetMap[j];
        if (!mapping || !mapping.original || !mapping.original.dataUrl) {
          continue;
        }
        await downloadBlobWithChrome(dataUrlToBlob(mapping.original.dataUrl), exportFilename + '/' + mapping.filename);
      }
      return;
    }

    triggerBlobDownload(mainBlob, rendered.filename || 'steps-guide.md');
    for (var k = 0; k < assetMap.length; k++) {
      const mapping = assetMap[k];
      if (!mapping || !mapping.original || !mapping.original.dataUrl) {
        continue;
      }
      const fileName = mapping.filename.split('/').pop() || mapping.filename;
      triggerBlobDownload(dataUrlToBlob(mapping.original.dataUrl), fileName);
    }
  }

  global.requestDocumentBuild = requestDocumentBuild;
  global.downloadExportBundle = downloadExportBundle;
})(typeof self !== 'undefined' ? self : window);
