(function initStepListView(global) {
  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function statusLabel(status) {
    if (status === 'pending') {
      return '处理中';
    }
    if (status === 'failed') {
      return '失败';
    }
    return '就绪';
  }

  function previewMarkup(step) {
    const preview = step.preview || {};
    if (preview.dataUrl) {
      return '<img class="step-screenshot step-screenshot--interactive" src="' + escapeHtml(preview.dataUrl) + '" alt="步骤截图" title="点击预览" data-preview-open-step-id="' + escapeHtml(step.id) + '">';
    }

    if (preview.status === 'loading') {
      return '<div class="step-screenshot placeholder">Loading</div>';
    }

    if (preview.status === 'failed') {
      return '<div class="step-screenshot placeholder failed">Failed</div>';
    }

    if (preview.assetId) {
      return '<button class="step-screenshot placeholder preview-load" type="button" data-preview-step-id="' + escapeHtml(step.id) + '">Load</button>';
    }

    return '<div class="step-screenshot placeholder">No Image</div>';
  }

  function renderSteps(container, steps, options) {
    const opts = options || {};

    if (!container) {
      return;
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      container.innerHTML = '<p class="empty-message">暂无步骤记录</p>';
      return;
    }

    container.innerHTML = '';

    steps.forEach(function eachStep(step, index) {
      const stepElement = document.createElement('div');
      const status = step.status || 'ready';
      const target = step.target || {};
      const page = step.page || {};
      const text = target.text || target.ariaLabel || target.placeholder || target.dataTestId || '点击元素';
      const selector = target.selector || (Array.isArray(target.fallbackSelectors) ? target.fallbackSelectors[0] : '') || '';

      stepElement.className = 'step-item step-status step-status--' + status;
      stepElement.innerHTML = [
        '<div class="step-number">' + (index + 1) + '</div>',
        '<div class="step-content">',
        '<div class="step-line">',
        '<div class="step-text">' + escapeHtml(text) + '</div>',
        '<span class="step-status-badge">' + statusLabel(status) + '</span>',
        '</div>',
        '<div class="step-selector">' + escapeHtml(selector) + '</div>',
        page.title ? '<div class="step-page-title">' + escapeHtml(page.title) + '</div>' : '',
        '</div>',
        previewMarkup(step)
      ].join('');

      const previewLoadButton = stepElement.querySelector('[data-preview-step-id]');
      if (previewLoadButton) {
        previewLoadButton.addEventListener('click', function onPreviewLoad() {
          if (typeof opts.onLoadPreview === 'function') {
            const result = opts.onLoadPreview(step);
            if (result && typeof result.catch === 'function') {
              result.catch(function onLoadError(error) {
                console.error('[step-list] preview load failed:', error);
              });
            }
          }
        });
      }

      const previewOpenTrigger = stepElement.querySelector('[data-preview-open-step-id]');
      if (previewOpenTrigger) {
        previewOpenTrigger.addEventListener('click', function onPreviewOpen() {
          if (typeof opts.onOpenPreview === 'function') {
            const result = opts.onOpenPreview(step);
            if (result && typeof result.catch === 'function') {
              result.catch(function onOpenError(error) {
                console.error('[step-list] preview open failed:', error);
              });
            }
          }
        });
      }

      const stepActions = document.createElement('div');
      stepActions.className = 'step-actions';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'step-delete-btn';
      deleteButton.title = '删除此步骤';
      deleteButton.innerHTML = '<img src="icons/delete.svg" alt="删除" class="delete-icon">';
      deleteButton.addEventListener('click', function onDelete() {
        if (typeof opts.onDeleteStep === 'function') {
          opts.onDeleteStep(step);
        }
      });

      stepActions.appendChild(deleteButton);
      stepElement.appendChild(stepActions);
      container.appendChild(stepElement);
    });
  }

  global.renderSteps = renderSteps;
})(typeof self !== 'undefined' ? self : window);
