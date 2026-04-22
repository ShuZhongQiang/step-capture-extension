const RECORDER_SCHEMA_VERSION = 2;
const STEP_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  FAILED: 'failed'
};
const SESSION_STATUS = {
  RECORDING: 'recording',
  STOPPED: 'stopped'
};
const RECORDER_STORAGE_KEYS = {
  META: 'recorder:meta',
  SETTINGS: 'recorder:settings',
  ACTIVE_SESSION_ID: 'recorder:activeSessionId',
  SESSION_INDEX: 'recorder:sessionIndex',
  SESSION: (sessionId) => `recorder:session:${sessionId}`,
  SESSION_STEPS: (sessionId) => `recorder:sessionSteps:${sessionId}`,
  STEP: (stepId) => `recorder:step:${stepId}`,
  ASSET_META: (assetId) => `recorder:assetMeta:${assetId}`
};

const sessionWriteLocks = new Map();

function getStorageLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorageLocal(payload) {
  return new Promise((resolve) => {
    chrome.storage.local.set(payload, resolve);
  });
}

function removeStorageLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getRecorderMeta() {
  const result = await getStorageLocal([RECORDER_STORAGE_KEYS.META]);
  return result[RECORDER_STORAGE_KEYS.META] || null;
}

async function setRecorderMeta(meta) {
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.META]: meta
  });
}

async function getRecorderSettings() {
  const result = await getStorageLocal([RECORDER_STORAGE_KEYS.SETTINGS]);
  return {
    recordingMode: 'auto',
    ...(result[RECORDER_STORAGE_KEYS.SETTINGS] || {})
  };
}

async function saveRecorderSettings(partialSettings) {
  const current = await getRecorderSettings();
  const next = {
    ...current,
    ...partialSettings
  };

  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.SETTINGS]: next
  });

  return next;
}

async function getSessionRecord(sessionId) {
  if (!sessionId) {
    return null;
  }

  const key = RECORDER_STORAGE_KEYS.SESSION(sessionId);
  const result = await getStorageLocal([key]);
  return result[key] || null;
}

async function setSessionRecord(session) {
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.SESSION(session.id)]: session
  });
  return session;
}

async function getSessionIndex() {
  const result = await getStorageLocal([RECORDER_STORAGE_KEYS.SESSION_INDEX]);
  return Array.isArray(result[RECORDER_STORAGE_KEYS.SESSION_INDEX])
    ? result[RECORDER_STORAGE_KEYS.SESSION_INDEX]
    : [];
}

async function setSessionIndex(sessionIds) {
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.SESSION_INDEX]: sessionIds
  });
}

async function ensureSessionIndexed(sessionId) {
  const sessionIndex = await getSessionIndex();
  if (sessionIndex.includes(sessionId)) {
    return;
  }

  await setSessionIndex([sessionId, ...sessionIndex]);
}

async function setActiveSessionId(sessionId) {
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.ACTIVE_SESSION_ID]: sessionId
  });
}

async function getActiveSessionId() {
  const result = await getStorageLocal([RECORDER_STORAGE_KEYS.ACTIVE_SESSION_ID]);
  return result[RECORDER_STORAGE_KEYS.ACTIVE_SESSION_ID] || null;
}

async function createSession(sessionInput = {}) {
  const sessionId = sessionInput.id || createId('session');
  const existing = await getSessionRecord(sessionId);

  if (existing) {
    await ensureSessionIndexed(sessionId);
    if (sessionInput.setActive !== false) {
      await setActiveSessionId(sessionId);
    }
    return existing;
  }

  const now = new Date().toISOString();
  const session = {
    id: sessionId,
    schemaVersion: RECORDER_SCHEMA_VERSION,
    status: sessionInput.status || SESSION_STATUS.RECORDING,
    mode: sessionInput.mode || 'auto',
    tabId: typeof sessionInput.tabId === 'number' ? sessionInput.tabId : null,
    windowId: typeof sessionInput.windowId === 'number' ? sessionInput.windowId : null,
    startedAt: sessionInput.startedAt || now,
    endedAt: sessionInput.endedAt || null,
    stepCount: typeof sessionInput.stepCount === 'number' ? sessionInput.stepCount : 0,
    metadata: sessionInput.metadata || {}
  };

  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.SESSION(sessionId)]: session,
    [RECORDER_STORAGE_KEYS.SESSION_STEPS(sessionId)]: [],
    [RECORDER_STORAGE_KEYS.ACTIVE_SESSION_ID]: sessionId
  });
  await ensureSessionIndexed(sessionId);

  return session;
}

async function getActiveSession() {
  const sessionId = await getActiveSessionId();
  return getSessionRecord(sessionId);
}

async function getStepRecord(stepId) {
  const key = RECORDER_STORAGE_KEYS.STEP(stepId);
  const result = await getStorageLocal([key]);
  return result[key] || null;
}

async function getSessionStepIds(sessionId) {
  const key = RECORDER_STORAGE_KEYS.SESSION_STEPS(sessionId);
  const result = await getStorageLocal([key]);
  return Array.isArray(result[key]) ? result[key] : [];
}

async function setSessionStepIds(sessionId, stepIds) {
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.SESSION_STEPS(sessionId)]: stepIds
  });
}

async function updateSessionStepCount(sessionId, stepCount) {
  const session = await getSessionRecord(sessionId);
  if (!session) {
    return null;
  }

  const updated = {
    ...session,
    stepCount,
    updatedAt: new Date().toISOString()
  };

  await setSessionRecord(updated);
  return updated;
}

async function saveStep(stepInput) {
  const stepId = stepInput.id || createId('step');
  const sessionId = stepInput.sessionId;
  const existing = await getStepRecord(stepId);
  const stepIds = await getSessionStepIds(sessionId);
  const now = new Date().toISOString();
  const alreadyIndexed = stepIds.includes(stepId);
  const seq = typeof stepInput.seq === 'number'
    ? stepInput.seq
    : existing && typeof existing.seq === 'number'
      ? existing.seq
      : stepIds.length + (alreadyIndexed ? 0 : 1);

  const stepRecord = {
    id: stepId,
    sessionId,
    seq,
    status: stepInput.status || STEP_STATUS.READY,
    actionType: stepInput.actionType || 'click',
    page: {
      url: stepInput.page && stepInput.page.url ? stepInput.page.url : (stepInput.url || ''),
      title: stepInput.page && stepInput.page.title ? stepInput.page.title : (stepInput.title || '')
    },
    target: stepInput.target || {
      selector: stepInput.selector || '',
      text: stepInput.text || '',
      tagName: ''
    },
    capture: {
      primaryAssetId: stepInput.capture && stepInput.capture.primaryAssetId
        ? stepInput.capture.primaryAssetId
        : (stepInput.primaryAssetId || null),
      beforeAssetId: stepInput.capture && stepInput.capture.beforeAssetId
        ? stepInput.capture.beforeAssetId
        : null,
      afterAssetId: stepInput.capture && stepInput.capture.afterAssetId
        ? stepInput.capture.afterAssetId
        : null
    },
    createdAt: existing ? existing.createdAt : (stepInput.createdAt || now),
    updatedAt: now,
    type: stepInput.type || stepInput.actionType || 'click',
    selector: stepInput.selector || (stepInput.target && stepInput.target.selector) || '',
    text: stepInput.text || (stepInput.target && stepInput.target.text) || '',
    rect: stepInput.rect || null,
    tabId: typeof stepInput.tabId === 'number' ? stepInput.tabId : null,
    url: stepInput.url || (stepInput.page && stepInput.page.url) || '',
    title: stepInput.title || (stepInput.page && stepInput.page.title) || '',
    timestamp: stepInput.timestamp || existing?.timestamp || now,
    metadata: {
      ...(existing && existing.metadata ? existing.metadata : {}),
      ...(stepInput.metadata || {})
    }
  };

  const payload = {
    [RECORDER_STORAGE_KEYS.STEP(stepId)]: stepRecord
  };

  if (!alreadyIndexed) {
    payload[RECORDER_STORAGE_KEYS.SESSION_STEPS(sessionId)] = [...stepIds, stepId];
  }

  await setStorageLocal(payload);
  await updateSessionStepCount(sessionId, alreadyIndexed ? stepIds.length : stepIds.length + 1);

  return stepRecord;
}

async function listSessionSteps(sessionId) {
  const stepIds = await getSessionStepIds(sessionId);
  const steps = await Promise.all(stepIds.map((stepId) => getStepRecord(stepId)));
  return steps
    .filter(Boolean)
    .sort((left, right) => (left.seq || 0) - (right.seq || 0));
}

async function saveAssetMeta(assetMeta) {
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.ASSET_META(assetMeta.id)]: assetMeta
  });
}

async function getAssetMeta(assetId) {
  const key = RECORDER_STORAGE_KEYS.ASSET_META(assetId);
  const result = await getStorageLocal([key]);
  return result[key] || null;
}

async function deleteAssetMeta(assetId) {
  await removeStorageLocal([RECORDER_STORAGE_KEYS.ASSET_META(assetId)]);
}

async function deleteStep(stepId) {
  const step = await getStepRecord(stepId);
  if (!step) {
    return { ok: true, deleted: false };
  }

  const deletedAssetIds = await deleteStepAssets(stepId);
  for (const assetId of deletedAssetIds) {
    await deleteAssetMeta(assetId);
  }

  const stepIds = await getSessionStepIds(step.sessionId);
  const nextStepIds = stepIds.filter((currentStepId) => currentStepId !== stepId);

  await removeStorageLocal([RECORDER_STORAGE_KEYS.STEP(stepId)]);
  await setSessionStepIds(step.sessionId, nextStepIds);
  await updateSessionStepCount(step.sessionId, nextStepIds.length);

  return { ok: true, deleted: true, stepId };
}

async function clearActiveSessionSteps() {
  const activeSession = await getActiveSession();
  if (!activeSession) {
    return { ok: true, deletedCount: 0 };
  }

  const steps = await listSessionSteps(activeSession.id);
  for (const step of steps) {
    await deleteStep(step.id);
  }

  return { ok: true, deletedCount: steps.length };
}

async function getRecordingState() {
  const activeSession = await getActiveSession();
  const settings = await getRecorderSettings();
  return {
    isRecording: Boolean(activeSession && activeSession.status === SESSION_STATUS.RECORDING),
    recordingTabId: activeSession && typeof activeSession.tabId === 'number' ? activeSession.tabId : null,
    recordingMode: activeSession ? activeSession.mode : settings.recordingMode,
    activeSessionId: activeSession ? activeSession.id : null
  };
}

async function startRecordingSession(tabId, windowId) {
  const settings = await getRecorderSettings();
  const activeSession = await getActiveSession();

  if (activeSession && activeSession.status === SESSION_STATUS.RECORDING && activeSession.tabId === tabId) {
    return activeSession;
  }

  if (activeSession && activeSession.status === SESSION_STATUS.RECORDING && activeSession.tabId !== tabId) {
    await setSessionRecord({
      ...activeSession,
      status: SESSION_STATUS.STOPPED,
      endedAt: new Date().toISOString()
    });
  }

  const session = await createSession({
    status: SESSION_STATUS.RECORDING,
    mode: settings.recordingMode || 'auto',
    tabId,
    windowId: typeof windowId === 'number' ? windowId : null
  });

  return session;
}

async function stopRecordingSession() {
  const activeSession = await getActiveSession();
  if (!activeSession || activeSession.status !== SESSION_STATUS.RECORDING) {
    return null;
  }

  const stoppedSession = {
    ...activeSession,
    status: SESSION_STATUS.STOPPED,
    endedAt: new Date().toISOString()
  };

  await setSessionRecord(stoppedSession);
  return stoppedSession;
}

async function updateRecordingMode(mode) {
  const settings = await saveRecorderSettings({ recordingMode: mode });
  const activeSession = await getActiveSession();

  if (activeSession && activeSession.status === SESSION_STATUS.RECORDING) {
    await setSessionRecord({
      ...activeSession,
      mode
    });
  }

  return settings;
}

async function commitCapturedStep(stepInput, senderContext) {
  const stepId = stepInput.id || createId('step');
  const lockKey = `${stepId}:${senderContext.tabId || 'no-tab'}`;

  if (sessionWriteLocks.has(lockKey)) {
    return { ok: true, stepId, deduplicated: true };
  }

  sessionWriteLocks.set(lockKey, true);

  try {
    const activeSession = await getActiveSession();
    if (!activeSession || activeSession.status !== SESSION_STATUS.RECORDING) {
      return { ok: false, error: 'not_recording' };
    }

    if (typeof senderContext.tabId === 'number' && typeof activeSession.tabId === 'number' && senderContext.tabId !== activeSession.tabId) {
      return { ok: false, error: 'tab_mismatch' };
    }

    const existing = await getStepRecord(stepId);
    if (existing) {
      return { ok: true, stepId, deduplicated: true };
    }

    const pendingStep = await saveStep({
      id: stepId,
      sessionId: activeSession.id,
      status: STEP_STATUS.PENDING,
      actionType: stepInput.actionType || stepInput.type || 'click',
      type: stepInput.type || stepInput.actionType || 'click',
      target: stepInput.target || {
        selector: stepInput.selector || '',
        text: stepInput.text || '',
        tagName: ''
      },
      selector: stepInput.selector || (stepInput.target && stepInput.target.selector) || '',
      text: stepInput.text || (stepInput.target && stepInput.target.text) || '',
      rect: stepInput.rect || null,
      tabId: senderContext.tabId,
      url: senderContext.url || '',
      title: senderContext.title || '',
      page: {
        url: senderContext.url || '',
        title: senderContext.title || ''
      },
      timestamp: new Date().toISOString(),
      capture: {
        primaryAssetId: null,
        beforeAssetId: null,
        afterAssetId: null
      }
    });

    try {
      let assetMeta = null;
      if (stepInput.screenshot) {
        assetMeta = await putImageAsset({
          id: createId('asset'),
          sessionId: activeSession.id,
          stepId,
          kind: 'primary',
          mimeType: 'image/png',
          dataUrl: stepInput.screenshot
        });
        await saveAssetMeta(assetMeta);
      }

      const readyStep = await saveStep({
        ...pendingStep,
        status: STEP_STATUS.READY,
        capture: {
          primaryAssetId: assetMeta ? assetMeta.id : null,
          beforeAssetId: null,
          afterAssetId: null
        },
        primaryAssetId: assetMeta ? assetMeta.id : null
      });

      return { ok: true, stepId, step: readyStep };
    } catch (error) {
      await saveStep({
        ...pendingStep,
        status: STEP_STATUS.FAILED,
        metadata: {
          ...(pendingStep.metadata || {}),
          error: error && error.message ? error.message : 'asset_write_failed'
        }
      });
      return { ok: false, error: 'asset_write_failed', stepId };
    }
  } finally {
    sessionWriteLocks.delete(lockKey);
  }
}
