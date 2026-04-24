(function initContentRuntime(global) {
  const messages = self.StepRecorderMessages;
  const RECORDER_STYLE_ID = 'step-recorder-content-styles';
  const RECORDER_RUNTIME_KEY = '__stepRecorderRuntimeV2__';
  const STRONG_INTERACTIVE_SELECTOR = 'a,button,input,textarea,select,option,[role="button"],[role="link"],[contenteditable="true"]';
  const CARD_LIKE_PATTERN = /(card|item|panel|tile|list|row|cell|module|block|box|content)/i;
  const BUTTON_LIKE_PATTERN = /(btn|button)/i;
  let activePreview = null;

  function registerRuntimeInstance() {
    const existing = window[RECORDER_RUNTIME_KEY];
    if (existing && typeof existing.cleanup === 'function') {
      try {
        existing.cleanup();
      } catch (error) {
        console.warn('[runtime] cleanup previous instance failed:', error);
      }
    }

    window[RECORDER_RUNTIME_KEY] = {
      cleanup: cleanupRuntimeInstance
    };
  }

  function cleanupRuntimeInstance() {
    stopRuntime();
    hideImagePreview();

    const state = getRuntimeState();
    if (state.runtimeMessageListener && chrome.runtime && chrome.runtime.onMessage) {
      try {
        chrome.runtime.onMessage.removeListener(state.runtimeMessageListener);
      } catch (error) {
        console.warn('[runtime] remove listener failed:', error);
      }
    }

    setRuntimeState({
      runtimeMessageListener: null
    });

    const currentState = getRuntimeState();
    if (currentState.overlay && currentState.overlay.parentNode) {
      currentState.overlay.parentNode.removeChild(currentState.overlay);
    }

    setRuntimeState({ overlay: null });

    if (window[RECORDER_RUNTIME_KEY] && window[RECORDER_RUNTIME_KEY].cleanup === cleanupRuntimeInstance) {
      delete window[RECORDER_RUNTIME_KEY];
    }
  }

  function ensureRecorderStyles() {
    if (document.getElementById(RECORDER_STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = RECORDER_STYLE_ID;
    style.textContent = [
      '.recording-overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483646;}',
      '.highlight-element{position:absolute;border-radius:12px;pointer-events:none;box-shadow:0 0 0 1.5px rgba(249,115,22,0.4),0 0 12px 4px rgba(249,115,22,0.18),0 0 24px 8px rgba(249,115,22,0.08);animation:step-recorder-pulse 1.8s ease-in-out infinite;}',
      '.confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);}',
      '.confirm-overlay-content{background:#e8ecf1;padding:24px 32px;border-radius:20px;max-width:400px;width:min(90vw,400px);box-shadow:8px 8px 16px rgba(163,177,198,0.7),-8px -8px 16px rgba(255,255,255,0.9),0 0 0 1px rgba(249,115,22,0.2);text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.confirm-overlay-text{font-size:15px;color:#4a5568;margin-bottom:24px;line-height:1.6;word-break:break-word;}',
      '.confirm-overlay-actions{display:flex;gap:16px;justify-content:center;}',
      '.confirm-btn{padding:10px 24px;border-radius:14px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:transform 0.15s ease;}',
      '.confirm-save{background:linear-gradient(145deg,#fb923c,#f97316);color:#fff;box-shadow:4px 4px 10px rgba(249,115,22,0.28);}',
      '.confirm-cancel{background:#fff;color:#475569;box-shadow:4px 4px 10px rgba(148,163,184,0.2);}',
      '.confirm-btn:hover{transform:translateY(-1px);}',
      '.confirm-btn:active{transform:translateY(0);}',
      '.step-preview-overlay{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,0.42);backdrop-filter:blur(3px);}',
      '.step-preview-dialog{position:relative;background:#e8ecf1;border-radius:16px;box-shadow:8px 8px 16px rgba(163,177,198,0.62),-8px -8px 16px rgba(255,255,255,0.82);padding:12px;width:min(92vw,980px);max-height:88vh;display:flex;flex-direction:column;gap:10px;}',
      '.step-preview-close{align-self:flex-end;border:none;background:#e8ecf1;color:#64748b;font-size:12px;font-weight:600;padding:5px 10px;border-radius:10px;cursor:pointer;box-shadow:2px 2px 4px rgba(163,177,198,0.45),-2px -2px 4px rgba(255,255,255,0.7);}',
      '.step-preview-image-wrap{min-height:220px;display:flex;align-items:center;justify-content:center;}',
      '.step-preview-image{max-width:100%;max-height:min(70vh,760px);border-radius:12px;object-fit:contain;background:#dfe5ec;box-shadow:inset 3px 3px 6px rgba(163,177,198,0.45),inset -3px -3px 6px rgba(255,255,255,0.75);}',
      '.step-preview-caption{text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '@keyframes step-recorder-pulse{0%,100%{box-shadow:0 0 0 1.5px rgba(249,115,22,0.32),0 0 10px 3px rgba(249,115,22,0.14),0 0 20px 6px rgba(249,115,22,0.08);}50%{box-shadow:0 0 0 2px rgba(249,115,22,0.48),0 0 18px 6px rgba(249,115,22,0.24),0 0 32px 10px rgba(249,115,22,0.12);}}'
    ].join('');

    document.documentElement.appendChild(style);
  }

  function createOverlay() {
    const state = getRuntimeState();
    if (state.overlay) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'recording-overlay';
    overlay.setAttribute('data-step-recorder-ui', 'true');
    document.documentElement.appendChild(overlay);

    setRuntimeState({ overlay: overlay });
  }

  function hideImagePreview() {
    if (!activePreview) {
      return;
    }

    if (activePreview.keydownListener) {
      document.removeEventListener('keydown', activePreview.keydownListener, true);
    }

    if (activePreview.overlay && activePreview.overlay.parentNode) {
      activePreview.overlay.parentNode.removeChild(activePreview.overlay);
    }

    activePreview = null;
  }

  function showImagePreview(payload) {
    if (!payload || !payload.dataUrl) {
      return { ok: false, error: 'invalid_preview_payload' };
    }

    hideImagePreview();

    const caption = payload.caption ? String(payload.caption) : '步骤截图预览';
    const sizeText = payload.width && payload.height ? ' (' + payload.width + 'x' + payload.height + ')' : '';

    const overlay = document.createElement('div');
    overlay.className = 'step-preview-overlay';
    overlay.setAttribute('data-step-recorder-ui', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'step-preview-dialog';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'step-preview-close';
    closeButton.textContent = '关闭';

    const imageWrap = document.createElement('div');
    imageWrap.className = 'step-preview-image-wrap';

    const image = document.createElement('img');
    image.className = 'step-preview-image';
    image.src = payload.dataUrl;
    image.alt = '步骤截图预览';

    const captionElement = document.createElement('div');
    captionElement.className = 'step-preview-caption';
    captionElement.textContent = caption + sizeText;
    captionElement.title = caption + sizeText;

    imageWrap.appendChild(image);
    dialog.appendChild(closeButton);
    dialog.appendChild(imageWrap);
    dialog.appendChild(captionElement);
    overlay.appendChild(dialog);
    document.documentElement.appendChild(overlay);

    function closePreview() {
      hideImagePreview();
    }

    const keydownListener = function onPreviewKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePreview();
      }
    };

    overlay.addEventListener('click', function onOverlayClick(event) {
      if (!dialog.contains(event.target)) {
        closePreview();
      }
    });
    closeButton.addEventListener('click', closePreview);
    document.addEventListener('keydown', keydownListener, true);

    activePreview = {
      overlay: overlay,
      keydownListener: keydownListener
    };

    return { ok: true };
  }

  function clearHighlights() {
    const state = getRuntimeState();
    if (!state.overlay) {
      return;
    }

    while (state.overlay.firstChild) {
      state.overlay.removeChild(state.overlay.firstChild);
    }
  }

  function highlightElement(element) {
    clearHighlights();

    const state = getRuntimeState();
    if (!state.overlay || !(element instanceof Element)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'highlight-element';
    highlight.style.top = rect.top + 'px';
    highlight.style.left = rect.left + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';

    state.overlay.appendChild(highlight);

    const isInFrame = window !== window.top;
    const frameContext = {
      isInFrame: isInFrame,
      frameElement: isInFrame ? (function getFrameElement() {
        try {
          return window.frameElement;
        } catch (error) {
          return null;
        }
      })() : null
    };

    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      frameContext: frameContext
    };
  }

  function isRecorderUiElement(element) {
    return Boolean(element && element.closest('[data-step-recorder-ui="true"]'));
  }

  function containsPoint(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function hasClickableContainerHint(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    if (element.hasAttribute('onclick') || element.hasAttribute('data-click') || element.hasAttribute('data-action')) {
      return true;
    }

    const style = window.getComputedStyle(element);
    if (style.cursor === 'pointer') {
      return true;
    }

    const role = element.getAttribute('role');
    return role === 'button' || role === 'link';
  }

  function isButtonLikeElement(element) {
    const className = typeof element.className === 'string' ? element.className : '';
    const id = element.id || '';
    const hint = className + ' ' + id;

    if (!BUTTON_LIKE_PATTERN.test(hint)) {
      return false;
    }

    if (hasClickableContainerHint(element)) {
      return true;
    }

    return typeof element.tabIndex === 'number' && element.tabIndex >= 0;
  }

  function isCardLikeElement(element) {
    const className = typeof element.className === 'string' ? element.className : '';
    const id = element.id || '';
    const role = element.getAttribute('role') || '';
    const dataType = element.getAttribute('data-type') || '';
    const hintText = (className + ' ' + id + ' ' + role + ' ' + dataType).toLowerCase();

    if (CARD_LIKE_PATTERN.test(hintText)) {
      return true;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 140 && rect.height > 70 && element.childElementCount >= 2;
  }

  function getInteractiveAncestor(element) {
    const strongAncestor = element.closest(STRONG_INTERACTIVE_SELECTOR);
    if (strongAncestor) {
      return strongAncestor;
    }

    let current = element;
    let depth = 0;
    while (current && current !== document.body && depth < 6) {
      if (isButtonLikeElement(current)) {
        return current;
      }
      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  function resolveClickTarget(element, event) {
    const interactiveAncestor = getInteractiveAncestor(element);
    if (interactiveAncestor) {
      return interactiveAncestor;
    }

    const originRect = element.getBoundingClientRect();
    const originArea = Math.max(originRect.width * originRect.height, 1);
    const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
    const clickX = event.clientX;
    const clickY = event.clientY;

    let bestElement = element;
    let bestScore = 0;
    let current = element.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < 8) {
      const rect = current.getBoundingClientRect();
      const area = rect.width * rect.height;

      if (area >= 1 && containsPoint(rect, clickX, clickY)) {
        const growth = area / originArea;
        const areaRatio = area / viewportArea;
        const cardLike = isCardLikeElement(current);
        const clickableContainer = hasClickableContainerHint(current);

        let score = 0;
        if (cardLike) {
          score += 3;
        }
        if (clickableContainer) {
          score += 2;
        }
        if (growth > 1.4) {
          score += Math.min(3, Math.log2(growth));
        }
        if (areaRatio > 0.55) {
          score -= 4;
        } else if (areaRatio > 0.35) {
          score -= 2;
        }

        if (score > bestScore) {
          bestScore = score;
          bestElement = current;
        }
      }

      current = current.parentElement;
      depth += 1;
    }

    if (bestElement !== element) {
      const bestRect = bestElement.getBoundingClientRect();
      const clickPointArea = Math.max(10 * 10, 1);
      const elementArea = Math.max(bestRect.width * bestRect.height, 1);
      if (elementArea / clickPointArea > 50) {
        return element;
      }
    }

    return bestElement;
  }

  function buildPendingManualAction(rawTarget, resolvedTarget, event) {
    return {
      rawTarget: rawTarget,
      resolvedTarget: resolvedTarget,
      mouseEventInit: {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: typeof event.detail === 'number' ? event.detail : 1,
        screenX: event.screenX,
        screenY: event.screenY,
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        button: event.button,
        buttons: event.buttons
      }
    };
  }

  function getReplayTarget(action) {
    if (action.rawTarget instanceof Element && action.rawTarget.isConnected) {
      return action.rawTarget;
    }

    if (action.resolvedTarget instanceof Element && action.resolvedTarget.isConnected) {
      return action.resolvedTarget;
    }

    return null;
  }

  function dispatchReplayEvent(target, type, mouseEventInit, EventCtor) {
    if (typeof EventCtor !== 'function') {
      return;
    }

    const baseInit = Object.assign({}, mouseEventInit, { view: window });
    const isPointerEvent = typeof PointerEvent === 'function' && EventCtor === PointerEvent;

    if (isPointerEvent) {
      target.dispatchEvent(new PointerEvent(type, Object.assign({}, baseInit, {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      })));
      return;
    }

    target.dispatchEvent(new EventCtor(type, baseInit));
  }

  function replayPendingManualAction() {
    const state = getRuntimeState();
    const action = state.pendingManualAction;

    setRuntimeState({ pendingManualAction: null });

    if (!action) {
      return;
    }

    const replayTarget = getReplayTarget(action);
    if (!replayTarget) {
      return;
    }

    setRuntimeState({ isReplayingClick: true });

    try {
      if (replayTarget instanceof HTMLElement && typeof replayTarget.focus === 'function') {
        replayTarget.focus({ preventScroll: true });
      }

      const PointerEventCtor = typeof PointerEvent === 'function' ? PointerEvent : null;
      dispatchReplayEvent(replayTarget, 'pointerdown', action.mouseEventInit, PointerEventCtor);
      dispatchReplayEvent(replayTarget, 'mousedown', action.mouseEventInit, MouseEvent);
      dispatchReplayEvent(replayTarget, 'pointerup', action.mouseEventInit, PointerEventCtor);
      dispatchReplayEvent(replayTarget, 'mouseup', action.mouseEventInit, MouseEvent);

      if (replayTarget instanceof HTMLElement && typeof replayTarget.click === 'function') {
        replayTarget.click();
      } else {
        replayTarget.dispatchEvent(new MouseEvent('click', Object.assign({}, action.mouseEventInit, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window
        })));
      }
    } finally {
      setTimeout(function resetReplay() {
        setRuntimeState({ isReplayingClick: false });
      }, 0);
    }
  }

  async function captureAndCommit(targetElement, highlightRect, manualConfirmed) {
    const state = getRuntimeState();
    const frameContext = highlightRect && highlightRect.frameContext ? highlightRect.frameContext : null;
    const screenshot = await captureAnnotatedScreenshot(highlightRect, frameContext);

    const draft = buildActionDraft({
      actionType: 'click',
      targetElement: targetElement,
      annotationRect: highlightRect,
      primaryImageDataUrl: screenshot,
      manualConfirmed: manualConfirmed
    });

    const result = await commitCapturedStep(state.sessionId, draft);
    if (!result || result.ok === false) {
      await reportRuntimeError({
        stage: 'commitCapturedStep',
        error: result && result.error ? result.error : 'commit_failed'
      });
      return false;
    }

    return true;
  }

  async function handleClick(event) {
    const state = getRuntimeState();

    if (!state.isRecording || state.isReplayingClick) {
      return;
    }

    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) {
      return;
    }

    if (isRecorderUiElement(rawTarget)) {
      return;
    }

    const resolvedTarget = resolveClickTarget(rawTarget, event);
    const highlightRect = highlightElement(resolvedTarget);

    if (!highlightRect) {
      return;
    }

    const isManual = state.mode === 'manual';
    if (isManual) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      const pendingManualAction = buildPendingManualAction(rawTarget, resolvedTarget, event);
      setRuntimeState({ pendingManualAction: pendingManualAction });

      const fingerprint = buildTargetFingerprint(resolvedTarget);
      const save = await showConfirmOverlay({
        text: fingerprint.text || '确认保存该步骤吗？'
      });

      if (!save) {
        clearHighlights();
        replayPendingManualAction();
        return;
      }

      try {
        await captureAndCommit(resolvedTarget, highlightRect, true);
      } catch (error) {
        await reportRuntimeError({
          stage: 'captureAndCommit',
          error: error && error.message ? error.message : 'unknown_error'
        });
      } finally {
        clearHighlights();
        replayPendingManualAction();
      }

      return;
    }

    try {
      await captureAndCommit(resolvedTarget, highlightRect, false);
    } catch (error) {
      await reportRuntimeError({
        stage: 'captureAndCommit',
        error: error && error.message ? error.message : 'unknown_error'
      });
    } finally {
      clearHighlights();
    }
  }

  function startRuntime(payload) {
    const state = getRuntimeState();
    if (state.isRecording) {
      setRuntimeState({
        sessionId: payload && payload.sessionId ? payload.sessionId : state.sessionId,
        mode: payload && payload.mode ? payload.mode : state.mode
      });
      return;
    }

    setRuntimeState({
      isRecording: true,
      sessionId: payload && payload.sessionId ? payload.sessionId : state.sessionId,
      mode: payload && payload.mode ? payload.mode : state.mode
    });

    document.addEventListener('click', handleClick, true);
  }

  function stopRuntime() {
    const state = getRuntimeState();

    setRuntimeState({
      isRecording: false,
      pendingManualAction: null,
      currentCandidate: null,
      isReplayingClick: false
    });

    document.removeEventListener('click', handleClick, true);
    clearHighlights();
    handleConfirmDecision(false);
  }

  function configureRuntime(payload) {
    const nextState = {};

    if (payload && payload.mode) {
      nextState.mode = payload.mode;
    }

    if (payload && payload.sessionId) {
      nextState.sessionId = payload.sessionId;
    }

    setRuntimeState(nextState);
  }

  function onBackgroundMessage(message, sender, sendResponse) {
    if (message && message.type === messages.BACKGROUND_TO_CONTENT.RUNTIME_START) {
      startRuntime(message.payload || {});
      sendResponse({ ok: true });
      return false;
    }

    if (message && message.type === messages.BACKGROUND_TO_CONTENT.RUNTIME_STOP) {
      stopRuntime();
      sendResponse({ ok: true });
      return false;
    }

    if (message && message.type === messages.BACKGROUND_TO_CONTENT.RUNTIME_CONFIGURE) {
      configureRuntime(message.payload || {});
      sendResponse({ ok: true });
      return false;
    }

    if (message && message.type === messages.PANEL_TO_CONTENT.IMAGE_PREVIEW_SHOW) {
      sendResponse(showImagePreview(message.payload || {}));
      return false;
    }

    if (message && message.type === messages.PANEL_TO_CONTENT.IMAGE_PREVIEW_HIDE) {
      hideImagePreview();
      sendResponse({ ok: true });
      return false;
    }

    return false;
  }

  function init() {
    registerRuntimeInstance();
    ensureRecorderStyles();
    createOverlay();

    const listener = onBackgroundMessage;
    chrome.runtime.onMessage.addListener(listener);
    setRuntimeState({ runtimeMessageListener: listener });
  }

  init();
})(typeof self !== 'undefined' ? self : window);
