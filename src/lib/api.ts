import type {
  AiModelOption,
  AiProviderId,
  AiProviderParameters,
  AiProvidersPublicState,
  AiProviderStatus,
  AiTaskRouteConfig,
  AiTaskType,
  ApiConfigStatus,
  DirectedSegmentPayload,
  GenerationParams,
  GenerationProgress,
  GenerationRecord,
  UserPreferences,
  VoiceModel,
} from '../types';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (res.ok) {
        const trimmed = text.trim().toLowerCase();
        const isHtml = trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
        throw new ApiError(
          isHtml
            ? 'The server returned an HTML page instead of JSON (it may have been restarting or the request was blocked). Please retry.'
            : `Server returned an unexpected non-JSON response (${res.status}).`,
          res.status
        );
      }
    }
  }

  if (!res.ok) {
    const message =
      typeof data.error === 'string' && data.error
        ? data.error
        : text.slice(0, 200) || `Request failed (${res.status})`;
    const code = typeof data.code === 'string' ? data.code : undefined;
    throw new ApiError(message, res.status, code);
  }

  return data as T;
}

export const api = {
  getConfigStatus: () => requestJson<ApiConfigStatus>('/api/config/status'),

  saveApiKey: (apiKey: string) =>
    requestJson<ApiConfigStatus & { latencyMs?: number }>('/api/config/key', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),

  removeApiKey: () =>
    requestJson<ApiConfigStatus>('/api/config/key', {
      method: 'DELETE',
    }),

  testConnection: () =>
    requestJson<{ ok: boolean; latencyMs: number; credit: number | null; error?: string }>(
      '/api/config/test',
      { method: 'POST' }
    ),

  getPreferences: () => requestJson<UserPreferences>('/api/preferences'),

  updatePreferences: (patch: Partial<UserPreferences>) =>
    requestJson<UserPreferences>('/api/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  getVoices: (params: {
    page_size?: number;
    page_number?: number;
    title?: string;
    language?: string;
    tag?: string;
    sort_by?: 'task_count' | 'created_at';
    self?: boolean;
  }) => {
    const search = new URLSearchParams();
    if (params.page_size) search.set('page_size', String(params.page_size));
    if (params.page_number) search.set('page_number', String(params.page_number));
    if (params.title) search.set('title', params.title);
    if (params.language && params.language !== 'all') search.set('language', params.language);
    if (params.tag && params.tag !== 'all') search.set('tag', params.tag);
    if (params.sort_by) search.set('sort_by', params.sort_by);
    if (params.self) search.set('self', 'true');
    return requestJson<{ total: number; items: VoiceModel[] }>(`/api/voices?${search.toString()}`);
  },

  getVoiceById: (id: string) => requestJson<VoiceModel>(`/api/voices/${encodeURIComponent(id)}`),

  generateSpeech: (payload: {
    text: string;
    voiceId: string | null;
    voiceName: string;
    voiceAuthor?: string;
    segments?: DirectedSegmentPayload[];
  } & GenerationParams) =>
    requestJson<{ record: GenerationRecord }>('/api/tts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  auditionSegment: async (
    payload: {
      text: string;
      emotionTag?: string;
      voiceId: string | null;
      speed: number;
    } & GenerationParams,
    signal?: AbortSignal
  ): Promise<Blob> => {
    const res = await fetch('/api/tts/audition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        format: payload.format === 'pcm' ? 'wav' : payload.format,
      }),
      signal,
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || contentType.includes('application/json') || contentType.includes('text/html')) {
      const text = await res.text();
      let msg = `Segment audition failed (${res.status}).`;
      let code: string | undefined;
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.error === 'string' && parsed.error) msg = parsed.error;
        if (typeof parsed.code === 'string') code = parsed.code;
      } catch {
        if (text.trim().toLowerCase().startsWith('<')) {
          msg = 'The server returned an HTML page instead of audio. Please retry.';
        }
      }
      throw new ApiError(msg, res.status, code);
    }
    return await res.blob();
  },

  generateSpeechStream: async (
    payload: {
      text: string;
      voiceId: string | null;
      voiceName: string;
      voiceAuthor?: string;
      segments?: DirectedSegmentPayload[];
    } & GenerationParams,
    options?: {
      signal?: AbortSignal;
      onProgress?: (progress: GenerationProgress) => void;
    }
  ): Promise<{ record: GenerationRecord }> => {
    const res = await fetch('/api/tts/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('text/event-stream')) {
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // Not JSON
      }
      const msg =
        typeof data.error === 'string' && data.error
          ? data.error
          : 'Unable to start speech synthesis stream.';
      const code = typeof data.code === 'string' ? data.code : undefined;
      throw new ApiError(msg, res.status, code);
    }

    if (!res.body) {
      throw new ApiError('Browser streaming is not available for this response.', 500);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completedRecord: GenerationRecord | null = null;

    const processBlock = (block: string): GenerationRecord | null => {
      const lines = block.split('\n');
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length === 0) return null;
      const rawData = dataLines.join('\n');
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        return null;
      }

      if (eventName === 'progress') {
        options?.onProgress?.(parsed as unknown as GenerationProgress);
      } else if (eventName === 'complete') {
        return (parsed.record as GenerationRecord) ?? null;
      } else if (eventName === 'error') {
        const msg =
          typeof parsed.error === 'string' ? parsed.error : 'Speech synthesis failed.';
        const status = typeof parsed.status === 'number' ? parsed.status : 500;
        throw new ApiError(msg, status);
      }
      return null;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (block.trim()) {
          const rec = processBlock(block);
          if (rec) completedRecord = rec;
        }
      }
    }

    if (buffer.trim()) {
      const rec = processBlock(buffer);
      if (rec) completedRecord = rec;
    }

    if (!completedRecord?.id) {
      throw new ApiError('Synthesis stream ended without returning an audio record.', 500);
    }

    return { record: completedRecord };
  },

  getHistory: () => requestJson<{ items: GenerationRecord[] }>('/api/history'),

  transcribeHistoryItem: (
    id: string,
    mode: 'auto' | 'fish-asr' | 'gemini' | 'acoustic' = 'auto'
  ) =>
    requestJson<{ record: GenerationRecord }>(
      `/api/history/${encodeURIComponent(id)}/transcribe`,
      {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }
    ),

  deleteHistoryItem: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/history/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  clearHistory: () =>
    requestJson<{ ok: boolean }>('/api/history', {
      method: 'DELETE',
    }),

  getFavorites: () => requestJson<{ items: VoiceModel[] }>('/api/favorites'),

  addFavorite: (voice: VoiceModel) =>
    requestJson<{ items: VoiceModel[] }>('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({ voice }),
    }),

  removeFavorite: (id: string) =>
    requestJson<{ items: VoiceModel[] }>(`/api/favorites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getAiProviders: () => requestJson<AiProvidersPublicState>('/api/ai-providers'),

  updateAiRouting: (payload: {
    defaultProvider?: AiProviderId;
    taskRouting?: Partial<Record<AiTaskType, Partial<AiTaskRouteConfig>>>;
  }) =>
    requestJson<{ state: AiProvidersPublicState }>('/api/ai-providers/routing', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  saveAiProviderConfig: (
    provider: AiProviderId,
    payload: {
      apiKey?: string;
      baseUrl?: string;
      selectedModel?: string;
      customModelId?: string;
      parameters?: AiProviderParameters;
    }
  ) =>
    requestJson<{ state: AiProvidersPublicState; latencyMs?: number; modelsCount?: number }>(
      `/api/ai-providers/${encodeURIComponent(provider)}/config`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  testAiProvider: (
    provider: AiProviderId,
    payload?: { apiKey?: string; baseUrl?: string; customModelId?: string }
  ) =>
    requestJson<{
      ok: boolean;
      status: AiProviderStatus;
      latencyMs: number;
      models: AiModelOption[];
      error?: string;
      state: AiProvidersPublicState;
    }>(`/api/ai-providers/${encodeURIComponent(provider)}/test`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  refreshAiProviderModels: (
    provider: AiProviderId,
    payload?: { apiKey?: string; baseUrl?: string }
  ) =>
    requestJson<{ models: AiModelOption[]; state: AiProvidersPublicState }>(
      `/api/ai-providers/${encodeURIComponent(provider)}/models`,
      {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }
    ),

  deleteAiProviderKey: (provider: AiProviderId) =>
    requestJson<{ state: AiProvidersPublicState }>(
      `/api/ai-providers/${encodeURIComponent(provider)}/key`,
      {
        method: 'DELETE',
      }
    ),
};

/**
 * Wraps raw signed 16-bit little-endian PCM bytes in a minimal RIFF/WAV header
 * so HTMLAudioElement can play PCM output directly in the browser.
 */
export async function createPlayablePcmUrl(audioUrl: string, sampleRate: number): Promise<string> {
  const res = await fetch(audioUrl);
  if (!res.ok) {
    throw new Error('Unable to load PCM audio stream');
  }
  const pcmData = new Uint8Array(await res.arrayBuffer());
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.byteLength, true);

  const wavBlob = new Blob([header, pcmData], { type: 'audio/wav' });
  return URL.createObjectURL(wavBlob);
}
