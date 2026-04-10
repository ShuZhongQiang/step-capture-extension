const DEFAULT_STATE = {
  steps: [],
  isRecording: false,
  recordingTabId: null
};

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

async function getRecorderState() {
  const state = await getStorage(['steps', 'isRecording', 'recordingTabId']);
  return {
    steps: Array.isArray(state.steps) ? state.steps : [],
    isRecording: state.isRecording === true,
    recordingTabId: typeof state.recordingTabId === 'number' ? state.recordingTabId : null
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

async function captureStep(message, sender) {
  const state = await getRecorderState();
  const senderTabId = sender.tab ? sender.tab.id : null;

  if (!state.isRecording) {
    return;
  }

  if (senderTabId !== state.recordingTabId) {
    return;
  }

  const step = {
    id: message.stepId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: message.type || 'click',
    selector: message.selector || '',
    text: message.text || '',
    tabId: senderTabId,
    url: sender.tab ? sender.tab.url : '',
    title: sender.tab ? sender.tab.title : '',
    timestamp: new Date().toISOString(),
    screenshot: message.screenshot || null
  };

  const steps = [...state.steps, step];
  await setStorage({ steps });
}

async function updateStepScreenshot(message, sender) {
  if (!message.stepId || !message.screenshot) {
    return;
  }

  const state = await getRecorderState();
  const senderTabId = sender.tab ? sender.tab.id : null;
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
    return;
  }

  await setStorage({ steps });
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

  if (message.action === 'stopRecording') {
    stopRecording(message.tabId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action === 'captureStep') {
    captureStep(message, sender).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action === 'updateStepScreenshot') {
    updateStepScreenshot(message, sender).then(() => sendResponse({ ok: true }));
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
  const current = await getStorage(['steps', 'isRecording', 'recordingTabId']);

  await setStorage({
    steps: Array.isArray(current.steps) ? current.steps : DEFAULT_STATE.steps,
    isRecording: typeof current.isRecording === 'boolean' ? current.isRecording : DEFAULT_STATE.isRecording,
    recordingTabId: typeof current.recordingTabId === 'number' ? current.recordingTabId : DEFAULT_STATE.recordingTabId
  });

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
