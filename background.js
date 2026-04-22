importScripts(
  'background/asset-store.js',
  'background/session-store.js',
  'background/migration.js'
);

let migrationPromise = null;

function ensureMigrationsReady() {
  if (!migrationPromise) {
    migrationPromise = runMigrationsIfNeeded().catch((error) => {
      console.error('[migration] failed:', error);
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
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

function getTabById(tabId) {
  return new Promise((resolve) => {
    if (typeof tabId !== 'number') {
      resolve(null);
      return;
    }

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(tab || null);
    });
  });
}

function respondWithPromise(sendResponse, promise) {
  promise
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      console.error('[background] action failed:', error);
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : 'unknown_error'
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

async function getRecorderState() {
  await ensureMigrationsReady();
  return getRecordingState();
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

async function startRecording(tabId) {
  await ensureMigrationsReady();
  const activeTab = await getTabById(tabId);
  const session = await startRecordingSession(tabId, activeTab ? activeTab.windowId : null);

  let success = await sendMessageToTab(tabId, { action: 'startRecording' });
  if (!success) {
    console.warn('[startRecording] first send failed, trying to inject recorder scripts');
    const injected = await ensureRecorderScript(tabId);
    if (injected) {
      success = await sendMessageToTab(tabId, { action: 'startRecording' });
    }
  }

  if (success) {
    await sendMessageToTab(tabId, {
      action: 'setManualConfirmMode',
      enabled: session.mode === 'manual'
    });
  } else {
    await stopRecordingSession();
  }

  return success;
}

async function stopRecording(tabId) {
  await ensureMigrationsReady();
  const state = await getRecorderState();
  const targetTabId = state.recordingTabId !== null ? state.recordingTabId : tabId;

  await stopRecordingSession();
  await sendMessageToTab(targetTabId, { action: 'stopRecording' });
}

async function handleCommitCapturedStep(message, sender) {
  if (!message || !message.step) {
    console.error('[commitCapturedStep] invalid message or missing step');
    return { ok: false, error: 'invalid_message' };
  }

  await ensureMigrationsReady();
  return commitCapturedStep(message.step, {
    tabId: sender.tab ? sender.tab.id : null,
    url: sender.tab ? sender.tab.url : '',
    title: sender.tab ? sender.tab.title : ''
  });
}

async function buildPanelStep(step) {
  let screenshot = null;
  const primaryAssetId = step.capture && step.capture.primaryAssetId
    ? step.capture.primaryAssetId
    : (step.primaryAssetId || null);

  if (primaryAssetId) {
    const preview = await getAssetPreview(primaryAssetId);
    screenshot = preview ? preview.dataUrl : null;
  }

  return {
    ...step,
    type: step.type || step.actionType || 'click',
    selector: step.selector || (step.target && step.target.selector) || '',
    text: step.text || (step.target && step.target.text) || '',
    url: step.url || (step.page && step.page.url) || '',
    title: step.title || (step.page && step.page.title) || '',
    screenshot
  };
}

async function buildPanelState() {
  await ensureMigrationsReady();
  const [state, activeSession] = await Promise.all([
    getRecorderState(),
    getActiveSession()
  ]);

  if (!activeSession) {
    return {
      ...state,
      steps: []
    };
  }

  const steps = await listSessionSteps(activeSession.id);
  return {
    ...state,
    sessionId: activeSession.id,
    steps: await Promise.all(steps.map((step) => buildPanelStep(step)))
  };
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
      sendResponse({ tab: tab || null });
    });
    return true;
  }

  if (message.action === 'getState') {
    respondWithPromise(sendResponse, buildPanelState());
    return true;
  }

  if (message.action === 'getRecordingState') {
    respondWithPromise(sendResponse, getRecorderState().then((state) => ({
        isRecording: state.isRecording,
        recordingTabId: state.recordingTabId,
        recordingMode: state.recordingMode
      })));
    return true;
  }

  if (message.action === 'startRecording') {
    respondWithPromise(sendResponse, startRecording(message.tabId).then((ok) => ({ ok })));
    return true;
  }

  if (message.action === 'stopRecording') {
    respondWithPromise(sendResponse, stopRecording(message.tabId).then(() => ({ ok: true })));
    return true;
  }

  if (message.action === 'setManualConfirmMode') {
    respondWithPromise(sendResponse, setManualConfirmMode(message.tabId, message.enabled).then((ok) => ({ ok })));
    return true;
  }

  if (message.action === 'updateRecordingMode') {
    respondWithPromise(sendResponse, ensureMigrationsReady()
      .then(() => updateRecordingMode(message.mode))
      .then(async () => {
        const state = await getRecorderState();
        if (typeof state.recordingTabId === 'number') {
          await sendMessageToTab(state.recordingTabId, {
            action: 'setManualConfirmMode',
            enabled: state.recordingMode === 'manual'
          });
        }
        return { ok: true };
      }));
    return true;
  }

  if (message.action === 'captureStep') {
    respondWithPromise(sendResponse, handleCommitCapturedStep({
      step: {
        id: message.stepId,
        type: message.type,
        selector: message.selector,
        text: message.text,
        screenshot: message.screenshot || null
      }
    }, sender));
    return true;
  }

  if (message.action === 'commitCapturedStep') {
    respondWithPromise(sendResponse, handleCommitCapturedStep(message, sender));
    return true;
  }

  if (message.action === 'updateStepScreenshot') {
    sendResponse({ ok: false, error: 'deprecated' });
    return false;
  }

  if (message.action === 'getAssetPreview') {
    respondWithPromise(sendResponse, ensureMigrationsReady()
      .then(() => getAssetPreview(message.assetId))
      .then((asset) => ({ asset })));
    return true;
  }

  if (message.action === 'deleteStep') {
    respondWithPromise(sendResponse, ensureMigrationsReady().then(() => deleteStep(message.stepId)));
    return true;
  }

  if (message.action === 'clearSteps') {
    respondWithPromise(sendResponse, ensureMigrationsReady().then(() => clearActiveSessionSteps()));
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
  }).catch((error) => {
    console.error('[tabs.onUpdated] failed to resume recorder:', error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getRecorderState().then((state) => {
    if (state.recordingTabId !== tabId) {
      return;
    }

    stopRecordingSession().catch((error) => {
      console.error('[tabs.onRemoved] failed to stop recorder:', error);
    });
  }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  await ensureMigrationsReady();
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  ensureMigrationsReady().catch(() => {});
});

ensureMigrationsReady().catch(() => {});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
