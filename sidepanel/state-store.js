(function initPanelStateStore(global) {
  const constants = global.StepRecorderConstants || {};
  const previewStatus = constants.PREVIEW_STATUS || {};

  function sortSteps(stepList) {
    return stepList.slice().sort(function sortBySeq(a, b) {
      return (a.seq || 0) - (b.seq || 0);
    });
  }

  function normalizePreview(step) {
    const preview = step && step.preview ? step.preview : {};
    return {
      status: preview.status || (preview.assetId ? (previewStatus.IDLE || 'idle') : (previewStatus.UNAVAILABLE || 'unavailable')),
      assetId: preview.assetId || (step && step.capture && step.capture.primaryAssetId ? step.capture.primaryAssetId : null),
      width: Number.isFinite(preview.width) ? preview.width : null,
      height: Number.isFinite(preview.height) ? preview.height : null,
      byteSize: Number.isFinite(preview.byteSize) ? preview.byteSize : 0,
      mimeType: preview.mimeType || '',
      dataUrl: preview.dataUrl || null,
      error: preview.error || null
    };
  }

  function normalizeStep(step) {
    return {
      id: step.id,
      sessionId: step.sessionId || null,
      seq: step.seq || 0,
      status: step.status || 'ready',
      actionType: step.actionType || 'click',
      page: step.page || { url: '', title: '' },
      target: step.target || null,
      capture: step.capture || null,
      preview: normalizePreview(step),
      createdAt: step.createdAt || null,
      updatedAt: step.updatedAt || null,
      error: step.error || null
    };
  }

  function createInitialPanelState() {
    return {
      isRecording: false,
      recordingMode: 'auto',
      recordingTabId: null,
      activeSessionId: null,
      session: null,
      steps: [],
      documentStatus: 'idle',
      documentMessage: ''
    };
  }

  function mergeSnapshotStep(currentStep, snapshotStep) {
    if (!currentStep || !snapshotStep) {
      return snapshotStep;
    }

    const currentPreview = currentStep.preview || normalizePreview(currentStep);
    const snapshotPreview = snapshotStep.preview || normalizePreview(snapshotStep);
    const isSameAsset = currentPreview.assetId && currentPreview.assetId === snapshotPreview.assetId;

    if (!isSameAsset) {
      return snapshotStep;
    }

    const mergedPreview = {
      ...snapshotPreview
    };

    if (!mergedPreview.dataUrl && currentPreview.dataUrl) {
      mergedPreview.dataUrl = currentPreview.dataUrl;
      mergedPreview.status = previewStatus.READY || 'ready';
    } else if (currentPreview.status === previewStatus.LOADING && !mergedPreview.dataUrl) {
      mergedPreview.status = previewStatus.LOADING || 'loading';
    }

    return {
      ...snapshotStep,
      preview: mergedPreview
    };
  }

  function applySnapshot(currentState, snapshot) {
    const steps = Array.isArray(snapshot && snapshot.steps)
      ? sortSteps(snapshot.steps.map(normalizeStep)).map(function mergeStep(step) {
          const currentStep = currentState.steps.find(function findCurrentStep(item) {
            return item.id === step.id;
          });

          return mergeSnapshotStep(currentStep, step);
        })
      : [];

    return {
      ...currentState,
      isRecording: Boolean(snapshot && snapshot.isRecording),
      recordingMode: snapshot && snapshot.recordingMode ? snapshot.recordingMode : currentState.recordingMode,
      recordingTabId: snapshot && typeof snapshot.recordingTabId === 'number' ? snapshot.recordingTabId : null,
      activeSessionId: snapshot && snapshot.activeSessionId ? snapshot.activeSessionId : null,
      session: snapshot && snapshot.session ? snapshot.session : null,
      steps: steps
    };
  }

  function upsertStep(stepList, step) {
    const normalized = normalizeStep(step);
    const index = stepList.findIndex(function findIndex(item) {
      return item.id === normalized.id;
    });

    if (index < 0) {
      return sortSteps(stepList.concat([normalized]));
    }

    const next = stepList.slice();
    next[index] = {
      ...next[index],
      ...normalized,
      preview: {
        ...next[index].preview,
        ...normalized.preview
      }
    };
    return sortSteps(next);
  }

  function updateStepPreview(stepList, payload) {
    const stepId = payload && payload.stepId ? String(payload.stepId) : '';
    const asset = payload && payload.asset ? payload.asset : null;
    const status = payload && payload.status ? payload.status : null;
    const error = payload && payload.error ? payload.error : null;

    if (!stepId) {
      return stepList;
    }

    return stepList.map(function mapStep(step) {
      if (step.id !== stepId) {
        return step;
      }

      const nextPreview = {
        ...(step.preview || normalizePreview(step))
      };

      if (status) {
        nextPreview.status = status;
      }

      if (asset) {
        nextPreview.assetId = asset.id || nextPreview.assetId;
        nextPreview.width = Number.isFinite(asset.width) ? asset.width : nextPreview.width;
        nextPreview.height = Number.isFinite(asset.height) ? asset.height : nextPreview.height;
        nextPreview.mimeType = asset.mimeType || nextPreview.mimeType;
        nextPreview.dataUrl = asset.dataUrl || nextPreview.dataUrl;
        nextPreview.status = previewStatus.READY || 'ready';
        nextPreview.error = null;
      }

      if (error) {
        nextPreview.error = error;
      }

      return {
        ...step,
        preview: nextPreview
      };
    });
  }

  function applyPanelEvent(currentState, eventMessage) {
    if (!eventMessage || eventMessage.kind !== 'event') {
      return currentState;
    }

    const messages = global.StepRecorderMessages;

    if (eventMessage.type === messages.EVENT.SNAPSHOT) {
      return applySnapshot(currentState, eventMessage.payload || {});
    }

    if (eventMessage.type === messages.EVENT.SESSION_UPDATED) {
      const payload = eventMessage.payload || {};
      if (payload.snapshot) {
        return applySnapshot(currentState, payload.snapshot);
      }

      return {
        ...currentState,
        session: payload.session || currentState.session
      };
    }

    if (eventMessage.type === messages.EVENT.STEP_UPSERTED) {
      const payload = eventMessage.payload || {};
      if (!payload.step) {
        return currentState;
      }

      return {
        ...currentState,
        steps: upsertStep(currentState.steps, payload.step)
      };
    }

    if (eventMessage.type === messages.EVENT.STEP_DELETED) {
      const payload = eventMessage.payload || {};
      const stepId = payload.stepId ? String(payload.stepId) : '';
      if (!stepId) {
        return currentState;
      }

      return {
        ...currentState,
        steps: currentState.steps.filter(function filterStep(step) {
          return step.id !== stepId;
        })
      };
    }

    if (eventMessage.type === messages.EVENT.ASSET_READY) {
      const payload = eventMessage.payload || {};
      return {
        ...currentState,
        steps: updateStepPreview(currentState.steps, {
          stepId: payload.stepId,
          status: previewStatus.IDLE || 'idle'
        })
      };
    }

    return currentState;
  }

  global.createInitialPanelState = createInitialPanelState;
  global.applySnapshot = applySnapshot;
  global.applyPanelEvent = applyPanelEvent;
  global.updateStepPreview = updateStepPreview;
})(typeof self !== 'undefined' ? self : window);
