async function buildPanelStepFromRecord(step) {
  const constants = self.StepRecorderConstants || {};
  const previewStatus = constants.PREVIEW_STATUS || {};
  const primaryAssetId = step && step.capture && step.capture.primaryAssetId
    ? step.capture.primaryAssetId
    : null;
  const assetMeta = primaryAssetId ? await getAssetMeta(primaryAssetId) : null;

  return {
    id: step.id,
    sessionId: step.sessionId,
    seq: step.seq,
    status: step.status,
    actionType: step.actionType,
    page: step.page || { url: '', title: '' },
    target: step.target || {
      tagName: '',
      selector: '',
      fallbackSelectors: [],
      role: '',
      text: '',
      ariaLabel: '',
      placeholder: '',
      href: '',
      dataTestId: '',
      rect: null,
      framePath: []
    },
    capture: step.capture || {
      primaryAssetId: null,
      beforeAssetId: null,
      afterAssetId: null
    },
    preview: {
      status: primaryAssetId
        ? (previewStatus.IDLE || 'idle')
        : (previewStatus.UNAVAILABLE || 'unavailable'),
      assetId: primaryAssetId,
      width: assetMeta ? assetMeta.width : null,
      height: assetMeta ? assetMeta.height : null,
      byteSize: assetMeta ? assetMeta.byteSize : 0,
      mimeType: assetMeta ? assetMeta.mimeType : ''
    },
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
    error: step.error || null
  };
}

async function buildRecorderSnapshot() {
  const recordingState = await getRecordingState();
  const activeSession = await getActiveSession();

  if (!activeSession) {
    return {
      isRecording: recordingState.isRecording,
      recordingTabId: recordingState.recordingTabId,
      recordingMode: recordingState.recordingMode,
      activeSessionId: null,
      session: null,
      steps: []
    };
  }

  const steps = await listSessionSteps(activeSession.id);
  return {
    isRecording: recordingState.isRecording,
    recordingTabId: recordingState.recordingTabId,
    recordingMode: recordingState.recordingMode,
    activeSessionId: activeSession.id,
    session: activeSession,
    steps: await Promise.all(steps.map(function mapStep(step) {
      return buildPanelStepFromRecord(step);
    }))
  };
}

async function startRecordingSessionFlow(payload, context) {
  await context.ensureMigrationsReady();

  const tabId = typeof payload.tabId === 'number'
    ? payload.tabId
    : (typeof context.getCurrentActiveTabId === 'function' ? await context.getCurrentActiveTabId() : null);

  if (typeof tabId !== 'number') {
    return { ok: false, error: 'invalid_tab' };
  }

  const tab = await context.getTabById(tabId);
  if (!tab) {
    return { ok: false, error: 'tab_not_found' };
  }

  if (payload && payload.clearExisting) {
    await clearActiveSessionSteps();
  }

  const settings = await getRecorderSettings();
  const targetMode = (payload && payload.mode) ? payload.mode : (settings.recordingMode || 'auto');
  
  if (payload && payload.mode) {
    await updateRecordingMode(payload.mode);
  }

  const resumeExisting = payload && payload.resumeExisting;
  const session = await startRecordingSession(tabId, tab.windowId, resumeExisting);
  const messages = self.StepRecorderMessages;

  let started = await context.sendMessageToTab(tabId, {
    type: messages.BACKGROUND_TO_CONTENT.RUNTIME_START,
    payload: {
      sessionId: session.id,
      mode: targetMode
    }
  });

  if (!started) {
    const injected = await context.ensureRecorderScript(tabId);
    if (injected) {
      started = await context.sendMessageToTab(tabId, {
        type: messages.BACKGROUND_TO_CONTENT.RUNTIME_START,
        payload: {
          sessionId: session.id,
          mode: targetMode
        }
      });
    }
  }

  if (!started) {
    await stopRecordingSession();
    return { ok: false, error: 'runtime_start_failed' };
  }

  await context.sendMessageToTab(tabId, {
    type: messages.BACKGROUND_TO_CONTENT.RUNTIME_CONFIGURE,
    payload: {
      sessionId: session.id,
      mode: targetMode
    }
  });

  return {
    ok: true,
    session: session,
    snapshot: await buildRecorderSnapshot()
  };
}

async function stopRecordingSessionFlow(payload, context) {
  await context.ensureMigrationsReady();
  const messages = self.StepRecorderMessages;

  const state = await getRecordingState();
  const targetTabId = typeof state.recordingTabId === 'number'
    ? state.recordingTabId
    : (payload && typeof payload.tabId === 'number' ? payload.tabId : null);

  const stoppedSession = await stopRecordingSession();

  if (typeof targetTabId === 'number') {
    await context.sendMessageToTab(targetTabId, {
      type: messages.BACKGROUND_TO_CONTENT.RUNTIME_STOP,
      payload: {
        sessionId: stoppedSession ? stoppedSession.id : null
      }
    });
  }

  return {
    ok: true,
    session: stoppedSession,
    snapshot: await buildRecorderSnapshot()
  };
}

async function commitCapturedStepFlow(payload, senderContext, context) {
  await context.ensureMigrationsReady();
  const result = await commitCapturedStep(payload, senderContext);
  if (!result || result.ok === false) {
    return result || { ok: false, error: 'commit_failed' };
  }

  const step = await getStepRecord(result.stepId);
  return {
    ok: true,
    stepId: result.stepId,
    step: step || null,
    panelStep: step ? await buildPanelStepFromRecord(step) : null,
    deduplicated: result.deduplicated === true
  };
}

function applyAiRewriteToDocument(documentPayload, aiResult) {
  if (!aiResult || !aiResult.output) {
    return documentPayload;
  }

  const schemas = self.StepRecorderSchemas || {};
  const rewrittenMap = new Map();
  const rewrittenSteps = Array.isArray(aiResult.output.rewrittenSteps)
    ? aiResult.output.rewrittenSteps
    : [];

  rewrittenSteps.forEach(function eachStep(step) {
    if (step && step.stepId) {
      rewrittenMap.set(String(step.stepId), step);
    }
  });

  const nextDocument = {
    session: documentPayload.session,
    title: aiResult.output.title || documentPayload.title || '步骤指南',
    summary: aiResult.output.summary || '',
    sections: Array.isArray(aiResult.output.sections) ? aiResult.output.sections : [],
    steps: (documentPayload.steps || []).map(function mapStep(step) {
      const rewrite = rewrittenMap.get(step.stepId);
      const nextStep = {
        ...step,
        title: rewrite && rewrite.title ? rewrite.title : step.title,
        instruction: rewrite && rewrite.instruction ? rewrite.instruction : step.instruction
      };

      if (schemas && typeof schemas.createDocumentStep === 'function') {
        return schemas.createDocumentStep(nextStep);
      }

      return nextStep;
    })
  };

  return nextDocument;
}

async function buildDocumentResult(payload) {
  const sessionId = payload && payload.sessionId ? payload.sessionId : null;
  const format = payload && payload.format ? payload.format : 'markdown';
  const useAi = Boolean(payload && payload.useAi);
  const prompt = payload && payload.prompt ? String(payload.prompt).trim() : '';
  const settings = await getRecorderSettings();
  const canonicalDocument = await buildCanonicalDocument(sessionId);
  let finalDocument = canonicalDocument;
  let aiResult = {
    enabled: useAi,
    status: 'disabled',
    output: null
  };

  if (useAi) {
    aiResult = await rewriteDocumentWithAi({
      session: canonicalDocument.session,
      steps: canonicalDocument.steps,
      language: settings.ai && settings.ai.language ? settings.ai.language : 'zh-CN',
      prompt: prompt
    }, settings.ai || {});
    finalDocument = applyAiRewriteToDocument(canonicalDocument, aiResult);
  }

  const assets = [];
  const steps = Array.isArray(finalDocument.steps) ? finalDocument.steps : [];

  for (const step of steps) {
    if (!step.primaryAssetId) {
      continue;
    }

    const preview = await getAssetPreview(step.primaryAssetId);
    if (!preview || !preview.dataUrl) {
      continue;
    }

    assets.push({
      assetId: step.primaryAssetId,
      filename: 'images/' + step.primaryAssetId + '.png',
      mimeType: preview.mimeType || 'image/png',
      dataUrl: preview.dataUrl
    });
  }

  const assetPathResolver = function resolveAssetPath(assetId) {
    return 'images/' + assetId + '.png';
  };

  let filename = 'steps-guide.md';
  let mimeType = 'text/markdown;charset=utf-8';
  let content = '';

  if (format === 'html') {
    filename = 'steps-guide.html';
    mimeType = 'text/html;charset=utf-8';
    content = renderHtml(finalDocument, { assetPathResolver: assetPathResolver });
  } else if (format === 'json') {
    filename = 'steps-guide.json';
    mimeType = 'application/json;charset=utf-8';
    content = JSON.stringify(finalDocument, null, 2);
  } else {
    content = renderMarkdown(finalDocument, { assetPathResolver: assetPathResolver });
  }

  return {
    ok: true,
    document: finalDocument,
    rendered: {
      format: format,
      filename: filename,
      mimeType: mimeType,
      content: content
    },
    assets: assets,
    ai: {
      enabled: useAi,
      status: aiResult && aiResult.status ? aiResult.status : 'disabled',
      provider: aiResult && aiResult.provider ? aiResult.provider : null,
      model: aiResult && aiResult.model ? aiResult.model : null,
      error: aiResult && aiResult.error ? aiResult.error : null
    }
  };
}
