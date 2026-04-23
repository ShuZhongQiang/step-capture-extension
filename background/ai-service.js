function sanitizeJsonString(input) {
  const text = String(input || '').trim();
  if (!text) {
    return '';
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : text;
}

function normalizeAiEndpoint(endpoint) {
  const defaultEndpoint = 'https://api.openai.com/v1/chat/completions';
  const raw = String(endpoint || '').trim();

  if (!raw) {
    return defaultEndpoint;
  }

  if (/\/chat\/completions$/i.test(raw)) {
    return raw;
  }

  if (/\/v1\/?$/i.test(raw)) {
    return raw.replace(/\/?$/, '/chat/completions');
  }

  return raw.replace(/\/$/, '') + '/chat/completions';
}

function buildFallbackAiRewrite(input) {
  const schemas = self.StepRecorderSchemas || {};
  const steps = Array.isArray(input && input.steps) ? input.steps : [];
  const userPrompt = input && input.prompt ? String(input.prompt).trim() : '';
  const payload = typeof schemas.createAiRewriteResult === 'function'
    ? schemas.createAiRewriteResult({
      title: 'AI 增强步骤指南',
      summary: steps.length > 0
        ? (userPrompt ? '已根据用户提示整理：' + userPrompt : '本文档共包含 ' + steps.length + ' 个操作步骤，已按页面上下文自动整理。')
        : '当前没有可改写的步骤。',
      sections: steps.length > 0
        ? [{ heading: '操作步骤', stepIds: steps.map(function mapStep(step) { return step.stepId; }) }]
        : [],
      rewrittenSteps: steps.map(function mapStep(step) {
        const targetLabel = step.targetText || '目标元素';
        const pageTitle = step.pageTitle || step.pageUrl || '当前页面';
        return {
          stepId: step.stepId,
          title: '点击“' + targetLabel + '”',
          instruction: '在“' + pageTitle + '”中点击“' + targetLabel + '”。'
        };
      })
    })
    : {
      title: 'AI 增强步骤指南',
      summary: '',
      sections: [],
      rewrittenSteps: []
    };

  return {
    ok: true,
    provider: 'fallback',
    status: 'fallback',
    output: payload
  };
}

function buildAiMessages(input) {
  const promptPayload = {
    session: input.session,
    steps: input.steps,
    language: input.language,
    userPrompt: input.prompt || ''
  };

  return [
    {
      role: 'system',
      content: [
        '你是一个浏览器操作文档整理助手。',
        '请把输入步骤重写为清晰、专业、面向最终用户的操作指南。',
        '只返回 JSON，不要返回 Markdown，不要解释。',
        'JSON 结构必须是 { title, summary, sections, rewrittenSteps }。',
        'sections 为数组，每项包含 { heading, stepIds }。',
        'rewrittenSteps 为数组，每项包含 { stepId, title, instruction }。',
        '如果 userPrompt 不为空，请优先按 userPrompt 的要求组织标题、摘要、章节和步骤表达。'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify(promptPayload)
    }
  ];
}

async function requestOpenAiCompatibleRewrite(input, aiSettings) {
  const endpoint = normalizeAiEndpoint(aiSettings.endpoint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + aiSettings.apiKey
    },
    body: JSON.stringify({
      model: aiSettings.model || 'gpt-4.1-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: buildAiMessages(input)
    })
  });

  if (!response.ok) {
    throw new Error('ai_http_' + response.status);
  }

  const payload = await response.json();
  const content = payload
    && payload.choices
    && payload.choices[0]
    && payload.choices[0].message
    && payload.choices[0].message.content
    ? payload.choices[0].message.content
    : '';

  if (!content) {
    throw new Error('ai_empty_response');
  }

  const schemas = self.StepRecorderSchemas || {};
  const parsed = JSON.parse(sanitizeJsonString(content));
  const output = typeof schemas.createAiRewriteResult === 'function'
    ? schemas.createAiRewriteResult(parsed)
    : parsed;

  return {
    ok: true,
    provider: 'openai-compatible',
    status: 'completed',
    model: aiSettings.model || 'gpt-4.1-mini',
    output: output
  };
}

async function rewriteDocumentWithAi(input, aiSettings) {
  const constants = self.StepRecorderConstants || {};
  const defaultAiSettings = constants.DEFAULT_AI_SETTINGS || {};
  const settings = {
    ...defaultAiSettings,
    ...(aiSettings || {})
  };

  if (!settings.apiKey) {
    return buildFallbackAiRewrite(input);
  }

  try {
    return await requestOpenAiCompatibleRewrite(input, settings);
  } catch (error) {
    console.warn('[ai-service] AI rewrite failed, using fallback:', error);
    const fallback = buildFallbackAiRewrite(input);
    fallback.error = error && error.message ? error.message : 'ai_request_failed';
    return fallback;
  }
}
