(function initScreenshotCapture(global) {
  const NATIVE_CAPTURE_RETRIES = 2;
  const NATIVE_CAPTURE_RETRY_DELAY_MS = 80;
  const HIGHLIGHT_THEME = {
    stroke: 'rgba(249, 115, 22, 0.55)',
    fill: 'rgba(249, 115, 22, 0.14)',
    glowNear: 'rgba(249, 115, 22, 0.25)',
    glowFar: 'rgba(249, 115, 22, 0.12)'
  };

  function delay(ms) {
    return new Promise(function resolveDelay(resolve) {
      setTimeout(resolve, ms);
    });
  }

  function getTopViewportMetrics() {
    try {
      const topWindow = window.top || window;
      const width = Number(topWindow.innerWidth);
      const height = Number(topWindow.innerHeight);
      return {
        viewportWidth: Number.isFinite(width) && width > 0 ? width : window.innerWidth,
        viewportHeight: Number.isFinite(height) && height > 0 ? height : window.innerHeight
      };
    } catch (error) {
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    }
  }

  function convertRectToTopViewport(rect, frameContext) {
    const topViewport = getTopViewportMetrics();

    if (!frameContext || !frameContext.isInFrame) {
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth: topViewport.viewportWidth,
        viewportHeight: topViewport.viewportHeight,
        scrollX: 0,
        scrollY: 0,
        crossOriginFallback: false
      };
    }

    try {
      let totalOffsetX = 0;
      let totalOffsetY = 0;
      let currentWindow = window;
      let hasCrossOrigin = false;

      while (currentWindow && currentWindow !== currentWindow.top) {
        try {
          const frameElement = currentWindow.frameElement;
          if (frameElement instanceof Element) {
            const frameRect = frameElement.getBoundingClientRect();
            totalOffsetX += frameRect.left + (frameElement.clientLeft || 0);
            totalOffsetY += frameRect.top + (frameElement.clientTop || 0);
            currentWindow = currentWindow.parent;
          } else {
            hasCrossOrigin = true;
            break;
          }
        } catch (error) {
          hasCrossOrigin = true;
          break;
        }
      }

      if (hasCrossOrigin) {
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          viewportWidth: topViewport.viewportWidth,
          viewportHeight: topViewport.viewportHeight,
          scrollX: 0,
          scrollY: 0,
          crossOriginFallback: true
        };
      }

      return {
        left: Math.round(rect.left + totalOffsetX),
        top: Math.round(rect.top + totalOffsetY),
        width: rect.width,
        height: rect.height,
        viewportWidth: topViewport.viewportWidth,
        viewportHeight: topViewport.viewportHeight,
        scrollX: 0,
        scrollY: 0,
        crossOriginFallback: false
      };
    } catch (error) {
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth: topViewport.viewportWidth,
        viewportHeight: topViewport.viewportHeight,
        scrollX: 0,
        scrollY: 0,
        crossOriginFallback: true
      };
    }
  }

  function waitForPaint(frames) {
    const totalFrames = typeof frames === 'number' ? frames : 1;

    return new Promise(function resolvePaint(resolve) {
      const tick = function tick(remaining) {
        if (remaining <= 0) {
          resolve();
          return;
        }

        requestAnimationFrame(function onFrame() {
          tick(remaining - 1);
        });
      };

      tick(totalFrames);
    });
  }

  async function captureVisibleTab() {
    const messages = self.StepRecorderMessages;
    const response = await sendRecorderRuntimeMessage({
      type: messages.CONTENT_TO_BACKGROUND.CAPTURE_VISIBLE_TAB
    });

    if (!response.ok) {
      return { screenshot: null, error: response.error || 'runtime_error' };
    }

    return {
      screenshot: response.response && response.response.screenshot
        ? response.response.screenshot
        : null,
      error: response.response && response.response.error
        ? response.response.error
        : null
    };
  }

  async function captureVisibleTabWithRetry() {
    for (let attempt = 0; attempt <= NATIVE_CAPTURE_RETRIES; attempt += 1) {
      const result = await captureVisibleTab();
      if (result.screenshot) {
        return result.screenshot;
      }

      if (attempt < NATIVE_CAPTURE_RETRIES) {
        await delay(NATIVE_CAPTURE_RETRY_DELAY_MS * (attempt + 1));
      }
    }

    return null;
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

  function annotateScreenshot(dataUrl, annotationRect, options) {
    if (!dataUrl || !annotationRect) {
      return Promise.resolve(dataUrl);
    }

    const shouldDrawFrame = options && options.shouldDrawFrame !== false;
    const isCrossOrigin = options && options.isCrossOrigin === true;

    if (isCrossOrigin || !shouldDrawFrame) {
      return Promise.resolve(dataUrl);
    }

    return new Promise(function resolveAnnotation(resolve) {
      const image = new Image();

      image.onload = function onImageLoaded() {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const context = canvas.getContext('2d');
        if (!context) {
          resolve(dataUrl);
          return;
        }

        context.drawImage(image, 0, 0);

        const viewportWidth = Math.max(annotationRect.viewportWidth || window.innerWidth, 1);
        const viewportHeight = Math.max(annotationRect.viewportHeight || window.innerHeight, 1);
        const scaleX = image.width / viewportWidth;
        const scaleY = image.height / viewportHeight;

        const x = Math.max(0, annotationRect.left * scaleX);
        const y = Math.max(0, annotationRect.top * scaleY);
        const width = Math.max(1, annotationRect.width * scaleX);
        const height = Math.max(1, annotationRect.height * scaleY);
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

      image.onerror = function onImageError() {
        resolve(dataUrl);
      };

      image.src = dataUrl;
    });
  }

  async function captureAnnotatedScreenshot(annotationRect, frameContext) {
    await waitForPaint(2);

    const nativeScreenshot = await captureVisibleTabWithRetry();
    if (!nativeScreenshot) {
      return null;
    }

    const convertedRect = convertRectToTopViewport(annotationRect, frameContext);
    const isCrossOrigin = convertedRect.crossOriginFallback === true;

    return annotateScreenshot(nativeScreenshot, convertedRect, {
      shouldDrawFrame: !isCrossOrigin,
      isCrossOrigin: isCrossOrigin
    });
  }

  global.captureAnnotatedScreenshot = captureAnnotatedScreenshot;
})(typeof self !== 'undefined' ? self : window);
