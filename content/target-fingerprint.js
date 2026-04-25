(function initTargetFingerprint(global) {
  const STABLE_ATTRS = [
    'data-testid',
    'data-test-id',
    'data-test',
    'data-qa',
    'data-cy',
    'name',
    'aria-label',
    'title',
    'alt'
  ];

  function safeText(value, maxLength) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return '';
    }

    if (typeof maxLength !== 'number' || text.length <= maxLength) {
      return text;
    }

    return text.slice(0, maxLength) + '...';
  }

  function collectText(element) {
    if (!(element instanceof Element)) {
      return '';
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const ariaLabel = element.getAttribute('aria-label');
      const placeholder = element.placeholder;
      const name = element.name;
      const inputType = element.type || '';

      // 优先使用语义化标识，而不是用户输入的 value
      // 按照优先级：aria-label > placeholder > name > type
      if (ariaLabel) {
        return safeText(ariaLabel, 120);
      }
      if (placeholder) {
        return safeText(placeholder, 120);
      }
      if (name) {
        return safeText(name, 120);
      }

      // 对常见输入类型提供语义化描述
      const typeLabels = {
        'password': '密码',
        'username': '用户名',
        'email': '邮箱',
        'text': '文本输入框',
        'search': '搜索框',
        'tel': '电话号码',
        'url': '网址',
        'number': '数字',
        'checkbox': '复选框',
        'radio': '单选框',
        'file': '文件上传',
        'date': '日期',
        'time': '时间',
        'datetime-local': '日期时间',
        'month': '月份',
        'week': '周',
        'color': '颜色选择',
        'range': '范围滑块',
        'submit': '提交按钮',
        'reset': '重置按钮',
        'button': '按钮'
      };

      return typeLabels[inputType] || '输入框';
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return safeText(ariaLabel, 120);
    }

    const directText = safeText(element.textContent || element.innerText || '', 120);
    if (directText) {
      return directText;
    }

    return safeText(element.getAttribute('title') || element.getAttribute('alt') || '', 120);
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }

    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, function replaceChar(character) {
      return '\\' + character;
    });
  }

  function attrSelector(name, value, tagName) {
    if (!value) {
      return '';
    }

    const prefix = tagName ? tagName.toLowerCase() : '';
    return prefix + '[' + name + '="' + cssEscape(value) + '"]';
  }

  function isSelectorUnique(selector, root) {
    if (!selector) {
      return false;
    }

    try {
      const scope = root || document;
      return scope.querySelectorAll(selector).length === 1;
    } catch (error) {
      return false;
    }
  }

  function firstUnique(selectors, root) {
    for (const selector of selectors) {
      if (isSelectorUnique(selector, root)) {
        return selector;
      }
    }

    return selectors.find(Boolean) || '';
  }

  function getStableClassNames(element) {
    return Array.from(element.classList || [])
      .filter(function filterClass(className) {
        return className
          && className.length <= 48
          && !/[0-9a-f]{6,}/i.test(className)
          && !/^(css|sc|jss|emotion|chakra|mantine)-/i.test(className)
          && !/^\d/.test(className);
      })
      .slice(0, 2);
  }

  function buildSegment(element) {
    const tag = element.tagName.toLowerCase();

    for (const attr of STABLE_ATTRS) {
      const value = element.getAttribute(attr);
      if (value) {
        return attrSelector(attr, value, tag);
      }
    }

    const role = element.getAttribute('role');
    if (role) {
      return attrSelector('role', role, tag);
    }

    const classes = getStableClassNames(element);
    let segment = tag;
    if (classes.length > 0) {
      segment += classes.map(function mapClass(className) {
        return '.' + cssEscape(className);
      }).join('');
    }

    const parent = element.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(function filterSameTag(child) {
        return child.tagName === element.tagName;
      });
      if (sameTagSiblings.length > 1) {
        segment += ':nth-of-type(' + (sameTagSiblings.indexOf(element) + 1) + ')';
      }
    }

    return segment;
  }

  function buildCssPath(element) {
    if (!(element instanceof Element)) {
      return '';
    }

    const uniqueCandidates = [];
    const tag = element.tagName.toLowerCase();

    if (element.id) {
      uniqueCandidates.push('#' + cssEscape(element.id));
      uniqueCandidates.push(tag + '#' + cssEscape(element.id));
    }

    for (const attr of STABLE_ATTRS) {
      uniqueCandidates.push(attrSelector(attr, element.getAttribute(attr), tag));
    }

    const role = element.getAttribute('role');
    if (role) {
      uniqueCandidates.push(attrSelector('role', role, tag));
    }

    const unique = firstUnique(uniqueCandidates.filter(Boolean), document);
    if (unique) {
      return unique;
    }

    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 8) {
      parts.unshift(buildSegment(current));
      const selector = parts.join(' > ');
      if (isSelectorUnique(selector, document)) {
        return selector;
      }

      current = current.parentElement;
      depth += 1;
    }

    return parts.join(' > ');
  }

  function collectFallbackSelectors(element) {
    if (!(element instanceof Element)) {
      return [];
    }

    const selectors = [];
    const tag = element.tagName.toLowerCase();

    if (element.id) {
      selectors.push('#' + cssEscape(element.id));
      selectors.push(tag + '#' + cssEscape(element.id));
    }

    for (const attr of STABLE_ATTRS) {
      selectors.push(attrSelector(attr, element.getAttribute(attr), tag));
    }

    const role = element.getAttribute('role');
    if (role) {
      selectors.push(attrSelector('role', role, tag));
    }

    const href = element.getAttribute('href');
    if (href) {
      selectors.push(attrSelector('href', href, tag));
    }

    const classes = getStableClassNames(element);
    if (classes.length > 0) {
      selectors.push(tag + classes.map(function mapClass(className) {
        return '.' + cssEscape(className);
      }).join(''));
    }

    selectors.push(buildCssPath(element));

    return Array.from(new Set(selectors.filter(Boolean))).slice(0, 10);
  }

  function resolveRole(element) {
    if (!(element instanceof Element)) {
      return '';
    }

    const explicitRole = element.getAttribute('role');
    if (explicitRole) {
      return explicitRole;
    }

    const tag = element.tagName.toLowerCase();
    if (tag === 'a') {
      return 'link';
    }
    if (tag === 'button') {
      return 'button';
    }
    if (tag === 'input') {
      return element.getAttribute('type') || 'input';
    }
    if (tag === 'select') {
      return 'combobox';
    }
    if (tag === 'textarea') {
      return 'textbox';
    }
    return '';
  }

  function buildFramePath() {
    const path = [];
    let currentWindow = window;

    try {
      while (currentWindow && currentWindow !== currentWindow.top) {
        const parentWindow = currentWindow.parent;
        const frames = Array.from(parentWindow.frames || []);
        const frameIndex = frames.indexOf(currentWindow);
        let frameElement = null;

        try {
          frameElement = currentWindow.frameElement;
        } catch (error) {
          frameElement = null;
        }

        if (frameElement instanceof Element) {
          path.unshift(buildCssPath(frameElement) || ('frame:nth-of-type(' + (frameIndex + 1) + ')'));
        } else {
          path.unshift('frame:nth-of-type(' + (frameIndex + 1) + ')');
        }

        currentWindow = parentWindow;
      }
    } catch (error) {
      path.unshift('cross-origin-frame');
    }

    return path;
  }

  function buildTargetFingerprint(element) {
    if (!(element instanceof Element)) {
      return {
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
        framePath: buildFramePath()
      };
    }

    const rect = element.getBoundingClientRect();
    const dataTestId = element.getAttribute('data-testid')
      || element.getAttribute('data-test-id')
      || element.getAttribute('data-test')
      || element.getAttribute('data-qa')
      || element.getAttribute('data-cy')
      || '';

    const fingerprint = {
      tagName: element.tagName.toLowerCase(),
      selector: buildCssPath(element),
      fallbackSelectors: collectFallbackSelectors(element),
      role: resolveRole(element),
      text: collectText(element),
      ariaLabel: safeText(element.getAttribute('aria-label') || '', 120),
      placeholder: safeText(element.getAttribute('placeholder') || '', 120),
      href: safeText(element.getAttribute('href') || '', 240),
      dataTestId: safeText(dataTestId, 120),
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      },
      framePath: buildFramePath()
    };

    const schemas = self.StepRecorderSchemas || null;
    return schemas && typeof schemas.normalizeTargetFingerprint === 'function'
      ? schemas.normalizeTargetFingerprint(fingerprint)
      : fingerprint;
  }

  global.buildTargetFingerprint = buildTargetFingerprint;
})(typeof self !== 'undefined' ? self : window);
