let isRecording = false;
let isManualConfirmMode = false;
let overlay = null;
let pendingManualAction = null;
let isReplayingClick = false;
const RECORDER_STYLE_ID = 'step-recorder-content-styles';
const NATIVE_CAPTURE_RETRIES = 2;
const NATIVE_CAPTURE_RETRY_DELAY_MS = 80;
const STRONG_INTERACTIVE_SELECTOR = 'a,button,input,textarea,select,option,[role="button"],[role="link"],[contenteditable="true"]';
const CARD_LIKE_PATTERN = /(card|item|panel|tile|list|row|cell|module|block|box|content)/i;
const BUTTON_LIKE_PATTERN = /(btn|button)/i;
const HIGHLIGHT_THEME = {
  stroke: 'rgba(249, 115, 22, 0.55)',
  fill: 'rgba(249, 115, 22, 0.14)',
  glowNear: 'rgba(249, 115, 22, 0.25)',
  glowFar: 'rgba(249, 115, 22, 0.12)',
  center: 'rgba(249, 115, 22, 0.9)'
};

function init() {
  ensureRecorderStyles();
  createOverlay();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startRecording') {
      startRecording();
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'stopRecording') {
      stopRecording();
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'setManualConfirmMode') {
      setManualConfirmMode(message.enabled);
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'confirmStep') {
      handleConfirmStep(message.stepId, message.save);
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  document.addEventListener('keydown', handleKeyDown);
}


function ensureRecorderStyles() {
  if (document.getElementById(RECORDER_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = RECORDER_STYLE_ID;
  style.textContent = `
    .recording-overlay {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483646;
    }

    .highlight-element {
      position: absolute;
      border-radius: 12px;
      pointer-events: none;
      box-shadow:
        0 0 0 1.5px rgba(249, 115, 22, 0.4),
        0 0 12px 4px rgba(249, 115, 22, 0.18),
        0 0 24px 8px rgba(249, 115, 22, 0.08);
      animation: step-recorder-pulse 1.8s ease-in-out infinite;
      transition: box-shadow 0.2s ease;
    }

    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }

    .confirm-overlay-content {
      background: #e8ecf1;
      padding: 24px 32px;
      border-radius: 20px;
      max-width: 400px;
      width: min(90vw, 400px);
      box-shadow:
        8px 8px 16px rgba(163, 177, 198, 0.7),
        -8px -8px 16px rgba(255, 255, 255, 0.9),
        0 0 0 1px rgba(249, 115, 22, 0.2);
      text-align: center;
      animation: step-recorder-confirm-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .confirm-overlay-text {
      font-size: 15px;
      color: #4a5568;
      margin-bottom: 24px;
      line-height: 1.6;
      word-break: break-word;
    }

    .confirm-overlay-actions {
      display: flex;
      gap: 16px;
      justify-content: center;
    }

    .confirm-btn {
      padding: 10px 24px;
      border-radius: 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    }

    .confirm-save {
      background: linear-gradient(145deg, #fb923c, #f97316);
      color: #fff;
      box-shadow: 4px 4px 10px rgba(249, 115, 22, 0.28);
    }

    .confirm-cancel {
      background: #fff;
      color: #475569;
      box-shadow: 4px 4px 10px rgba(148, 163, 184, 0.2);
    }

    .confirm-btn:hover {
      transform: translateY(-1px);
    }

    .confirm-btn:active {
      transform: translateY(0);
    }

    @keyframes step-recorder-pulse {
      0%, 100% {
        box-shadow:
          0 0 0 1.5px rgba(249, 115, 22, 0.32),
          0 0 10px 3px rgba(249, 115, 22, 0.14),
          0 0 20px 6px rgba(249, 115, 22, 0.08);
      }
      50% {
        box-shadow:
          0 0 0 2px rgba(249, 115, 22, 0.48),
          0 0 18px 6px rgba(249, 115, 22, 0.24),
          0 0 32px 10px rgba(249, 115, 22, 0.12);
      }
    }

    @keyframes step-recorder-confirm-pop {
      from {
        transform: scale(0.92);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
  `;

  document.documentElement.appendChild(style);
}
function createOverlay() {
  if (overlay) {
    return;
  }

  overlay = document.createElement('div');
  overlay.className = 'recording-overlay';
  overlay.setAttribute('data-step-recorder-ui', 'true');
  document.documentElement.appendChild(overlay);
}

function startRecording() {
  if (isRecording) {
    console.log('[recording] already started');
    return;
  }

  isRecording = true;
  document.addEventListener('click', handleClick, true);
  console.log('[recording] started');
}

function stopRecording() {
  if (!isRecording) {
    console.log('[recording] already stopped');
    return;
  }

  isRecording = false;
  pendingManualAction = null;
  isReplayingClick = false;
  document.removeEventListener('click', handleClick, true);
  clearHighlights();
  removeConfirmOverlay();
  console.log('[recording] stopped');
}

function setManualConfirmMode(enabled) {
  isManualConfirmMode = enabled;
  console.log(`[recording] manual confirm mode: ${enabled ? 'enabled' : 'disabled'}`);
}

async function handleClick(event) {
  if (!isRecording) {
    return;
  }

  if (isReplayingClick) {
    return;
  }

  const rawTarget = event.target;
  if (!(rawTarget instanceof Element)) {
    return;
  }

  if (isRecorderUiElement(rawTarget)) {
    return;
  }

  const target = resolveClickTarget(rawTarget, event);
  const highlightRect = highlightElement(target);
  
  window.currentHighlightRect = highlightRect;
  window.currentSelector = getSelector(target);
  window.currentText = getElementText(target);
  
  const selector = window.currentSelector;
  const text = window.currentText;
  const stepId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (isManualConfirmMode) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    pendingManualAction = buildPendingManualAction(rawTarget, target, event);
    await showConfirmOverlay(stepId, text);
    return;
  }

  try {
    chrome.runtime.sendMessage({
      action: 'captureStep',
      stepId,
      type: 'click',
      selector,
      text,
      screenshot: null
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[captureStep] failed:', chrome.runtime.lastError);
        return;
      }
      if (response && response.ok) {
        return;
      }
    });
  } catch (error) {
    console.error('[captureStep] error:', error);
    return;
  }

  let screenshot = null;
  try {
    screenshot = await captureScreenshot(highlightRect);
  } finally {
    clearHighlights();
  }

  if (!screenshot) {
    console.warn('[captureScreenshot] failed');
    return;
  }

  try {
    chrome.runtime.sendMessage({
      action: 'updateStepScreenshot',
      stepId,
      screenshot
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[updateStepScreenshot] failed:', chrome.runtime.lastError);
        return;
      }
      if (response && response.ok) {
        return;
      }
    });
  } catch (error) {
    console.error('[updateStepScreenshot] error:', error);
  }
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

  return bestElement;
}

function isStrongInteractiveElement(element) {
  if (element.matches(STRONG_INTERACTIVE_SELECTOR)) {
    return true;
  }

  const nearestInteractive = element.closest(STRONG_INTERACTIVE_SELECTOR);
  return nearestInteractive === element;
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

function isButtonLikeElement(element) {
  const className = typeof element.className === 'string' ? element.className : '';
  const id = element.id || '';
  const hint = `${className} ${id}`;
  if (!BUTTON_LIKE_PATTERN.test(hint)) {
    return false;
  }

  if (hasClickableContainerHint(element)) {
    return true;
  }

  if (typeof element.tabIndex === 'number' && element.tabIndex >= 0) {
    return true;
  }

  return false;
}

function hasClickableContainerHint(element) {
  if (element.hasAttribute('onclick') || element.hasAttribute('data-click') || element.hasAttribute('data-action')) {
    return true;
  }

  const style = window.getComputedStyle(element);
  if (style.cursor === 'pointer') {
    return true;
  }

  const role = element.getAttribute('role');
  if (role === 'button' || role === 'link') {
    return true;
  }

  return false;
}

function isCardLikeElement(element) {
  const className = typeof element.className === 'string' ? element.className : '';
  const id = element.id || '';
  const role = element.getAttribute('role') || '';
  const dataType = element.getAttribute('data-type') || '';
  const hintText = `${className} ${id} ${role} ${dataType}`.toLowerCase();

  if (CARD_LIKE_PATTERN.test(hintText)) {
    return true;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 140 && rect.height > 70 && element.childElementCount >= 2;
}

function containsPoint(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function highlightElement(element) {
  clearHighlights();

  if (!overlay) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const highlight = document.createElement('div');
  highlight.className = 'highlight-element';

  // Overlay is fixed to viewport, so use viewport coordinates.
  highlight.style.top = `${rect.top}px`;
  highlight.style.left = `${rect.left}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;

  overlay.appendChild(highlight);

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

function clearHighlights() {
  if (!overlay) {
    return;
  }

  while (overlay.firstChild) {
    overlay.removeChild(overlay.firstChild);
  }
}

function isRecorderUiElement(element) {
  return Boolean(element.closest('[data-step-recorder-ui="true"]'));
}

function buildPendingManualAction(rawTarget, resolvedTarget, event) {
  return {
    rawTarget,
    resolvedTarget,
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

function showConfirmOverlay(stepId, text) {
  const confirmOverlay = document.createElement('div');
  confirmOverlay.className = 'confirm-overlay';
  confirmOverlay.setAttribute('data-step-recorder-ui', 'true');
  confirmOverlay.innerHTML = `
    <div class="confirm-overlay-content">
      <div class="confirm-overlay-text">${text || '确认此步骤？'}</div>
      <div class="confirm-overlay-actions">
        <button class="confirm-btn confirm-save">保存 (Enter)</button>
        <button class="confirm-btn confirm-cancel">取消 (Esc)</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(confirmOverlay);

  window.currentConfirmStep = {
    stepId,
    text,
    overlay: confirmOverlay
  };

  const saveBtn = confirmOverlay.querySelector('.confirm-save');
  const cancelBtn = confirmOverlay.querySelector('.confirm-cancel');

  saveBtn.addEventListener('click', () => {
    handleConfirmStep(stepId, true);
  });

  cancelBtn.addEventListener('click', () => {
    handleConfirmStep(stepId, false);
  });
}

function removeConfirmOverlay() {
  if (window.currentConfirmStep && window.currentConfirmStep.overlay) {
    window.currentConfirmStep.overlay.remove();
    window.currentConfirmStep = null;
  }
}

async function handleConfirmStep(stepId, save) {
  if (!window.currentConfirmStep || window.currentConfirmStep.stepId !== stepId) {
    console.warn('[confirm] step not found or mismatch:', stepId);
    return;
  }

  const highlightRect = window.currentHighlightRect;
  const selector = window.currentSelector || '';
  const text = window.currentText || '';
  window.currentHighlightRect = null;
  window.currentSelector = null;
  window.currentText = null;

  removeConfirmOverlay();
  clearHighlights();

  if (!save) {
    console.log('[confirm] step skipped:', stepId);
    replayPendingManualAction();
    return;
  }

  if (!highlightRect) {
    console.warn('[confirm] no highlight rect found');
    replayPendingManualAction();
    return;
  }

  chrome.runtime.sendMessage({
    action: 'captureStep',
    stepId,
    type: 'click',
    selector,
    text,
    screenshot: null
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[captureStep] failed:', chrome.runtime.lastError);
      return;
    }
    if (response && response.ok) {
      return;
    }
  });

  let screenshot = null;
  screenshot = await captureScreenshot(highlightRect);

  if (!screenshot) {
    console.warn('[captureScreenshot] failed');
    return;
  }

  chrome.runtime.sendMessage({
    action: 'updateStepScreenshot',
    stepId,
    screenshot
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[updateStepScreenshot] failed:', chrome.runtime.lastError);
      return;
    }
    if (response && response.ok) {
      return;
    }
  });

  replayPendingManualAction();
}

function replayPendingManualAction() {
  const action = pendingManualAction;
  pendingManualAction = null;

  if (!action) {
    return;
  }

  const replayTarget = getReplayTarget(action);
  if (!replayTarget) {
    return;
  }

  isReplayingClick = true;

  try {
    focusReplayTarget(replayTarget);
    dispatchReplayPointerSequence(replayTarget, action.mouseEventInit);
    triggerReplayClick(replayTarget, action.mouseEventInit);
  } finally {
    setTimeout(() => {
      isReplayingClick = false;
    }, 0);
  }
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

function focusReplayTarget(target) {
  if (target instanceof HTMLElement && typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
  }
}

function dispatchReplayPointerSequence(target, mouseEventInit) {
  const PointerEventCtor = typeof PointerEvent === 'function' ? PointerEvent : null;

  dispatchReplayEvent(target, 'pointerdown', mouseEventInit, PointerEventCtor);
  dispatchReplayEvent(target, 'mousedown', mouseEventInit, MouseEvent);
  dispatchReplayEvent(target, 'pointerup', mouseEventInit, PointerEventCtor);
  dispatchReplayEvent(target, 'mouseup', mouseEventInit, MouseEvent);
}

function dispatchReplayEvent(target, type, mouseEventInit, EventCtor) {
  if (typeof EventCtor !== 'function') {
    return;
  }

  const baseInit = {
    ...mouseEventInit,
    view: window
  };

  const isPointerEvent = typeof PointerEvent === 'function' && EventCtor === PointerEvent;
  if (isPointerEvent) {
    target.dispatchEvent(new PointerEvent(type, {
      ...baseInit,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    }));
    return;
  }

  target.dispatchEvent(new EventCtor(type, baseInit));
}

function triggerReplayClick(target, mouseEventInit) {
  if (target instanceof HTMLElement && typeof target.click === 'function') {
    target.click();
    return;
  }

  target.dispatchEvent(new MouseEvent('click', {
    ...mouseEventInit,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window
  }));
}

function handleKeyDown(event) {
  if (!isManualConfirmMode || !window.currentConfirmStep) {
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    handleConfirmStep(window.currentConfirmStep.stepId, true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    handleConfirmStep(window.currentConfirmStep.stepId, false);
  }
}

function getSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }

  if (typeof element.className === 'string' && element.className.trim() !== '') {
    const classes = element.className
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((className) => `.${className}`)
      .join('');

    if (classes) {
      return `${element.tagName.toLowerCase()}${classes}`;
    }
  }

  let selector = element.tagName.toLowerCase();
  let currentElement = element;
  let parent = currentElement.parentElement;

  while (parent && parent.tagName !== 'BODY') {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(currentElement) + 1;

    selector = siblings.length > 1
      ? `${parent.tagName.toLowerCase()}>${selector}:nth-child(${index})`
      : `${parent.tagName.toLowerCase()}>${selector}`;

    currentElement = parent;
    parent = parent.parentElement;
  }

  return selector;
}

function getElementText(element) {
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    return normalizeText(element.placeholder || element.value || element.name || element.type || '');
  }

  if (element.tagName === 'BUTTON' || element.tagName === 'A') {
    return normalizeText(element.textContent.trim() || element.innerText.trim() || element.title || element.alt || '');
  }

  const heading = element.querySelector('h1,h2,h3,h4,h5,h6,.title,.name,[data-title]');
  if (heading) {
    const headingText = normalizeText(heading.textContent || heading.innerText || '');
    if (headingText) {
      return headingText;
    }
  }

  return normalizeText(
    element.textContent.trim() ||
    element.innerText.trim() ||
    element.title ||
    element.alt ||
    element.tagName
  );
}

function normalizeText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

async function captureScreenshot(highlightRect) {
  await waitForPaint(2);

  const nativeScreenshot = await captureVisibleTabWithRetry();
  if (nativeScreenshot) {
    return annotateScreenshot(nativeScreenshot, highlightRect);
  }

  if (typeof html2canvas !== 'undefined') {
    try {
      const canvas = await html2canvas(document.documentElement, {
        scale: window.devicePixelRatio || 1,
        logging: false,
        useCORS: true,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight
      });

      return annotateScreenshot(canvas.toDataURL('image/png'), highlightRect);
    } catch (error) {
      console.warn('[captureScreenshot] html2canvas fallback failed:', error);
    }
  }

  return null;
}

async function captureVisibleTabWithRetry() {
  for (let attempt = 0; attempt <= NATIVE_CAPTURE_RETRIES; attempt += 1) {
    const result = await captureVisibleTab();
    if (result.screenshot) {
      return result.screenshot;
    }

    if (result.error) {
      console.warn('[captureVisibleTab] attempt failed:', result.error);
    }

    if (attempt < NATIVE_CAPTURE_RETRIES) {
      await delay(NATIVE_CAPTURE_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  return null;
}

function captureVisibleTab() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureTab' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ screenshot: null, error: chrome.runtime.lastError.message || 'runtime_error' });
        return;
      }

      resolve({
        screenshot: response && response.screenshot ? response.screenshot : null,
        error: response && response.error ? response.error : null
      });
    });
  });
}

function annotateScreenshot(dataUrl, highlightRect) {
  if (!dataUrl || !highlightRect) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0);

      const viewportWidth = Math.max(window.innerWidth, 1);
      const viewportHeight = Math.max(window.innerHeight, 1);
      const scaleX = image.width / viewportWidth;
      const scaleY = image.height / viewportHeight;

      const x = Math.max(0, highlightRect.left) * scaleX;
      const y = Math.max(0, highlightRect.top) * scaleY;
      const width = Math.max(1, highlightRect.width * scaleX);
      const height = Math.max(1, highlightRect.height * scaleY);
      const lineWidth = Math.max(2, Math.round(((scaleX + scaleY) / 2) * 3));
      const radius = Math.max(8, Math.round(12 * ((scaleX + scaleY) / 2)));

      drawRoundedRect(context, x, y, width, height, radius);
      context.fillStyle = HIGHLIGHT_THEME.fill;
      context.fill();

      context.save();
      context.strokeStyle = HIGHLIGHT_THEME.stroke;
      context.lineWidth = lineWidth;
      context.shadowColor = HIGHLIGHT_THEME.glowNear;
      context.shadowBlur = Math.max(10, Math.round(lineWidth * 5));
      drawRoundedRect(context, x, y, width, height, radius);
      context.stroke();
      context.restore();

      context.save();
      context.strokeStyle = HIGHLIGHT_THEME.glowFar;
      context.lineWidth = Math.max(1, Math.round(lineWidth * 0.8));
      context.shadowColor = HIGHLIGHT_THEME.glowFar;
      context.shadowBlur = Math.max(18, Math.round(lineWidth * 9));
      drawRoundedRect(context, x, y, width, height, radius + 1);
      context.stroke();
      context.restore();

      resolve(canvas.toDataURL('image/png'));
    };

    image.onerror = () => {
      resolve(dataUrl);
    };

    image.src = dataUrl;
  });
}

function waitForPaint(frames = 1) {
  return new Promise((resolve) => {
    const tick = (remaining) => {
      if (remaining <= 0) {
        resolve();
        return;
      }

      requestAnimationFrame(() => tick(remaining - 1));
    };

    tick(frames);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const maxRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + maxRadius, y);
  context.lineTo(x + width - maxRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + maxRadius);
  context.lineTo(x + width, y + height - maxRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - maxRadius, y + height);
  context.lineTo(x + maxRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - maxRadius);
  context.lineTo(x, y + maxRadius);
  context.quadraticCurveTo(x, y, x + maxRadius, y);
  context.closePath();
}

init();




