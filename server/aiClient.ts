import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import {
  DEFAULT_ANTHROPIC_MODELS,
  DEFAULT_GEMINI_MODELS,
  DEFAULT_OPENAI_MODELS,
  estimateAiCostUsd,
  isDeprecatedGeminiModel,
  isGemini4Model,
  isOpenAiReasoningModel,
  type AiModelOption,
  type AiProviderId,
  type AiProviderParameters,
  type AiProviderStatus,
  type AiTaskType,
  type GeminiThinkingLevel,
} from './aiProviderTypes.ts';
import {
  normalizeBaseUrl,
  recordProviderError,
  recordProviderUsage,
  resolveProviderCredentials,
  resolveTaskTarget,
} from './aiProviderStore.ts';

export interface PortableJsonProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  items?: PortableJsonProperty;
  properties?: Record<string, PortableJsonProperty>;
}

export interface PortableJsonSchema {
  type: 'object';
  properties: Record<string, PortableJsonProperty>;
}

function toGeminiSchema(prop: PortableJsonProperty | PortableJsonSchema): Schema {
  const typeMap: Record<PortableJsonProperty['type'], Type> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };

  const out: Schema = {
    type: typeMap[prop.type],
  };
  if ('description' in prop && prop.description) {
    out.description = prop.description;
  }
  if ('items' in prop && prop.items) {
    out.items = toGeminiSchema(prop.items);
  }
  if ('properties' in prop && prop.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(prop.properties)) {
      out.properties[k] = toGeminiSchema(v);
    }
  }
  return out;
}

function stripMarkdownJsonFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return s;
}

function parseJsonSafe<T>(raw: string): T {
  const cleaned = stripMarkdownJsonFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Attempt to extract first top-level JSON object if model wrapped prose around JSON
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error('AI provider returned malformed JSON output.');
  }
}

function buildGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function classifyHttpError(
  provider: AiProviderId,
  status: number,
  detail: string
): { clientStatus: number; providerStatus: AiProviderStatus; message: string } {
  const label =
    provider === 'gemini'
      ? 'Google Gemini'
      : provider === 'openai'
        ? 'OpenAI'
        : provider === 'anthropic'
          ? 'Anthropic Claude'
          : 'Custom AI API';

  if (status === 401 || status === 403) {
    return {
      clientStatus: 401,
      providerStatus: 'invalid_key',
      message: `${label} authentication failed: Invalid or unauthorized API key.`,
    };
  }
  if (status === 429) {
    return {
      clientStatus: 429,
      providerStatus: 'error',
      message: `${label} rate limit or quota exceeded. ${detail ? `(${detail})` : ''}`.trim(),
    };
  }
  if (status === 404) {
    return {
      clientStatus: 400,
      providerStatus: 'error',
      message: `${label} returned 404: Check the endpoint URL or selected model ID. ${detail}`.trim(),
    };
  }
  return {
    clientStatus: status >= 500 ? 500 : 400,
    providerStatus: 'error',
    message: detail || `${label} API request failed (${status}).`,
  };
}

async function extractUpstreamError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.error && typeof parsed.error === 'object') {
        const errObj = parsed.error as Record<string, unknown>;
        if (typeof errObj.message === 'string' && errObj.message) return errObj.message;
      }
      if (typeof parsed.message === 'string' && parsed.message) return parsed.message;
      if (typeof parsed.detail === 'string' && parsed.detail) return parsed.detail;
      return text.slice(0, 260);
    } catch {
      return text.slice(0, 260);
    }
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export async function fetchLiveModelsForProvider(params: {
  provider: AiProviderId;
  apiKey: string;
  baseUrl?: string;
}): Promise<AiModelOption[]> {
  const { provider, apiKey } = params;

  if (provider === 'gemini') {
    const ai = buildGeminiClient(apiKey);
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    const collected: AiModelOption[] = [];
    const seen = new Set<string>();

    for await (const model of pager) {
      const rawName = (model.name || '').replace(/^models\//, '').trim();
      if (!rawName || seen.has(rawName)) continue;

      const lower = rawName.toLowerCase();
      if (isDeprecatedGeminiModel(lower)) continue;
      if (
        lower.includes('embedding') ||
        lower.includes('imagen') ||
        lower.includes('veo') ||
        lower.includes('lyria') ||
        lower.includes('tts') ||
        lower.includes('aqa') ||
        lower.includes('native-audio') ||
        lower.includes('robotics')
      ) {
        continue;
      }
      if (!lower.startsWith('gemini-')) continue;

      const actions = Array.isArray(model.supportedActions) ? model.supportedActions : [];
      if (actions.length > 0 && !actions.includes('generateContent')) continue;

      seen.add(rawName);
      const isG4 = isGemini4Model(rawName);
      collected.push({
        id: rawName,
        label: model.displayName ? `${model.displayName} (${rawName})` : rawName,
        description: model.description,
        supportsTemperature: !isG4,
        supportsThinking: isG4 || lower.includes('gemini-3'),
        supportsMaxTokens: true,
        contextWindow: typeof model.inputTokenLimit === 'number' ? model.inputTokenLimit : undefined,
      });
    }

    // Ensure recommended Gemini 4/3.1 models remain available if listing was empty or filtered
    if (collected.length === 0) {
      return DEFAULT_GEMINI_MODELS;
    }

    // Sort Gemini 4 models first, then Gemini 3+
    collected.sort((a, b) => {
      const score = (id: string) => {
        if (id.includes('gemini-4-hydrogen')) return 0;
        if (id.includes('gemini-4-neon')) return 1;
        if (id.includes('gemini-4-argon')) return 2;
        if (id.includes('gemini-4-carbon')) return 3;
        if (id.includes('gemini-4')) return 4;
        if (id.includes('gemini-3')) return 5;
        return 10;
      };
      return score(a.id) - score(b.id) || a.id.localeCompare(b.id);
    });

    return collected;
  }

  if (provider === 'openai') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const msg = await extractUpstreamError(res);
        const classified = classifyHttpError('openai', res.status, msg);
        throw Object.assign(new Error(classified.message), {
          status: classified.clientStatus,
          providerStatus: classified.providerStatus,
        });
      }
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const rows = Array.isArray(data.data) ? data.data : [];
      const models: AiModelOption[] = [];
      const seen = new Set<string>();

      for (const item of rows) {
        const id = (item.id || '').trim();
        if (!id || seen.has(id)) continue;
        const lower = id.toLowerCase();
        if (!/^(gpt-|o1|o3|o4|o5|chatgpt-)/.test(lower)) continue;
        if (
          lower.includes('audio') ||
          lower.includes('realtime') ||
          lower.includes('tts') ||
          lower.includes('whisper') ||
          lower.includes('dall-e') ||
          lower.includes('embedding') ||
          lower.includes('moderation') ||
          lower.includes('transcribe') ||
          lower.includes('image') ||
          lower.includes('sora') ||
          lower.includes('instruct') ||
          lower.includes('search-preview')
        ) {
          continue;
        }
        seen.add(id);
        models.push({
          id,
          label: id,
          supportsTemperature: !isOpenAiReasoningModel(id),
          supportsMaxTokens: true,
        });
      }

      models.sort((a, b) => {
        const rank = (id: string) => {
          if (id === 'gpt-4.1') return 0;
          if (id === 'gpt-4.1-mini') return 1;
          if (id === 'gpt-4o') return 2;
          if (id === 'gpt-4o-mini') return 3;
          if (id.startsWith('gpt-5')) return 4;
          if (id.startsWith('o4')) return 5;
          if (id.startsWith('o3')) return 6;
          return 10;
        };
        return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
      });

      return models.length > 0 ? models : DEFAULT_OPENAI_MODELS;
    } finally {
      clearTimeout(timer);
    }
  }

  if (provider === 'anthropic') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const msg = await extractUpstreamError(res);
        const classified = classifyHttpError('anthropic', res.status, msg);
        throw Object.assign(new Error(classified.message), {
          status: classified.clientStatus,
          providerStatus: classified.providerStatus,
        });
      }

      const data = (await res.json()) as {
        data?: Array<{ id?: string; display_name?: string }>;
      };
      const rows = Array.isArray(data.data) ? data.data : [];
      const models: AiModelOption[] = rows
        .filter((r) => typeof r.id === 'string' && r.id.trim())
        .map((r) => ({
          id: r.id!.trim(),
          label: r.display_name ? `${r.display_name} (${r.id!.trim()})` : r.id!.trim(),
          supportsTemperature: true,
          supportsMaxTokens: true,
        }));

      return models.length > 0 ? models : DEFAULT_ANTHROPIC_MODELS;
    } finally {
      clearTimeout(timer);
    }
  }

  // Custom OpenAI-compatible endpoint
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  if (!baseUrl) {
    throw Object.assign(
      new Error('A valid http:// or https:// Base URL is required for Custom OpenAI-compatible endpoints.'),
      { status: 400, providerStatus: 'error' as AiProviderStatus }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      const msg = await extractUpstreamError(res);
      const classified = classifyHttpError('custom', res.status, msg);
      throw Object.assign(new Error(classified.message), {
        status: classified.clientStatus,
        providerStatus: classified.providerStatus,
      });
    }

    if (!res.ok) {
      const msg = await extractUpstreamError(res);
      const classified = classifyHttpError('custom', res.status, msg);
      throw Object.assign(new Error(classified.message), {
        status: classified.clientStatus,
        providerStatus: classified.providerStatus,
      });
    }

    const data = (await res.json()) as {
      data?: Array<{ id?: string; name?: string }>;
      models?: Array<{ id?: string; name?: string }>;
    };
    const rawList = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.models)
        ? data.models
        : [];
    const models: AiModelOption[] = [];
    const seen = new Set<string>();
    for (const item of rawList) {
      const id = (item.id || item.name || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        label: item.name && item.name !== id ? `${item.name} (${id})` : id,
        supportsTemperature: true,
        supportsMaxTokens: true,
      });
    }
    return models;
  } finally {
    clearTimeout(timer);
  }
}

export async function testProviderConnection(params: {
  provider: AiProviderId;
  apiKey?: string;
  baseUrl?: string;
  customModelId?: string;
  workspaceId?: string;
}): Promise<{
  ok: boolean;
  status: AiProviderStatus;
  latencyMs: number;
  models: AiModelOption[];
  error?: string;
}> {
  const start = Date.now();
  const workspaceId = params.workspaceId || 'default';
  const stored = await resolveProviderCredentials(params.provider, workspaceId);

  const effectiveKey = params.apiKey?.trim() || stored.apiKey;
  const effectiveBaseUrl =
    params.provider === 'custom'
      ? normalizeBaseUrl(params.baseUrl) || stored.baseUrl
      : stored.baseUrl;

  if (!effectiveKey) {
    return {
      ok: false,
      status: 'not_configured',
      latencyMs: Date.now() - start,
      models: [],
      error: 'No API key provided or saved for this provider.',
    };
  }

  if (params.provider === 'custom' && !effectiveBaseUrl) {
    return {
      ok: false,
      status: 'error',
      latencyMs: Date.now() - start,
      models: [],
      error: 'Base URL is required for custom OpenAI-compatible endpoints (e.g. https://openrouter.ai/api/v1).',
    };
  }

  try {
    let models = await fetchLiveModelsForProvider({
      provider: params.provider,
      apiKey: effectiveKey,
      baseUrl: effectiveBaseUrl,
    });

    const latencyMs = Date.now() - start;
    return {
      ok: true,
      status: 'connected',
      latencyMs,
      models,
    };
  } catch (err) {
    // Fallback for custom OpenAI-compatible endpoints that disable GET /models but allow POST /chat/completions
    const candidateModel = (params.customModelId || stored.selectedModel || '').trim();
    if (
      params.provider === 'custom' &&
      candidateModel &&
      err instanceof Error &&
      'status' in err &&
      (err as { status: number }).status !== 401
    ) {
      try {
        const pingController = new AbortController();
        const timer = setTimeout(() => pingController.abort(), 12000);
        try {
          const pingRes = await fetch(`${effectiveBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${effectiveKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: candidateModel,
              messages: [{ role: 'user', content: 'Respond with OK' }],
              max_tokens: 4,
            }),
            signal: pingController.signal,
          });
          const pingLatency = Date.now() - start;
          if (pingRes.ok) {
            return {
              ok: true,
              status: 'connected',
              latencyMs: pingLatency,
              models: [
                {
                  id: candidateModel,
                  label: candidateModel,
                  supportsTemperature: true,
                  supportsMaxTokens: true,
                },
              ],
            };
          }
          if (pingRes.status === 401 || pingRes.status === 403) {
            return {
              ok: false,
              status: 'invalid_key',
              latencyMs: pingLatency,
              models: [],
              error: 'Authentication failed: Invalid or unauthorized API key.',
            };
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // Fall through to primary error
      }
    }

    const latencyMs = Date.now() - start;
    let status: AiProviderStatus = 'error';
    let message = 'Unable to connect to AI provider.';

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        message = 'Connection timed out while contacting provider.';
      } else {
        message = err.message;
      }
      if ('providerStatus' in err && typeof err.providerStatus === 'string') {
        status = err.providerStatus as AiProviderStatus;
      } else if (/invalid|unauthorized|api[_\s]?key|401|403/i.test(message)) {
        status = 'invalid_key';
      }
    }

    return {
      ok: false,
      status,
      latencyMs,
      models: [],
      error: message,
    };
  }
}

export interface AiCallResult<T> {
  data: T;
  provider: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
}

async function executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? err.status
          : 500;
      const retryable = status === 429 || status >= 500;
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }
      const backoff = Math.round(900 * Math.pow(2, attempt - 1) + Math.random() * 250);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

function buildSchemaInstruction(schema: PortableJsonSchema): string {
  return `Respond with a valid JSON object matching this exact structure (no markdown code fences, no extra prose):\n${JSON.stringify(
    schema,
    null,
    2
  )}`;
}

async function callGemini(params: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  prompt: string;
  schema?: PortableJsonSchema;
  parameters: AiProviderParameters;
  defaultThinkingLevel?: GeminiThinkingLevel;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const ai = buildGeminiClient(params.apiKey);
  const isG4 = isGemini4Model(params.model);
  const thinkingLevel = params.parameters.thinkingLevel || params.defaultThinkingLevel || 'LOW';

  const config: Record<string, unknown> = {};
  if (params.systemInstruction) {
    config.systemInstruction = params.systemInstruction;
  }
  if (params.schema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = toGeminiSchema(params.schema);
  }
  if (isG4) {
    const levelMap: Record<GeminiThinkingLevel, ThinkingLevel> = {
      LOW: ThinkingLevel.LOW,
      MEDIUM: ThinkingLevel.MEDIUM,
      HIGH: ThinkingLevel.HIGH,
    };
    config.thinkingConfig = { thinkingLevel: levelMap[thinkingLevel] || ThinkingLevel.LOW };
    // Never pass deprecated temperature/topP/topK on Gemini 4 series
  } else {
    if (typeof params.parameters.temperature === 'number') {
      config.temperature = Math.min(2, Math.max(0, params.parameters.temperature));
    }
  }
  if (typeof params.parameters.maxTokens === 'number' && params.parameters.maxTokens > 0) {
    config.maxOutputTokens = Math.min(65536, Math.round(params.parameters.maxTokens));
  }

  try {
    const res = await ai.models.generateContent({
      model: params.model,
      contents: params.prompt,
      config,
    });
    const text = (res.text ?? '').trim();
    const inputTokens = res.usageMetadata?.promptTokenCount || 0;
    const outputTokens = res.usageMetadata?.candidatesTokenCount || 0;
    return { text, inputTokens, outputTokens };
  } catch (err) {
    let rawMsg = err instanceof Error ? err.message : String(err);
    let parsedCode: number | undefined;
    try {
      const parsed = JSON.parse(rawMsg) as { error?: { code?: number; message?: string; status?: string } };
      if (parsed?.error?.message) {
        parsedCode = parsed.error.code;
        rawMsg = parsed.error.status
          ? `Google Gemini (${parsed.error.status}): ${parsed.error.message}`
          : `Google Gemini: ${parsed.error.message}`;
      }
    } catch {
      // Keep original message if not JSON
    }
    const status =
      parsedCode === 401 || parsedCode === 403 || /api[_\s]?key|permission|unauthenticated|401|403/i.test(rawMsg)
        ? 401
        : parsedCode === 429 || /quota|rate|429|resource_exhausted/i.test(rawMsg)
          ? 429
          : parsedCode === 404 || /not found|unsupported|404/i.test(rawMsg)
            ? 400
            : 500;
    throw Object.assign(new Error(rawMsg), { status });
  }
}

async function callOpenAiCompatible(params: {
  provider: 'openai' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  systemInstruction?: string;
  prompt: string;
  schema?: PortableJsonSchema;
  parameters: AiProviderParameters;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  const sysParts = [params.systemInstruction, params.schema ? buildSchemaInstruction(params.schema) : '']
    .filter(Boolean)
    .join('\n\n');
  if (sysParts) {
    messages.push({ role: 'system', content: sysParts });
  }
  messages.push({ role: 'user', content: params.prompt });

  const buildBody = (useJsonMode: boolean) => {
    const body: Record<string, unknown> = {
      model: params.model,
      messages,
    };
    if (useJsonMode && params.schema) {
      body.response_format = { type: 'json_object' };
    }
    if (
      typeof params.parameters.temperature === 'number' &&
      !(params.provider === 'openai' && isOpenAiReasoningModel(params.model))
    ) {
      body.temperature = Math.min(2, Math.max(0, params.parameters.temperature));
    }
    if (typeof params.parameters.maxTokens === 'number' && params.parameters.maxTokens > 0) {
      body.max_tokens = Math.round(params.parameters.maxTokens);
    }
    return body;
  };

  const runFetch = async (useJsonMode: boolean) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      return await fetch(`${params.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildBody(useJsonMode)),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await runFetch(Boolean(params.schema));
  // Retry without response_format if custom OpenAI-compatible server rejects json_object mode
  if (!res.ok && res.status === 400 && params.schema && params.provider === 'custom') {
    const errPreview = await res.clone().text().catch(() => '');
    if (/response_format|json_object/i.test(errPreview)) {
      res = await runFetch(false);
    }
  }

  if (!res.ok) {
    const msg = await extractUpstreamError(res);
    const classified = classifyHttpError(params.provider, res.status, msg);
    throw Object.assign(new Error(classified.message), {
      status: classified.clientStatus,
      providerStatus: classified.providerStatus,
    });
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const msgContent = data.choices?.[0]?.message?.content;
  const text =
    typeof msgContent === 'string'
      ? msgContent.trim()
      : Array.isArray(msgContent)
        ? msgContent.map((p) => p.text || '').join('').trim()
        : '';

  if (!text) {
    throw Object.assign(new Error('Provider returned an empty completion response.'), { status: 500 });
  }

  return {
    text,
    inputTokens: Number(data.usage?.prompt_tokens) || 0,
    outputTokens: Number(data.usage?.completion_tokens) || 0,
  };
}

async function callAnthropic(params: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  prompt: string;
  schema?: PortableJsonSchema;
  parameters: AiProviderParameters;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const systemText = [params.systemInstruction, params.schema ? buildSchemaInstruction(params.schema) : '']
    .filter(Boolean)
    .join('\n\n');

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens:
      typeof params.parameters.maxTokens === 'number' && params.parameters.maxTokens > 0
        ? Math.min(16384, Math.round(params.parameters.maxTokens))
        : 4096,
    messages: [{ role: 'user', content: params.prompt }],
  };
  if (systemText) {
    body.system = systemText;
  }
  if (typeof params.parameters.temperature === 'number') {
    body.temperature = Math.min(1, Math.max(0, params.parameters.temperature));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const msg = await extractUpstreamError(res);
      const classified = classifyHttpError('anthropic', res.status, msg);
      throw Object.assign(new Error(classified.message), {
        status: classified.clientStatus,
        providerStatus: classified.providerStatus,
      });
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = Array.isArray(data.content)
      ? data.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text!)
          .join('')
          .trim()
      : '';

    if (!text) {
      throw Object.assign(new Error('Anthropic returned an empty message.'), { status: 500 });
    }

    return {
      text,
      inputTokens: Number(data.usage?.input_tokens) || 0,
      outputTokens: Number(data.usage?.output_tokens) || 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateStructuredAi<T>(params: {
  task: AiTaskType;
  prompt: string;
  schema: PortableJsonSchema;
  systemInstruction?: string;
  defaultThinkingLevel?: GeminiThinkingLevel;
  workspaceId?: string;
  overrideProvider?: AiProviderId;
  overrideModel?: string;
}): Promise<AiCallResult<T>> {
  const workspaceId = params.workspaceId || 'default';
  const target = await resolveTaskTarget(params.task, workspaceId, {
    provider: params.overrideProvider,
    model: params.overrideModel,
  });

  try {
    const raw = await executeWithRetry(async () => {
      if (target.provider === 'gemini') {
        return callGemini({
          apiKey: target.apiKey,
          model: target.model,
          systemInstruction: params.systemInstruction,
          prompt: params.prompt,
          schema: params.schema,
          parameters: target.parameters,
          defaultThinkingLevel: params.defaultThinkingLevel,
        });
      }
      if (target.provider === 'anthropic') {
        return callAnthropic({
          apiKey: target.apiKey,
          model: target.model,
          systemInstruction: params.systemInstruction,
          prompt: params.prompt,
          schema: params.schema,
          parameters: target.parameters,
        });
      }
      return callOpenAiCompatible({
        provider: target.provider === 'custom' ? 'custom' : 'openai',
        baseUrl: target.baseUrl,
        apiKey: target.apiKey,
        model: target.model,
        systemInstruction: params.systemInstruction,
        prompt: params.prompt,
        schema: params.schema,
        parameters: target.parameters,
      });
    });

    const parsed = parseJsonSafe<T>(raw.text);
    const estIn = raw.inputTokens || Math.round(params.prompt.length / 4);
    const estOut = raw.outputTokens || Math.round(raw.text.length / 4);

    await recordProviderUsage(target.provider, target.model, estIn, estOut, workspaceId);

    return {
      data: parsed,
      provider: target.provider,
      model: target.model,
      inputTokens: estIn,
      outputTokens: estOut,
      totalTokens: estIn + estOut,
      estimatedCostUsd: estimateAiCostUsd(target.provider, target.model, estIn, estOut),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI generation failed.';
    const pStatus: AiProviderStatus =
      err && typeof err === 'object' && 'providerStatus' in err
        ? (err.providerStatus as AiProviderStatus)
        : /invalid|unauthorized|401/i.test(msg)
          ? 'invalid_key'
          : 'error';
    await recordProviderError(target.provider, pStatus, msg, workspaceId);
    throw err;
  }
}

export async function generateTextAi(params: {
  task: AiTaskType;
  prompt: string;
  systemInstruction?: string;
  defaultThinkingLevel?: GeminiThinkingLevel;
  workspaceId?: string;
  overrideProvider?: AiProviderId;
  overrideModel?: string;
}): Promise<AiCallResult<string>> {
  const workspaceId = params.workspaceId || 'default';
  const target = await resolveTaskTarget(params.task, workspaceId, {
    provider: params.overrideProvider,
    model: params.overrideModel,
  });

  try {
    const raw = await executeWithRetry(async () => {
      if (target.provider === 'gemini') {
        return callGemini({
          apiKey: target.apiKey,
          model: target.model,
          systemInstruction: params.systemInstruction,
          prompt: params.prompt,
          parameters: target.parameters,
          defaultThinkingLevel: params.defaultThinkingLevel,
        });
      }
      if (target.provider === 'anthropic') {
        return callAnthropic({
          apiKey: target.apiKey,
          model: target.model,
          systemInstruction: params.systemInstruction,
          prompt: params.prompt,
          parameters: target.parameters,
        });
      }
      return callOpenAiCompatible({
        provider: target.provider === 'custom' ? 'custom' : 'openai',
        baseUrl: target.baseUrl,
        apiKey: target.apiKey,
        model: target.model,
        systemInstruction: params.systemInstruction,
        prompt: params.prompt,
        parameters: target.parameters,
      });
    });

    const estIn = raw.inputTokens || Math.round(params.prompt.length / 4);
    const estOut = raw.outputTokens || Math.round(raw.text.length / 4);

    await recordProviderUsage(target.provider, target.model, estIn, estOut, workspaceId);

    return {
      data: raw.text,
      provider: target.provider,
      model: target.model,
      inputTokens: estIn,
      outputTokens: estOut,
      totalTokens: estIn + estOut,
      estimatedCostUsd: estimateAiCostUsd(target.provider, target.model, estIn, estOut),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI text generation failed.';
    const pStatus: AiProviderStatus =
      err && typeof err === 'object' && 'providerStatus' in err
        ? (err.providerStatus as AiProviderStatus)
        : /invalid|unauthorized|401/i.test(msg)
          ? 'invalid_key'
          : 'error';
    await recordProviderError(target.provider, pStatus, msg, workspaceId);
    throw err;
  }
}
