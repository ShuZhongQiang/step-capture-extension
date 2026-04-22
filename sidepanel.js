let isRecording = false;
let steps = [];
let recordingMode = 'auto';

const startRecordBtn = document.getElementById('start-record');
const stopRecordBtn = document.getElementById('stop-record');
const recordingStatus = document.getElementById('recording-status');
const stepsContainer = document.getElementById('steps-container');
const exportMarkdownBtn = document.getElementById('export-markdown');
const exportHtmlBtn = document.getElementById('export-html');
const clearStepsBtn = document.getElementById('clear-steps');
const recordingBadge = document.getElementById('recording-badge');
const stepsCount = document.getElementById('steps-count');
const modeRadios = document.querySelectorAll('input[name="recording-mode"]');

let jszip = null;

function init() {
  loadJszipLibrary();
  loadState();
  setupEventListeners();
  setupStorageListeners();
}

function loadJszipLibrary() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'lib/jszip.min.js';
    script.onload = () => {
      jszip = new JSZip();
      resolve();
    };
    script.onerror = () => {
      console.error('[loadJszipLibrary] failed to load JSZip');
      jszip = null;
      resolve();
    };
    document.head.appendChild(script);
  });
}

function loadState() {
  chrome.runtime.sendMessage({ action: 'getState' }, (result) => {
    if (chrome.runtime.lastError || !result) {
      console.error('[loadState] failed:', chrome.runtime.lastError);
      return;
    }

    steps = Array.isArray(result.steps) ? result.steps : [];
    isRecording = result.isRecording === true;
    recordingMode = result.recordingMode || 'auto';
    renderSteps();
    updateUI();
    updateModeUI();
  });
}

function updateUI() {
  if (!startRecordBtn || !stopRecordBtn || !recordingStatus) {
    return;
  }

  if (isRecording) {
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = false;
    recordingStatus.textContent = '录制中...';
    recordingStatus.style.color = '#ef4444';
    if (recordingBadge) {
      recordingBadge.classList.remove('hidden');
    }
    return;
  }

  startRecordBtn.disabled = false;
  stopRecordBtn.disabled = true;
  recordingStatus.textContent = '就绪';
  recordingStatus.style.color = '#6b7280';
  if (recordingBadge) {
    recordingBadge.classList.add('hidden');
  }
}

function updateModeUI() {
  if (!modeRadios) {
    return;
  }

  modeRadios.forEach((radio) => {
    radio.checked = radio.value === recordingMode;
  });
}

function setupEventListeners() {
  if (startRecordBtn) {
    startRecordBtn.addEventListener('click', startRecording);
  }
  if (stopRecordBtn) {
    stopRecordBtn.addEventListener('click', stopRecording);
  }
  if (exportMarkdownBtn) {
    exportMarkdownBtn.addEventListener('click', () => {
      exportSteps('markdown');
    });
  }
  if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener('click', () => {
      exportSteps('html');
    });
  }
  if (clearStepsBtn) {
    clearStepsBtn.addEventListener('click', clearSteps);
  }
  if (modeRadios) {
    modeRadios.forEach((radio) => {
      radio.addEventListener('change', handleModeChange);
    });
  }
}

function setupStorageListeners() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    const changedKeys = Object.keys(changes);
    const shouldReload = changedKeys.some((key) => key.startsWith('recorder:'));
    if (shouldReload) {
      loadState();
    }
  });
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getActiveTab' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve(null);
        return;
      }
      resolve(response.tab || null);
    });
  });
}

function startRecording() {
  getActiveTab().then((activeTab) => {
    if (!activeTab) {
      alert('未找到可录制的标签页，请先打开一个网页。');
      return;
    }

    const shouldClearSteps = steps.length > 0 && confirm(
      '检测到已有步骤，是否清空后再开始录制？\n点击“确定”清空，点击“取消”保留。'
    );

    const startRecordingSession = () => {
      chrome.runtime.sendMessage(
        {
          action: 'startRecording',
          tabId: activeTab.id
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[popup startRecording] failed:', chrome.runtime.lastError);
            alert('录制启动失败，请确认网页已完全加载后重试。');
            return;
          }
          if (response && response.ok) {
            isRecording = true;
            updateUI();
            
            chrome.runtime.sendMessage({
              action: 'setManualConfirmMode',
              tabId: activeTab.id,
              enabled: recordingMode === 'manual'
            }, (setModeResponse) => {
              if (chrome.runtime.lastError) {
                console.error('[popup setManualConfirmMode] failed:', chrome.runtime.lastError);
              }
            });
            
            return;
          }

          console.error('[popup startRecording] background响应失败');
          alert('录制启动失败，请确认网页已完全加载后重试。');
        }
      );
    };

    if (shouldClearSteps) {
      chrome.runtime.sendMessage({ action: 'clearSteps' }, () => {
        if (chrome.runtime.lastError) {
          console.error('[clearSteps before start] failed:', chrome.runtime.lastError);
        }
        steps = [];
        renderSteps();
        startRecordingSession();
      });
      return;
    }

    startRecordingSession();
  });
}

function stopRecording() {
  getActiveTab().then((activeTab) => {
    chrome.runtime.sendMessage(
      {
        action: 'stopRecording',
        tabId: activeTab ? activeTab.id : null
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[popup stopRecording] failed:', chrome.runtime.lastError);
          return;
        }
        if (response && response.ok) {
          isRecording = false;
          updateUI();
        }
      }
    );
  });
}

function clearSteps() {
  if (steps.length === 0) {
    return;
  }

  if (!confirm('确定要清空所有步骤记录吗？')) {
    return;
  }

  chrome.runtime.sendMessage({ action: 'clearSteps' }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok === false) {
      console.error('[clearSteps] failed:', chrome.runtime.lastError || response);
      return;
    }

    steps = [];
    renderSteps();
  });
}

function deleteStep(stepIndex) {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) {
    return;
  }

  if (!confirm('确定要删除这条步骤吗？')) {
    return;
  }

  const step = steps[stepIndex];
  chrome.runtime.sendMessage({ action: 'deleteStep', stepId: step.id }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok === false) {
      console.error('[deleteStep] failed:', chrome.runtime.lastError || response);
      return;
    }

    const nextSteps = steps.filter((_, index) => index !== stepIndex);
    steps = nextSteps;
    renderSteps();
  });
}

function handleModeChange(event) {
  recordingMode = event.target.value;
  chrome.runtime.sendMessage({ action: 'updateRecordingMode', mode: recordingMode }, (response) => {
    if (chrome.runtime.lastError || !response || response.ok === false) {
      console.error('[handleModeChange] failed to update mode:', chrome.runtime.lastError || response);
      return;
    }

    loadState();
  });
}

function renderSteps() {
  if (!stepsContainer) {
    return;
  }

  if (stepsCount) {
    stepsCount.textContent = steps.length > 0 ? `(${steps.length})` : '';
  }

  if (steps.length === 0) {
    stepsContainer.innerHTML = '<p class="empty-message">暂无步骤记录</p>';
    return;
  }

  stepsContainer.innerHTML = '';

  steps.forEach((step, index) => {
    const stepElement = document.createElement('div');
    stepElement.className = 'step-item';

    stepElement.innerHTML = `
      <div class="step-number">${index + 1}</div>
      <div class="step-content">
        <div class="step-text">${escapeHtml(step.text || '点击元素')}</div>
        <div class="step-selector">${escapeHtml(step.selector || '')}</div>
      </div>
      ${step.screenshot ? `<img class="step-screenshot" src="${step.screenshot}" alt="步骤截图">` : ''}
    `;

    const stepActions = document.createElement('div');
    stepActions.className = 'step-actions';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'step-delete-btn';
    deleteButton.title = '删除此步骤';
    deleteButton.innerHTML = '<img src="icons/delete.svg" alt="删除" class="delete-icon">';
    deleteButton.addEventListener('click', () => {
      deleteStep(index);
    });

    stepActions.appendChild(deleteButton);
    stepElement.appendChild(stepActions);

    stepsContainer.appendChild(stepElement);
  });
}

async function exportSteps(format) {
  if (steps.length === 0) {
    alert('没有可导出的步骤');
    return;
  }

  const { stepsForDocument, imageFiles } = prepareExportAssets(steps);

  let content = '';
  let filename = '';
  let mimeType = '';

  if (format === 'markdown') {
    content = generateMarkdown(stepsForDocument);
    filename = '步骤指南.md';
    mimeType = 'text/markdown;charset=utf-8';
  } else if (format === 'html') {
    content = generateHtml(stepsForDocument);
    filename = '步骤指南.html';
    mimeType = 'text/html;charset=utf-8';
  } else {
    return;
  }

  const folderName = buildExportFolderName();

  try {
    if (jszip) {
      await downloadExportFilesWithZip({
        folderName,
        mainFile: {
          filename,
          blob: new Blob([content], { type: mimeType })
        },
        imageFiles
      });
    } else {
      await downloadExportFiles({
        folderName,
        mainFile: {
          filename,
          blob: new Blob([content], { type: mimeType })
        },
        imageFiles
      });
    }

    alert(`导出完成：${filename} + ${imageFiles.length} 张图片`);
  } catch (error) {
    console.error('[exportSteps] 导出失败:', error);
    alert('导出失败，请重试。');
  }
}

function prepareExportAssets(sourceSteps) {
  const stepsForDocument = sourceSteps.map((step) => ({ ...step }));
  const imageFiles = [];
  const usedImageFilenames = new Set();

  stepsForDocument.forEach((step, index) => {
    if (!isImageDataUrl(step.screenshot)) {
      return;
    }

    const extension = getImageExtension(step.screenshot);
    const imageFilename = buildExportImageFilename(step, index, extension, usedImageFilenames);
    const relativePath = `images/${imageFilename}`;

    imageFiles.push({
      filename: relativePath,
      blob: dataUrlToBlob(step.screenshot)
    });

    step.screenshot = relativePath;
  });

  return {
    stepsForDocument,
    imageFiles
  };
}

function buildExportImageFilename(step, index, extension, usedImageFilenames) {
  const rawTimestamp = typeof step.timestamp === 'string' ? step.timestamp : '';
  const rawStepId = typeof step.id === 'string' ? step.id : '';

  const timestampToken = sanitizeFilenameToken(rawTimestamp.replace(/[^0-9]/g, '')) || `${Date.now()}-${index + 1}`;
  const stepIdToken = sanitizeFilenameToken(rawStepId) || `idx-${index + 1}`;
  const safeExtension = sanitizeFilenameToken(extension) || 'png';

  let imageFilename = `capture-${timestampToken}-${stepIdToken}.${safeExtension}`;
  let suffix = 1;

  while (usedImageFilenames.has(imageFilename)) {
    imageFilename = `capture-${timestampToken}-${stepIdToken}-${suffix}.${safeExtension}`;
    suffix += 1;
  }

  usedImageFilenames.add(imageFilename);
  return imageFilename;
}

function sanitizeFilenameToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 64);
}

function isImageDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function getImageExtension(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  const mimeType = match ? match[1].toLowerCase() : 'image/png';

  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }
  if (mimeType === 'image/svg+xml') {
    return 'svg';
  }
  if (mimeType.includes('/')) {
    return mimeType.split('/')[1].replace('x-icon', 'ico');
  }

  return 'png';
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',', 2);
  const mimeMatch = /^data:(.*?);base64$/.exec(header || '');
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

function buildExportFolderName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return `step-guide-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function downloadExportFiles({ folderName, mainFile, imageFiles }) {
  const useChromeDownloads = chrome.downloads && typeof chrome.downloads.download === 'function';

  if (useChromeDownloads) {
    await downloadBlobWithChrome(mainFile.blob, `${folderName}/${mainFile.filename}`);

    for (const imageFile of imageFiles) {
      const leafName = imageFile.filename.split('/').pop() || imageFile.filename;
      await downloadBlobWithChrome(imageFile.blob, `${folderName}/${leafName}`);
    }

    return;
  }

  triggerBlobDownload(mainFile.blob, mainFile.filename);
  for (const imageFile of imageFiles) {
    const leafName = imageFile.filename.split('/').pop() || imageFile.filename;
    triggerBlobDownload(imageFile.blob, leafName);
  }
}

function downloadBlobWithChrome(blob, filename) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);

    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false,
        conflictAction: 'uniquify'
      },
      (downloadId) => {
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        if (chrome.runtime.lastError || !downloadId) {
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'download failed'));
          return;
        }

        resolve(downloadId);
      }
    );
  });
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadExportFilesWithZip({ folderName, mainFile, imageFiles }) {
  const zip = new JSZip();

  zip.file(mainFile.filename, mainFile.blob);

  for (const imageFile of imageFiles) {
    const leafName = imageFile.filename.split('/').pop() || imageFile.filename;
    zip.file(`images/${leafName}`, imageFile.blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });

  const zipFilename = `${folderName}.zip`;
  triggerBlobDownload(content, zipFilename);
}

function generateMarkdown(stepsForDocument) {
  let markdown = '# 步骤指南\n\n';

  stepsForDocument.forEach((step, index) => {
    markdown += `## 步骤 ${index + 1}\n\n`;
    markdown += `- 操作: ${step.type || 'click'}\n`;
    markdown += `- 元素: ${step.text || '未知元素'}\n`;
    markdown += `- 选择器: \`${step.selector || ''}\`\n`;

    if (step.url) {
      markdown += `- 页面: ${step.url}\n`;
    }

    if (step.screenshot) {
      markdown += `- 截图:\n![步骤 ${index + 1}截图](${step.screenshot})\n`;
    }

    markdown += '\n';
  });

  return markdown;
}

function generateHtml(stepsForDocument) {
  let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>步骤指南</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background-color: #fff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    h1 {
      color: #3b82f6;
      margin-bottom: 30px;
      text-align: center;
    }
    h2 {
      color: #333;
      margin: 20px 0 10px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 5px;
    }
    .step {
      margin-bottom: 20px;
      padding: 15px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      background-color: #f9fafb;
    }
    .step-details {
      margin-top: 10px;
    }
    .step-details p {
      margin-bottom: 5px;
      word-break: break-word;
    }
    .selector {
      font-family: monospace;
      background-color: #f3f4f6;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 14px;
    }
    .screenshot {
      margin-top: 10px;
      border-radius: 4px;
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>步骤指南</h1>
  `;

  stepsForDocument.forEach((step, index) => {
    html += `
    <div class="step">
      <h2>步骤 ${index + 1}</h2>
      <div class="step-details">
        <p><strong>操作:</strong> ${escapeHtml(step.type || 'click')}</p>
        <p><strong>元素:</strong> ${escapeHtml(step.text || '未知元素')}</p>
        <p><strong>选择器:</strong> <span class="selector">${escapeHtml(step.selector || '')}</span></p>
        ${step.url ? `<p><strong>页面:</strong> ${escapeHtml(step.url)}</p>` : ''}
        ${step.screenshot ? `<img class="screenshot" src="${step.screenshot}" alt="步骤 ${index + 1}截图">` : ''}
      </div>
    </div>
    `;
  });

  html += `
  </div>
</body>
</html>
  `;

  return html;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

init();
