const LEGACY_STORAGE_KEYS = {
  STEPS: 'steps',
  IS_RECORDING: 'isRecording',
  RECORDING_TAB_ID: 'recordingTabId',
  RECORDING_MODE: 'recordingMode'
};

const LEGACY_IMPORTED_SESSION_ID = 'legacy-imported-session';

async function runMigrationsIfNeeded() {
  const meta = await getRecorderMeta();
  if (meta && meta.schemaVersion >= RECORDER_SCHEMA_VERSION && meta.migrationState === 'completed') {
    return { migrated: false, reason: 'already_migrated' };
  }

  return migrateLegacySteps();
}

async function migrateLegacySteps() {
  const legacyState = await getStorageLocal([
    LEGACY_STORAGE_KEYS.STEPS,
    LEGACY_STORAGE_KEYS.IS_RECORDING,
    LEGACY_STORAGE_KEYS.RECORDING_TAB_ID,
    LEGACY_STORAGE_KEYS.RECORDING_MODE
  ]);
  const oldSteps = Array.isArray(legacyState[LEGACY_STORAGE_KEYS.STEPS])
    ? legacyState[LEGACY_STORAGE_KEYS.STEPS]
    : [];
  const oldMode = legacyState[LEGACY_STORAGE_KEYS.RECORDING_MODE] || 'auto';
  const oldIsRecording = legacyState[LEGACY_STORAGE_KEYS.IS_RECORDING] === true;
  const oldRecordingTabId = typeof legacyState[LEGACY_STORAGE_KEYS.RECORDING_TAB_ID] === 'number'
    ? legacyState[LEGACY_STORAGE_KEYS.RECORDING_TAB_ID]
    : null;
  const existingMeta = await getRecorderMeta();

  await saveRecorderSettings({ recordingMode: oldMode });

  if (oldSteps.length === 0 && !oldIsRecording) {
    await setRecorderMeta({
      schemaVersion: RECORDER_SCHEMA_VERSION,
      migrationState: 'completed',
      migratedAt: new Date().toISOString()
    });
    return { migrated: false, reason: 'no_legacy_data' };
  }

  if (existingMeta && existingMeta.migrationState !== 'completed') {
    await setRecorderMeta({
      ...existingMeta,
      schemaVersion: RECORDER_SCHEMA_VERSION,
      migrationState: 'in_progress',
      migrationStartedAt: existingMeta.migrationStartedAt || new Date().toISOString()
    });
  } else {
    await setRecorderMeta({
      schemaVersion: RECORDER_SCHEMA_VERSION,
      migrationState: 'in_progress',
      migrationStartedAt: new Date().toISOString()
    });
  }

  const importedSession = await createSession({
    id: LEGACY_IMPORTED_SESSION_ID,
    status: oldIsRecording ? SESSION_STATUS.RECORDING : SESSION_STATUS.STOPPED,
    mode: oldMode,
    tabId: oldRecordingTabId,
    metadata: {
      importedFromLegacy: true
    }
  });

  for (let index = 0; index < oldSteps.length; index += 1) {
    const oldStep = oldSteps[index];
    const stepId = oldStep && oldStep.id ? String(oldStep.id) : `legacy-step-${index + 1}`;
    const assetId = typeof oldStep.screenshot === 'string' && oldStep.screenshot.startsWith('data:image/')
      ? `legacy-asset-${stepId}`
      : null;

    if (assetId) {
      const existingAssetMeta = await getAssetMeta(assetId);
      if (!existingAssetMeta) {
        const assetMeta = await putImageAsset({
          id: assetId,
          sessionId: importedSession.id,
          stepId,
          kind: 'primary',
          mimeType: 'image/png',
          dataUrl: oldStep.screenshot
        });
        await saveAssetMeta(assetMeta);
      }
    }

    await saveStep({
      id: stepId,
      sessionId: importedSession.id,
      seq: index + 1,
      status: STEP_STATUS.READY,
      actionType: oldStep.actionType || oldStep.type || 'click',
      type: oldStep.type || oldStep.actionType || 'click',
      target: oldStep.target || {
        selector: oldStep.selector || '',
        text: oldStep.text || '',
        tagName: ''
      },
      selector: oldStep.selector || (oldStep.target && oldStep.target.selector) || '',
      text: oldStep.text || (oldStep.target && oldStep.target.text) || '',
      rect: oldStep.rect || null,
      tabId: typeof oldStep.tabId === 'number' ? oldStep.tabId : oldRecordingTabId,
      url: oldStep.url || '',
      title: oldStep.title || '',
      page: {
        url: oldStep.url || '',
        title: oldStep.title || ''
      },
      timestamp: oldStep.timestamp || new Date().toISOString(),
      capture: {
        primaryAssetId: assetId,
        beforeAssetId: null,
        afterAssetId: null
      },
      primaryAssetId: assetId,
      createdAt: oldStep.timestamp || new Date().toISOString()
    });
  }

  if (!oldIsRecording) {
    await stopRecordingSession();
  }

  await setRecorderMeta({
    schemaVersion: RECORDER_SCHEMA_VERSION,
    migrationState: 'completed',
    migratedAt: new Date().toISOString(),
    importedSessionId: importedSession.id
  });

  return {
    migrated: true,
    migratedStepsCount: oldSteps.length,
    sessionId: importedSession.id
  };
}
