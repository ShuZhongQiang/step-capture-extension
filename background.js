const DEFAULT_STATE = {
  steps: [],
  isRecording: false,
  recordingTabId: null,
  recordingMode: 'auto'
};

const stepWriteLocks = new Map();

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, resolve);
  });
}

async function acquireStepLock(stepId, tabId) {
  const lockKey = `${stepId}:${tabId}`;
  if (stepWriteLocks.has(lockKey)) {
    return false;
  }
  stepWriteLocks.set(lockKey, true);
  return true;
}

function releaseStepLock(stepId, tabId) {
  const lockKey = `${stepId}:${tabId}`;
  stepWriteLocks.delete(lockKey);
}

async function getRecorderState() {
  const state = await getStorage(['steps', 'isRecording', 'recordingTabId', 'recordingMode']);
  return {
    steps: Array.isArray(state.steps) ? state.steps : [],
    isRecording: state.isRecording === true,
    recordingTabId: typeof state.recordingTabId === 'number' ? state.recordingTabId : null,
    recordingMode: state.recordingMode || 'auto'
  };
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    if (typeof tabId !== 'number') {
      resolve(false);
      return;
    }

    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }

      resolve(true);
    });
  });
}

async function setManualConfirmMode(tabId, enabled) {
  const state = await getRecorderState();
  if (state.recordingTabId !== tabId) {
    return false;
  }

  return sendMessageToTab(tabId, {
    action: 'setManualConfirmMode',
    enabled
  });
}

function executeScript(tabId, files) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('[executeScript] failed:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }

        resolve(true);
      }
    );
  });
}

async function ensureRecorderScript(tabId) {
  const injectedLib = await executeScript(tabId, ['lib/html2canvas.min.js']);
  const injectedContent = await executeScript(tabId, ['content.js']);
  return injectedLib && injectedContent;
}

function isWebTab(tab) {
  if (!tab || typeof tab.id !== 'number' || !tab.url) {
    return false;
  }

  return (
    tab.url.startsWith('http://') ||
    tab.url.startsWith('https://') ||
    tab.url.startsWith('file://')
  );
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

async function getBestActiveTab() {
  const preferred = await queryTabs({ active: true, lastFocusedWindow: true });
  const preferredWeb = preferred.filter(isWebTab);
  if (preferredWeb.length > 0) {
    return preferredWeb[0];
  }

  const current = await queryTabs({ active: true, currentWindow: true });
  const currentWeb = current.filter(isWebTab);
  if (currentWeb.length > 0) {
    return currentWeb[0];
  }

  const allActive = await queryTabs({ active: true });
  const allActiveWeb = allActive.filter(isWebTab);
  if (allActiveWeb.length > 0) {
    return allActiveWeb[0];
  }

  const allTabs = await queryTabs({});
  const anyWeb = allTabs.filter(isWebTab);
  return anyWeb[0] || null;
}

async function startRecording(tabId) {
  console.log('[startRecording] tabId:', tabId);
  await setStorage({
    isRecording: true,
    recordingTabId: tabId
  });

  let success = await sendMessageToTab(tabId, { action: 'startRecording' });
  if (!success) {
    console.warn('[startRecording] first send failed, trying to inject recorder scripts');
    const injected = await ensureRecorderScript(tabId);
    if (injected) {
      success = await sendMessageToTab(tabId, { action: 'startRecording' });
    }
  }

  console.log('[startRecording] send to tab result:', success);
}

async function stopRecording(tabId) {
  const state = await getRecorderState();
  const targetTabId = state.recordingTabId !== null ? state.recordingTabId : tabId;

  await setStorage({
    isRecording: false,
    recordingTabId: null
  });

  await sendMessageToTab(targetTabId, { action: 'stopRecording' });
}

async function commitCapturedStep(message, sender) {
  if (!message || !message.step) {
    console.error('[commitCapturedStep] invalid message or missing step');
    return { ok: false, error: 'invalid_message' };
  }

  const state = await getRecorderState();
  const senderTabId = sender.tab ? sender.tab.id : null;

  if (!state.isRecording) {
    console.warn('[commitCapturedStep] recording not active');
    return { ok: false, error: 'not_recording' };
  }

  if (senderTabId !== state.recordingTabId) {
    console.warn('[commitCapturedStep] tabId mismatch');
    return { ok: false, error: 'tab_mismatch' };
  }

  const incomingId = message.step.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const lockAcquired = await acquireStepLock(incomingId, senderTabId);
  if (!lockAcquired) {
    console.log('[commitCapturedStep] concurrent write detected, skipping:', incomingId);
    return { ok: true, stepId: incomingId, deduplicated: true };
  }

  try {
    const freshState = await getRecorderState();
    const exists = freshState.steps.some(
      (step) => step.id === incomingId && step.tabId === senderTabId
    );

    if (exists) {
      console.log('[commitCapturedStep] step already exists, skipping:', incomingId);
      return { ok: true, stepId: incomingId, deduplicated: true };
    }

    const step = {
      id: incomingId,
      actionType: message.step.actionType || message.step.type || 'click',
      type: message.step.type || message.step.actionType || 'click',
      selector: message.step.selector || (message.step.target && message.step.target.selector) || '',
      text: message.step.text || (message.step.target && message.step.target.text) || '',
      target: message.step.target || {
        selector: message.step.selector || '',
        text: message.step.text || '',
        tagName: message.step.target && message.step.target.tagName ? message.step.target.tagName : ''
      },
      rect: message.step.rect || null,
      tabId: senderTabId,
      url: sender.tab ? sender.tab.url : '',
      title: sender.tab ? sender.tab.title : '',
      timestamp: new Date().toISOString(),
      screenshot: message.step.screenshot || null
    };

    const steps = [...freshState.steps, step];
    await setStorage({ steps });

    return { ok: true, stepId: incomingId };
  } finally {
    releaseStepLock(incomingId, senderTabId);
  }
}

async function captureStep(message, sender) {
  console.warn('[captureStep] deprecated, use commitCapturedStep instead');
  const result = await commitCapturedStep({
    step: {
      id: message.stepId,
      type: message.type,
      selector: message.selector,
      text: message.text,
      screenshot: message.screenshot || null
    }
  }, sender);
  return result;
}

async function updateStepScreenshot(message, sender) {
  if (!message || !message.stepId || !message.screenshot) {
    console.warn('[updateStepScreenshot] invalid message, missing stepId or screenshot');
    return { ok: false, error: 'invalid_message' };
  }

  const state = await getRecorderState();
  const senderTabId = sender.tab ? sender.tab.id : null;

  if (!state.isRecording) {
    console.warn('[updateStepScreenshot] recording not active');
    return { ok: false, error: 'not_recording' };
  }

  if (senderTabId !== state.recordingTabId) {
    console.warn('[updateStepScreenshot] tabId mismatch');
    return { ok: false, error: 'tab_mismatch' };
  }

  let changed = false;
  const steps = state.steps.map((step) => {
    if (step.id !== message.stepId) {
      return step;
    }

    if (step.tabId !== senderTabId) {
      return step;
    }

    changed = true;
    return {
      ...step,
      screenshot: message.screenshot
    };
  });

  if (!changed) {
    console.warn('[updateStepScreenshot] step not found or tabId mismatch:', message.stepId);
    return { ok: false, error: 'step_not_found' };
  }

  await setStorage({ steps });
  return { ok: true, stepId: message.stepId };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureTab') {
    const windowId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;

    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          screenshot: null,
          error: chrome.runtime.lastError.message || 'capture_failed'
        });
        return;
      }

      sendResponse({
        screenshot: dataUrl || null,
        error: null
      });
    });

    return true;
  }

  if (message.action === 'getActiveTab') {
    getBestActiveTab().then((tab) => {
      if (tab) {
        console.log('[getActiveTab] selected:', tab.url, 'id:', tab.id);
      } else {
        console.log('[getActiveTab] no recordable tab found');
      }

      sendResponse({ tab: tab || null });
    });

    return true;
  }

  if (message.action === 'getState') {
    getRecorderState().then((state) => {
      sendResponse(state);
    });
    return true;
  }

  if (message.action === 'startRecording') {
    startRecording(message.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action === 'setManualConfirmMode') {
    setManualConfirmMode(message.tabId, message.enabled).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action === 'stopRecording') {
    stopRecording(message.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action === 'captureStep') {
    captureStep(message, sender).then((result) => sendResponse(result));
    return true;
  }

  if (message.action === 'commitCapturedStep') {
    commitCapturedStep(message, sender).then((result) => sendResponse(result));
    return true;
  }

  if (message.action === 'updateStepScreenshot') {
    updateStepScreenshot(message, sender).then((result) => sendResponse(result));
    return true;
  }

  if (message.action === 'getRecordingState') {
    getRecorderState().then((state) => {
      sendResponse({
        isRecording: state.isRecording,
        recordingTabId: state.recordingTabId
      });
    });
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') {
    return;
  }

  getRecorderState().then(async (state) => {
    if (!state.isRecording || state.recordingTabId !== tabId) {
      return;
    }

    let success = await sendMessageToTab(tabId, { action: 'startRecording' });
    if (!success) {
      const injected = await ensureRecorderScript(tabId);
      if (injected) {
        success = await sendMessageToTab(tabId, { action: 'startRecording' });
      }
    }

    if (success) {
      await sendMessageToTab(tabId, {
        action: 'setManualConfirmMode',
        enabled: state.recordingMode === 'manual'
      });
    }

    console.log('[tabs.onUpdated] resume recording result:', success);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getRecorderState().then((state) => {
    if (state.recordingTabId !== tabId) {
      return;
    }

    setStorage({
      isRecording: false,
      recordingTabId: null
    });
  });
});

chrome.runtime.onInstalled.addListener(async () => {
  const current = await getStorage(['steps', 'isRecording', 'recordingTabId', 'recordingMode']);

  await setStorage({
    steps: Array.isArray(current.steps) ? current.steps : DEFAULT_STATE.steps,
    isRecording: typeof current.isRecording === 'boolean' ? current.isRecording : DEFAULT_STATE.isRecording,
    recordingTabId: typeof current.recordingTabId === 'number' ? current.recordingTabId : DEFAULT_STATE.recordingTabId,
    recordingMode: current.recordingMode || DEFAULT_STATE.recordingMode
  });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
