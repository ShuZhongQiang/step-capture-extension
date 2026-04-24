(function initPanelClient(global) {
  const messages = global.StepRecorderMessages;
  let panelPort = null;
  let reconnectTimer = null;
  let reconnectEnabled = false;
  let requestCounter = 0;
  const pendingRequests = new Map();
  const eventListeners = new Set();

  function nextRequestId() {
    requestCounter += 1;
    return 'panel_' + Date.now() + '_' + requestCounter;
  }

  function clearPendingWithError(error) {
    const pending = Array.from(pendingRequests.values());
    pendingRequests.clear();

    for (const item of pending) {
      clearTimeout(item.timeoutId);
      item.reject(new Error(error || 'panel_disconnected'));
    }
  }

  function notifyEvent(message) {
    for (const listener of Array.from(eventListeners.values())) {
      try {
        listener(message);
      } catch (error) {
        console.error('[panel-client] event listener failed:', error);
      }
    }
  }

  function attachPort(port) {
    panelPort = port;

    panelPort.onMessage.addListener(function onPortMessage(message) {
      if (!message || typeof message !== 'object') {
        return;
      }

      if (message.kind === 'event') {
        notifyEvent(message);
        return;
      }

      if (message.kind === 'response' && message.requestId) {
        const pending = pendingRequests.get(message.requestId);
        if (!pending) {
          return;
        }

        pendingRequests.delete(message.requestId);
        clearTimeout(pending.timeoutId);

        if (message.ok === false) {
          pending.reject(new Error(message.error || 'command_failed'));
          return;
        }

        pending.resolve(message.result || { ok: true });
      }
    });

    panelPort.onDisconnect.addListener(function onPortDisconnect() {
      panelPort = null;
      clearPendingWithError('panel_disconnected');

      if (!reconnectEnabled) {
        return;
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      reconnectTimer = setTimeout(function reconnectPort() {
        reconnectTimer = null;
        connectPanelPort();
      }, 500);
    });
  }

  function connectPanelPort() {
    reconnectEnabled = true;

    if (panelPort) {
      return panelPort;
    }

    const port = chrome.runtime.connect({ name: messages.PANEL_PORT_NAME });
    attachPort(port);
    return panelPort;
  }

  function disconnectPanelPort() {
    reconnectEnabled = false;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (panelPort) {
      try {
        panelPort.disconnect();
      } catch (error) {
      }
      panelPort = null;
    }

    clearPendingWithError('panel_disconnected');
  }

  function sendPanelCommand(type, payload, options) {
    if (!panelPort) {
      connectPanelPort();
    }

    if (!panelPort) {
      return Promise.reject(new Error('panel_not_connected'));
    }

    const requestId = nextRequestId();
    const commandOptions = options || {};
    const timeoutMs = Number(commandOptions.timeoutMs) > 0
      ? Number(commandOptions.timeoutMs)
      : 15000;

    return new Promise(function resolveCommand(resolve, reject) {
      const timeoutId = setTimeout(function onTimeout() {
        pendingRequests.delete(requestId);
        reject(new Error('command_timeout'));
      }, timeoutMs);

      pendingRequests.set(requestId, {
        resolve: resolve,
        reject: reject,
        timeoutId: timeoutId
      });

      try {
        panelPort.postMessage({
          kind: 'command',
          type: type,
          payload: payload || {},
          requestId: requestId
        });
      } catch (error) {
        clearTimeout(timeoutId);
        pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  function onPanelEvent(listener) {
    eventListeners.add(listener);
    return function unsubscribe() {
      eventListeners.delete(listener);
    };
  }

  global.connectPanelPort = connectPanelPort;
  global.disconnectPanelPort = disconnectPanelPort;
  global.sendPanelCommand = sendPanelCommand;
  global.onPanelEvent = onPanelEvent;
})(typeof self !== 'undefined' ? self : window);
