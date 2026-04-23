const recorderPanelPorts = new Set();

function createRouterRequestId(prefix) {
  return (prefix || 'req') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function toRouterError(error, fallback) {
  return {
    ok: false,
    error: error && error.message ? error.message : (fallback || 'unknown_error')
  };
}

function postPortMessageSafe(port, message) {
  try {
    port.postMessage(message);
    return true;
  } catch (error) {
    return false;
  }
}

function broadcastPanelEvent(type, payload) {
  const ports = Array.from(recorderPanelPorts.values());
  for (const port of ports) {
    postPortMessageSafe(port, {
      kind: 'event',
      type: type,
      payload: payload || null
    });
  }
}

async function emitSnapshotEvent() {
  const messages = self.StepRecorderMessages;
  const snapshot = await buildRecorderSnapshot();
  broadcastPanelEvent(messages.EVENT.SNAPSHOT, snapshot);
  return snapshot;
}

async function handlePanelCommand(commandType, payload, context) {
  const messages = self.StepRecorderMessages;

  if (commandType === messages.COMMAND.SESSION_START) {
    const result = await startRecordingSessionFlow(payload || {}, context);
    if (result.ok) {
      broadcastPanelEvent(messages.EVENT.SESSION_UPDATED, {
        session: result.session,
        snapshot: result.snapshot
      });
      await emitSnapshotEvent();
    }
    return result;
  }

  if (commandType === messages.COMMAND.SESSION_STOP) {
    const result = await stopRecordingSessionFlow(payload || {}, context);
    if (result.ok) {
      broadcastPanelEvent(messages.EVENT.SESSION_UPDATED, {
        session: result.session,
        snapshot: result.snapshot
      });
      await emitSnapshotEvent();
    }
    return result;
  }

  if (commandType === messages.COMMAND.SESSION_GET_SNAPSHOT) {
    return {
      ok: true,
      snapshot: await buildRecorderSnapshot()
    };
  }

  if (commandType === messages.COMMAND.SETTINGS_UPDATE) {
    const hasMode = payload && (payload.mode === 'auto' || payload.mode === 'manual');
    const hasAi = payload && payload.ai && typeof payload.ai === 'object';

    if (!hasMode && !hasAi) {
      return { ok: false, error: 'invalid_settings_payload' };
    }

    await context.ensureMigrationsReady();
    if (hasMode) {
      await updateRecordingMode(payload.mode);
    }
    if (hasAi) {
      await saveRecorderSettings({ ai: payload.ai });
    }

    const state = await getRecordingState();
    if (typeof state.recordingTabId === 'number') {
      await context.sendMessageToTab(state.recordingTabId, {
        type: messages.BACKGROUND_TO_CONTENT.RUNTIME_CONFIGURE,
        payload: {
          sessionId: state.activeSessionId,
          mode: state.recordingMode
        }
      });
    }

    const snapshot = await emitSnapshotEvent();
    broadcastPanelEvent(messages.EVENT.SESSION_UPDATED, {
      session: snapshot.session,
      snapshot: snapshot
    });

    return {
      ok: true,
      settings: {
        mode: hasMode ? payload.mode : state.recordingMode,
        ai: hasAi ? payload.ai : null
      },
      snapshot: snapshot
    };
  }

  if (commandType === messages.COMMAND.STEP_DELETE) {
    await context.ensureMigrationsReady();

    if (!payload || !payload.stepId) {
      return { ok: false, error: 'invalid_step_id' };
    }

    const deleted = await deleteStep(String(payload.stepId));
    if (deleted && deleted.ok && deleted.deleted) {
      broadcastPanelEvent(messages.EVENT.STEP_DELETED, {
        stepId: String(payload.stepId)
      });
      await emitSnapshotEvent();
    }

    return deleted;
  }

  if (commandType === messages.COMMAND.ASSET_GET_PREVIEW) {
    await context.ensureMigrationsReady();
    if (!payload || !payload.assetId) {
      return { ok: false, error: 'invalid_asset_id' };
    }

    const asset = await getAssetPreview(String(payload.assetId));
    return {
      ok: true,
      asset: asset
    };
  }

  if (commandType === messages.COMMAND.DOCUMENT_BUILD) {
    await context.ensureMigrationsReady();
    return buildDocumentResult(payload || {});
  }

  return {
    ok: false,
    error: 'unknown_command'
  };
}

function handlePanelPort(port, context) {
  const messages = self.StepRecorderMessages;
  if (!port || port.name !== messages.PANEL_PORT_NAME) {
    return;
  }

  recorderPanelPorts.add(port);

  emitSnapshotEvent().catch(function ignoreEmitError() {});

  port.onMessage.addListener(function onPortMessage(message) {
    const commandType = message && message.type ? message.type : null;
    const requestId = message && message.requestId ? message.requestId : createRouterRequestId('panel');

    if (!commandType) {
      postPortMessageSafe(port, {
        kind: 'response',
        requestId: requestId,
        ok: false,
        error: 'missing_command_type'
      });
      return;
    }

    handlePanelCommand(commandType, message.payload || {}, context)
      .then(function onCommandResult(result) {
        postPortMessageSafe(port, {
          kind: 'response',
          requestId: requestId,
          ok: !result || result.ok !== false,
          result: result || { ok: true }
        });
      })
      .catch(function onCommandError(error) {
        postPortMessageSafe(port, {
          kind: 'response',
          requestId: requestId,
          ok: false,
          error: error && error.message ? error.message : 'command_failed'
        });
      });
  });

  port.onDisconnect.addListener(function onPortDisconnect() {
    recorderPanelPorts.delete(port);
  });
}

async function handleRuntimeMessage(message, sender, context) {
  const messages = self.StepRecorderMessages;

  if (!message || typeof message !== 'object') {
    return { ok: false, error: 'invalid_message' };
  }

  if (message.type === messages.CONTENT_TO_BACKGROUND.CAPTURE_VISIBLE_TAB) {
    const windowId = sender && sender.tab
      ? sender.tab.windowId
      : chrome.windows.WINDOW_ID_CURRENT;

    const screenshot = await new Promise(function capture(resolve) {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, function onCapture(dataUrl) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || 'capture_failed' });
          return;
        }

        resolve({ ok: true, screenshot: dataUrl || null });
      });
    });

    return screenshot;
  }

  if (message.type === messages.CONTENT_TO_BACKGROUND.ACTION_COMMIT) {
    const senderContext = {
      tabId: sender && sender.tab ? sender.tab.id : null,
      url: sender && sender.tab ? sender.tab.url : '',
      title: sender && sender.tab ? sender.tab.title : ''
    };

    const result = await commitCapturedStepFlow(message.payload || {}, senderContext, context);

    if (result && result.ok && result.step) {
      broadcastPanelEvent(messages.EVENT.STEP_UPSERTED, {
        sessionId: result.step.sessionId,
        step: result.panelStep || await buildPanelStepFromRecord(result.step)
      });

      if (result.step.capture && result.step.capture.primaryAssetId) {
        broadcastPanelEvent(messages.EVENT.ASSET_READY, {
          sessionId: result.step.sessionId,
          stepId: result.step.id,
          assetId: result.step.capture.primaryAssetId
        });
      }

      await emitSnapshotEvent();
    }

    return result;
  }

  if (message.type === messages.CONTENT_TO_BACKGROUND.RUNTIME_ERROR) {
    console.warn('[recorder/runtime/error]', message.payload || null);
    return { ok: true };
  }

  return { ok: false, error: 'unknown_runtime_message' };
}
