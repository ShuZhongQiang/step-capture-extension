const RECORDER_CONSTANTS = self.StepRecorderConstants || {};
const RECORDER_SCHEMAS = self.StepRecorderSchemas || {};
const RECORDER_SCHEMA_VERSION = RECORDER_CONSTANTS.SCHEMA_VERSION || 2;
const STEP_STATUS = RECORDER_CONSTANTS.STEP_STATUS || {
  PENDING: 'pending',
  READY: 'ready',
  FAILED: 'failed'
};
const SESSION_STATUS = RECORDER_CONSTANTS.SESSION_STATUS || {
  RECORDING: 'recording',
  STOPPED: 'stopped'
};
const COMMIT_STATUS = RECORDER_CONSTANTS.COMMIT_STATUS || {
  STARTED: 'started',
  ASSET_WRITTEN: 'asset_written',
  STORAGE_COMMITTED: 'storage_committed'
};
const RECORDER_STORAGE_KEYS = RECORDER_CONSTANTS.STORAGE_KEYS || {
  META: 'recorder:meta',
  SETTINGS: 'recorder:settings',
  ACTIVE_SESSION_ID: 'recorder:activeSessionId',
  SESSION_INDEX: 'recorder:sessionIndex',
  SESSION: function sessionKey(sessionId) {
    return 'recorder:session:' + sessionId;
  },
  SESSION_STEPS: function sessionStepsKey(sessionId) {
    return 'recorder:sessionSteps:' + sessionId;
  },
  STEP: function stepKey(stepId) {
    return 'recorder:step:' + stepId;
  },
  ASSET_META: function assetMetaKey(assetId) {
    return 'recorder:assetMeta:' + assetId;
  },
  PENDING_COMMIT: function pendingCommitKey(stepId) {
    return 'recorder:pendingCommit:' + stepId;
  }
};

const sessionWriteLocks = new Map();
const sessionStepMutationQueues = new Map();

function runWithSessionStepMutationLock(sessionId, task) {
  const key = sessionId ? String(sessionId) : '__no_session__';
  const previous = sessionStepMutationQueues.get(key) || Promise.resolve();
  const current = previous
    .catch(function ignorePreviousError() {})
    .then(function runTask() {
      return task();
    });

  sessionStepMutationQueues.set(key, current);

  return current.finally(function releaseQueue() {
    if (sessionStepMutationQueues.get(key) === current) {
      sessionStepMutationQueues.delete(key);
    }
  });
}

function toPositiveSeq(value) {
  const seq = Number(value);
  if (!Number.isFinite(seq)) {
    return null;
  }

  const normalized = Math.floor(seq);
  return normalized > 0 ? normalized : null;
}

function resolveUniqueSeq(stepRecords, stepId, preferredSeq) {
  const usedSeq = new Set();
  let maxSeq = 0;

  for (const step of stepRecords) {
    if (!step || step.id === stepId) {
      continue;
    }

    const seq = toPositiveSeq(step.seq);
    if (!seq) {
      continue;
    }

    usedSeq.add(seq);
    if (seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const candidate = toPositiveSeq(preferredSeq);
  if (candidate && !usedSeq.has(candidate)) {
    return candidate;
  }

  return maxSeq + 1;
}

function getStorageLocal(keys) {
  return new Promise(function resolveStorage(resolve) {
    chrome.storage.local.get(keys, resolve);
  });
}

function setStorageLocal(payload) {
  return new Promise(function resolveStorage(resolve) {
    chrome.storage.local.set(payload, resolve);
  });
}

function removeStorageLocal(keys) {
  return new Promise(function resolveStorage(resolve) {
    chrome.storage.local.remove(keys, resolve);
  });
}

function createId(prefix) {
  if (RECORDER_SCHEMAS && typeof RECORDER_SCHEMAS.createId === 'function') {
    return RECORDER_SCHEMAS.createId(prefix);
  }
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function createSessionRecord(input) {
  if (RECORDER_SCHEMAS && typeof RECORDER_SCHEMAS.createSessionRecord === 'function') {
    return RECORDER_SCHEMAS.createSessionRecord(input);
  }
  return input;
}

function normalizeStepRecord(input) {
  if (RECORDER_SCHEMAS && typeof RECORDER_SCHEMAS.normalizeStepRecord === 'function') {
    return RECORDER_SCHEMAS.normalizeStepRecord(input);
  }
  return input;
}

function createActionDraft(input) {
  if (RECORDER_SCHEMAS && typeof RECORDER_SCHEMAS.createActionDraft === 'function') {
    return RECORDER_SCHEMAS.createActionDraft(input);
  }
  return input;
}

function createAssetMeta(input) {
  if (RECORDER_SCHEMAS && typeof RECORDER_SCHEMAS.createAssetMeta === 'function') {
    return RECORDER_SCHEMAS.createAssetMeta(input);
  }
  return input;
}

function createPendingCommitRecord(input) {
  if (RECORDER_SCHEMAS && typeof RECORDER_SCHEMAS.createPendingCommitRecord === 'function') {
    return RECORDER_SCHEMAS.createPendingCommitRecord(input);
  }
  return input;
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
  const defaultAiSettings = RECORDER_CONSTANTS.DEFAULT_AI_SETTINGS || {};
  return {
    recordingMode: 'auto',
    ai: { ...defaultAiSettings },
    ...(result[RECORDER_STORAGE_KEYS.SETTINGS] || {}),
    ai: {
      ...defaultAiSettings,
      ...((result[RECORDER_STORAGE_KEYS.SETTINGS] || {}).ai || {})
    }
  };
}

async function saveRecorderSettings(partialSettings) {
  const current = await getRecorderSettings();
  const next = {
    ...current,
    ...(partialSettings || {}),
    ai: {
      ...(current.ai || {}),
      ...((partialSettings && partialSettings.ai) || {})
    }
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

async function setSessionRecord(sessionInput) {
  const session = createSessionRecord(sessionInput);
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

  await setSessionIndex([sessionId].concat(sessionIndex));
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

async function createSession(sessionInput) {
  const input = sessionInput || {};
  const sessionId = input.id || createId('session');
  const existing = await getSessionRecord(sessionId);

  if (existing) {
    await ensureSessionIndexed(sessionId);
    if (input.setActive !== false) {
      await setActiveSessionId(sessionId);
    }
    return existing;
  }

  const session = createSessionRecord({
    id: sessionId,
    status: input.status || SESSION_STATUS.RECORDING,
    mode: input.mode || 'auto',
    tabId: typeof input.tabId === 'number' ? input.tabId : null,
    windowId: typeof input.windowId === 'number' ? input.windowId : null,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    stepCount: typeof input.stepCount === 'number' ? input.stepCount : 0
  });

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
  if (!stepId) {
    return null;
  }

  const key = RECORDER_STORAGE_KEYS.STEP(stepId);
  const result = await getStorageLocal([key]);
  return result[key] || null;
}

async function getSessionStepIds(sessionId) {
  if (!sessionId) {
    return [];
  }

  const key = RECORDER_STORAGE_KEYS.SESSION_STEPS(sessionId);
  const result = await getStorageLocal([key]);
  return Array.isArray(result[key]) ? result[key] : [];
}

async function setSessionStepIds(sessionId, stepIds) {
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.SESSION_STEPS(sessionId)]: Array.isArray(stepIds) ? stepIds : []
  });
}

async function updateSessionStepCount(sessionId, stepCount) {
  const session = await getSessionRecord(sessionId);
  if (!session) {
    return null;
  }

  const updated = createSessionRecord({
    ...session,
    stepCount: stepCount,
    endedAt: session.endedAt,
    startedAt: session.startedAt
  });

  await setSessionRecord(updated);
  return updated;
}

async function calculateNextSeq(sessionId) {
  const stepIds = await getSessionStepIds(sessionId);
  const steps = await Promise.all(stepIds.map(function mapStep(stepId) {
    return getStepRecord(stepId);
  }));

  const validSteps = steps.filter(Boolean);
  if (validSteps.length === 0) {
    return 1;
  }

  const maxSeq = validSteps.reduce(function findMax(max, step) {
    return Math.max(max, step.seq || 0);
  }, 0);

  return maxSeq + 1;
}

async function saveStep(stepInput) {
  const normalized = normalizeStepRecord(stepInput);

  return runWithSessionStepMutationLock(normalized.sessionId, async function saveStepWithLock() {
    const existing = await getStepRecord(normalized.id);
    const stepIds = await getSessionStepIds(normalized.sessionId);
    const alreadyIndexed = stepIds.includes(normalized.id);
    const currentSteps = await Promise.all(stepIds.map(function mapStep(stepId) {
      return getStepRecord(stepId);
    }));

    let preferredSeq = null;
    if (typeof normalized.seq === 'number' && normalized.seq > 0) {
      preferredSeq = normalized.seq;
    } else if (existing && typeof existing.seq === 'number' && existing.seq > 0) {
      preferredSeq = existing.seq;
    } else if (alreadyIndexed) {
      const indexedPosition = stepIds.indexOf(normalized.id);
      preferredSeq = indexedPosition >= 0 ? indexedPosition + 1 : null;
    }

    const seq = resolveUniqueSeq(currentSteps, normalized.id, preferredSeq);
    const nextStep = normalizeStepRecord({
      ...normalized,
      seq: seq,
      createdAt: existing && existing.createdAt ? existing.createdAt : normalized.createdAt,
      updatedAt: new Date().toISOString()
    });

    const payload = {
      [RECORDER_STORAGE_KEYS.STEP(nextStep.id)]: nextStep
    };

    if (!alreadyIndexed) {
      payload[RECORDER_STORAGE_KEYS.SESSION_STEPS(nextStep.sessionId)] = stepIds.concat([nextStep.id]);
    }

    await setStorageLocal(payload);
    await updateSessionStepCount(nextStep.sessionId, alreadyIndexed ? stepIds.length : stepIds.length + 1);
    return nextStep;
  });
}

async function listSessionSteps(sessionId) {
  const stepIds = await getSessionStepIds(sessionId);
  const steps = await Promise.all(stepIds.map(function mapStep(stepId) {
    return getStepRecord(stepId);
  }));

  return steps
    .filter(Boolean)
    .sort(function sortBySeq(left, right) {
      return (left.seq || 0) - (right.seq || 0);
    });
}

async function saveAssetMeta(assetInput) {
  const assetMeta = createAssetMeta(assetInput);
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.ASSET_META(assetMeta.id)]: assetMeta
  });
  return assetMeta;
}

async function getAssetMeta(assetId) {
  if (!assetId) {
    return null;
  }

  const key = RECORDER_STORAGE_KEYS.ASSET_META(assetId);
  const result = await getStorageLocal([key]);
  return result[key] || null;
}

async function deleteAssetMeta(assetId) {
  if (!assetId) {
    return;
  }
  await removeStorageLocal([RECORDER_STORAGE_KEYS.ASSET_META(assetId)]);
}

async function savePendingCommit(pendingInput) {
  const pendingCommit = createPendingCommitRecord(pendingInput);
  await setStorageLocal({
    [RECORDER_STORAGE_KEYS.PENDING_COMMIT(pendingCommit.stepId)]: pendingCommit
  });
  return pendingCommit;
}

async function getPendingCommit(stepId) {
  if (!stepId) {
    return null;
  }

  const key = RECORDER_STORAGE_KEYS.PENDING_COMMIT(stepId);
  const result = await getStorageLocal([key]);
  return result[key] || null;
}

async function deletePendingCommit(stepId) {
  if (!stepId) {
    return;
  }

  await removeStorageLocal([RECORDER_STORAGE_KEYS.PENDING_COMMIT(stepId)]);
}

async function listPendingCommits() {
  const all = await getStorageLocal(null);
  const commits = [];

  Object.keys(all || {}).forEach(function eachKey(key) {
    if (key.startsWith('recorder:pendingCommit:') && all[key]) {
      commits.push(all[key]);
    }
  });

  return commits;
}

async function renumberSessionSteps(sessionId) {
  const stepIds = await getSessionStepIds(sessionId);
  const steps = await Promise.all(stepIds.map(function mapStep(stepId) {
    return getStepRecord(stepId);
  }));

  const validSteps = steps.filter(Boolean);
  validSteps.sort(function sortBySeq(left, right) {
    return (left.seq || 0) - (right.seq || 0);
  });

  const updates = {};
  for (let index = 0; index < validSteps.length; index++) {
    const step = validSteps[index];
    const newSeq = index + 1;
    if (step.seq !== newSeq) {
      const updated = normalizeStepRecord({
        ...step,
        seq: newSeq,
        updatedAt: new Date().toISOString()
      });
      updates[RECORDER_STORAGE_KEYS.STEP(step.id)] = updated;
    }
  }

  if (Object.keys(updates).length > 0) {
    await setStorageLocal(updates);
  }

  return validSteps.length;
}

async function deleteStep(stepId) {
  const step = await getStepRecord(stepId);
  if (!step) {
    await deletePendingCommit(stepId);
    return { ok: true, deleted: false };
  }

  return runWithSessionStepMutationLock(step.sessionId, async function deleteStepWithLock() {
    const latestStep = await getStepRecord(stepId);
    if (!latestStep) {
      await deletePendingCommit(stepId);
      return { ok: true, deleted: false };
    }

    const deletedAssetIds = await deleteStepAssets(stepId);
    for (const assetId of deletedAssetIds) {
      await deleteAssetMeta(assetId);
    }

    const stepIds = await getSessionStepIds(latestStep.sessionId);
    const nextStepIds = stepIds.filter(function filterStepId(currentStepId) {
      return currentStepId !== stepId;
    });

    await removeStorageLocal([
      RECORDER_STORAGE_KEYS.STEP(stepId),
      RECORDER_STORAGE_KEYS.PENDING_COMMIT(stepId)
    ]);
    await setSessionStepIds(latestStep.sessionId, nextStepIds);
    await updateSessionStepCount(latestStep.sessionId, nextStepIds.length);
    await renumberSessionSteps(latestStep.sessionId);

    return { ok: true, deleted: true, stepId: stepId };
  });
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

  return createSession({
    status: SESSION_STATUS.RECORDING,
    mode: settings.recordingMode || 'auto',
    tabId: tabId,
    windowId: typeof windowId === 'number' ? windowId : null
  });
}

async function stopRecordingSession() {
  const activeSession = await getActiveSession();
  if (!activeSession || activeSession.status !== SESSION_STATUS.RECORDING) {
    return null;
  }

  const stoppedSession = createSessionRecord({
    ...activeSession,
    status: SESSION_STATUS.STOPPED,
    endedAt: new Date().toISOString()
  });

  await setSessionRecord(stoppedSession);
  return stoppedSession;
}

async function updateRecordingMode(mode) {
  const settings = await saveRecorderSettings({ recordingMode: mode });
  const activeSession = await getActiveSession();

  if (activeSession) {
    await setSessionRecord({
      ...activeSession,
      mode: mode
    });
  }

  return settings;
}

function toActionDraft(stepInput, senderContext) {
  if (stepInput && stepInput.draft) {
    return createActionDraft(stepInput.draft);
  }

  return createActionDraft({
    actionId: stepInput && stepInput.id ? String(stepInput.id) : createId('action'),
    actionType: stepInput && stepInput.actionType ? String(stepInput.actionType) : 'click',
    page: {
      url: senderContext && senderContext.url ? senderContext.url : '',
      title: senderContext && senderContext.title ? senderContext.title : ''
    },
    target: stepInput && stepInput.target ? stepInput.target : null,
    capture: {
      strategy: 'before',
      primaryImageDataUrl: stepInput && stepInput.screenshot ? String(stepInput.screenshot) : null,
      annotationRect: stepInput && stepInput.rect ? stepInput.rect : null
    },
    meta: {
      manualConfirmed: false,
      capturedAt: new Date().toISOString()
    }
  });
}

async function finalizePendingCommit(pendingCommit) {
  const activeSession = await getSessionRecord(pendingCommit.sessionId);
  if (!activeSession) {
    throw new Error('session_not_found');
  }

  const nextStep = normalizeStepRecord({
    id: pendingCommit.stepId,
    sessionId: pendingCommit.sessionId,
    status: STEP_STATUS.READY,
    actionType: pendingCommit.draft.actionType,
    page: pendingCommit.draft.page,
    target: pendingCommit.draft.target,
    capture: {
      primaryAssetId: pendingCommit.assetMeta ? pendingCommit.assetMeta.id : null,
      beforeAssetId: null,
      afterAssetId: null
    },
    createdAt: pendingCommit.draft.meta.capturedAt,
    updatedAt: new Date().toISOString()
  });

  const step = await saveStep(nextStep);
  await deletePendingCommit(pendingCommit.stepId);
  return step;
}

async function recoverPendingCommits() {
  const pendingCommits = await listPendingCommits();
  const recovered = [];

  for (const pending of pendingCommits) {
    const record = createPendingCommitRecord(pending);

    try {
      if (record.status === COMMIT_STATUS.STARTED && record.draft && record.draft.capture && record.draft.capture.primaryImageDataUrl && !record.assetMeta) {
        const assetMeta = await putImageAsset({
          id: createId('asset'),
          sessionId: record.sessionId,
          stepId: record.stepId,
          kind: 'primary',
          mimeType: 'image/png',
          dataUrl: record.draft.capture.primaryImageDataUrl
        });

        record.assetMeta = createAssetMeta(assetMeta);
        record.status = COMMIT_STATUS.ASSET_WRITTEN;
        record.updatedAt = new Date().toISOString();
        await savePendingCommit(record);
      }

      if (record.assetMeta && record.status === COMMIT_STATUS.ASSET_WRITTEN) {
        const existingAssetMeta = await getAssetMeta(record.assetMeta.id);
        if (!existingAssetMeta) {
          await saveAssetMeta(record.assetMeta);
        }
      }

      const step = await finalizePendingCommit(record);
      recovered.push({ stepId: record.stepId, recovered: true, step: step });
    } catch (error) {
      console.error('[session-store] recover pending commit failed:', error);
      await savePendingCommit({
        ...record,
        error: error && error.message ? error.message : 'recover_failed',
        updatedAt: new Date().toISOString()
      });
    }
  }

  return recovered;
}

async function commitCapturedStep(stepInput, senderContext) {
  const normalizedContext = senderContext || {};
  const actionDraft = toActionDraft(stepInput, normalizedContext);
  const stepId = stepInput && stepInput.stepId
    ? String(stepInput.stepId)
    : String(actionDraft.actionId || createId('step'));
  const lockKey = stepId + ':' + (normalizedContext.tabId || 'no-tab');

  if (sessionWriteLocks.has(lockKey)) {
    return { ok: true, stepId: stepId, deduplicated: true };
  }

  sessionWriteLocks.set(lockKey, true);

  try {
    const activeSession = await getActiveSession();
    if (!activeSession || activeSession.status !== SESSION_STATUS.RECORDING) {
      return { ok: false, error: 'not_recording' };
    }

    const payloadSessionId = stepInput && stepInput.sessionId ? String(stepInput.sessionId) : activeSession.id;
    if (payloadSessionId !== activeSession.id) {
      return { ok: false, error: 'session_mismatch' };
    }

    if (
      typeof normalizedContext.tabId === 'number' &&
      typeof activeSession.tabId === 'number' &&
      normalizedContext.tabId !== activeSession.tabId
    ) {
      return { ok: false, error: 'tab_mismatch' };
    }

    const existing = await getStepRecord(stepId);
    if (existing) {
      return { ok: true, stepId: stepId, deduplicated: true };
    }

    const primaryImageDataUrl = actionDraft.capture && actionDraft.capture.primaryImageDataUrl
      ? actionDraft.capture.primaryImageDataUrl
      : null;

    let pendingCommit = await getPendingCommit(stepId);
    if (!pendingCommit) {
      pendingCommit = await savePendingCommit({
        stepId: stepId,
        sessionId: activeSession.id,
        status: COMMIT_STATUS.STARTED,
        draft: actionDraft,
        assetMeta: null,
        startedAt: actionDraft.meta && actionDraft.meta.capturedAt ? actionDraft.meta.capturedAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    if (primaryImageDataUrl && !pendingCommit.assetMeta) {
      let assetMeta = null;
      try {
        assetMeta = await putImageAsset({
          id: createId('asset'),
          sessionId: activeSession.id,
          stepId: stepId,
          kind: 'primary',
          mimeType: 'image/png',
          dataUrl: primaryImageDataUrl
        });
      } catch (error) {
        await savePendingCommit({
          ...pendingCommit,
          error: error && error.message ? error.message : 'asset_write_failed',
          updatedAt: new Date().toISOString()
        });
        return { ok: false, error: 'asset_write_failed', stepId: stepId };
      }

      pendingCommit = await savePendingCommit({
        ...pendingCommit,
        status: COMMIT_STATUS.ASSET_WRITTEN,
        assetMeta: createAssetMeta(assetMeta),
        updatedAt: new Date().toISOString(),
        error: null
      });
    }

    if (pendingCommit.assetMeta && !await getAssetMeta(pendingCommit.assetMeta.id)) {
      await saveAssetMeta(pendingCommit.assetMeta);
    }

    const readyStep = await finalizePendingCommit({
      ...pendingCommit,
      status: COMMIT_STATUS.STORAGE_COMMITTED,
      updatedAt: new Date().toISOString()
    });

    return { ok: true, stepId: stepId, step: readyStep };
  } catch (error) {
    console.error('[session-store] commitCapturedStep failed:', error);
    const pendingCommit = await getPendingCommit(stepId);

    if (pendingCommit) {
      await savePendingCommit({
        ...pendingCommit,
        error: error && error.message ? error.message : 'commit_failed',
        updatedAt: new Date().toISOString()
      });

      return {
        ok: false,
        error: error && error.message ? error.message : 'commit_failed',
        stepId: stepId
      };
    }

    try {
      const failedStep = normalizeStepRecord({
        id: stepId,
        sessionId: (await getActiveSessionId()) || '',
        status: STEP_STATUS.FAILED,
        actionType: actionDraft.actionType,
        page: actionDraft.page,
        target: actionDraft.target,
        capture: {
          primaryAssetId: null,
          beforeAssetId: null,
          afterAssetId: null
        },
        createdAt: actionDraft.meta.capturedAt,
        updatedAt: new Date().toISOString(),
        error: error && error.message ? error.message : 'commit_failed'
      });

      await saveStep(failedStep);
    } catch (saveError) {
      console.error('[session-store] failed to persist failed step:', saveError);
    }

    return {
      ok: false,
      error: error && error.message ? error.message : 'commit_failed',
      stepId: stepId
    };
  } finally {
    sessionWriteLocks.delete(lockKey);
  }
}
