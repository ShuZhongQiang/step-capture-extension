let isRecording = false;
let steps = [];

const startRecordBtn = document.getElementById('start-record');
const stopRecordBtn = document.getElementById('stop-record');
const recordingStatus = document.getElementById('recording-status');
const stepsContainer = document.getElementById('steps-container');
const exportMarkdownBtn = document.getElementById('export-markdown');
const exportHtmlBtn = document.getElementById('export-html');
const clearStepsBtn = document.getElementById('clear-steps');
// 侧边栏专属元素（popup 模式下不存在，做兼容处理）
const recordingBadge = document.getElementById('recording-badge');
const stepsCount = document.getElementById('steps-count');

function init() {
  loadState();
  setupEventListeners();
  setupStorageListeners();
}

function loadState() {
  chrome.storage.local.get(['steps', 'isRecording'], (result) => {
    steps = Array.isArray(result.steps) ? result.steps : [];
    isRecording = result.isRecording === true;
    renderSteps();
    updateUI();
  });
}

function updateUI() {
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

function setupEventListeners() {
  startRecordBtn.addEventListener('click', startRecording);
  stopRecordBtn.addEventListener('click', stopRecording);
  exportMarkdownBtn.addEventListener('click', () => exportSteps('markdown'));
  exportHtmlBtn.addEventListener('click', () => exportSteps('html'));
  clearStepsBtn.addEventListener('click', clearSteps);
}

function setupStorageListeners() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (changes.steps) {
      steps = Array.isArray(changes.steps.newValue) ? changes.steps.newValue : [];
      renderSteps();
    }

    if (changes.isRecording) {
      isRecording = changes.isRecording.newValue === true;
      updateUI();
    }
  });
}

/**
 * 通过 background 获取当前活跃的普通网页 Tab。
 * 侧边栏页面调用 chrome.tabs.query 会因上下文问题拿到错误的 tab，
 * 所以统一委托给 Service Worker 查询。
 */
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

    console.log('[popup startRecording] 目标tab:', activeTab.id, activeTab.url);

    // 开始新录制前先清空旧步骤
    chrome.storage.local.set({ steps: [] }, () => {
      steps = [];
      renderSteps();

      chrome.runtime.sendMessage(
        {
          action: 'startRecording',
          tabId: activeTab.id
        },
        (response) => {
          if (response && response.ok) {
            console.log('[popup startRecording] ✅ 录制已启动');
            isRecording = true;
            updateUI();
          } else {
            console.error('[popup startRecording] ❌ background响应失败', chrome.runtime.lastError);
            alert('录制启动失败，请确认网页已完全加载后重试。');
          }
        }
      );
    });
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

  chrome.storage.local.set({ steps: [] }, () => {
    steps = [];
    renderSteps();
  });
}

function renderSteps() {
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

    stepsContainer.appendChild(stepElement);
  });
}

function exportSteps(format) {
  if (steps.length === 0) {
    alert('没有可导出的步骤');
    return;
  }

  let content = '';
  let filename = '';

  if (format === 'markdown') {
    content = generateMarkdown();
    filename = '步骤指南.md';
  } else if (format === 'html') {
    content = generateHtml();
    filename = '步骤指南.html';
  }

  const blob = new Blob([content], {
    type: format === 'markdown' ? 'text/markdown' : 'text/html'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function generateMarkdown() {
  let markdown = '# 步骤指南\n\n';

  steps.forEach((step, index) => {
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

function generateHtml() {
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

  steps.forEach((step, index) => {
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
