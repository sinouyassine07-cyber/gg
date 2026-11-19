export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'custom';

export type AiProviderStatus = 'connected' | 'invalid_key' | 'error' | 'not_configured';

export type AiTaskType = 'scriptGeneration' | 'scenePlanning' | 'imagePrompts';

export type GeminiThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AiModelOption {
  id: string;
  label: string;
  description?: string;
  supportsTemperature: boolean;
  supportsThinking?: boolean;
  supportsMaxTokens: boolean;
  contextWindow?: number;
}

export interface AiProviderParameters {
  temperature?: number;
  maxTokens?: number;
  thinkingLevel?: GeminiThinkingLevel;
}

export interface AiProviderUsageStats {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  lastUsedAt?: string;
}

export interface AiTaskRouteConfig {
  useDefault: boolean;
  provider: AiProviderId;
  model: string;
}

export interface StoredAiProviderEntry {
  encryptedApiKey?: string;
  iv?: string;
  authTag?: string;
  maskedKey?: string;
  updatedAt?: string;
  baseUrl?: string;
  selectedModel?: string;
  customModelId?: string;
  availableModels?: AiModelOption[];
  parameters?: AiProviderParameters;
  status?: AiProviderStatus;
  lastTestedAt?: string;
  lastSuccessAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
  usage?: AiProviderUsageStats;
}

export interface AiProviderSummary {
  id: AiProviderId;
  name: string;
  hasSavedKey: boolean;
  hasEffectiveKey: boolean;
  source: 'user' | 'env' | 'none';
  maskedKey: string | null;
  baseUrl: string;
  selectedModel: string;
  customModelId: string;
  availableModels: AiModelOption[];
  parameters: AiProviderParameters;
  status: AiProviderStatus;
  lastTestedAt: string | null;
  lastSuccessAt: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  updatedAt: string | null;
  usage: AiProviderUsageStats;
}

export interface AiProvidersPublicState {
  defaultProvider: AiProviderId;
  taskRouting: Record<AiTaskType, AiTaskRouteConfig>;
  providers: Record<AiProviderId, AiProviderSummary>;
  anyConfigured: boolean;
}

export const AI_PROVIDER_IDS: AiProviderId[] = ['gemini', 'openai', 'anthropic', 'custom'];

export const DEFAULT_GEMINI_MODELS: AiModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (Fast Reasoning)',
    supportsTemperature: false,
    supportsThinking: true,
    supportsMaxTokens: true,
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon (Balanced)',
    supportsTemperature: false,
    supportsThinking: true,
    supportsMaxTokens: true,
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon (Deep Reasoning)',
    supportsTemperature: false,
    supportsThinking: true,
    supportsMaxTokens: true,
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon (Frontier)',
    supportsTemperature: false,
    supportsThinking: true,
    supportsMaxTokens: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    supportsTemperature: true,
    supportsThinking: true,
    supportsMaxTokens: true,
  },
];

export const DEFAULT_OPENAI_MODELS: AiModelOption[] = [
  {
    id: 'gpt-4.1',
    label: 'GPT-4.1',
    supportsTemperature: true,
    supportsMaxTokens: true,
  },
  {
    id: 'gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    supportsTemperature: true,
    supportsMaxTokens: true,
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    supportsTemperature: true,
    supportsMaxTokens: true,
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    supportsTemperature: true,
    supportsMaxTokens: true,
  },
  {
    id: 'o4-mini',
    label: 'o4-mini (Reasoning)',
    supportsTemperature: false,
    supportsMaxTokens: true,
  },
  {
    id: 'o3-mini',
    label: 'o3-mini (Reasoning)',
    supportsTemperature: false,
    supportsMaxTokens: true,
  },
];

export const DEFAULT_ANTHROPIC_MODELS: AiModelOption[] = [
  {
    id: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet 4',
    supportsTemperature: true,
    supportsMaxTokens: true,
  },
  {
    id: 'claude-3-7-sonnet-20250219',
    label: 'Claude 3.7 Sonnet',
    supportsTemperature: true,
    supportsMaxTokens: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    label: 'Claude 3.5 Haiku',
    supportsTemperature: true,
    supportsMaxTokens: true,
  },
];

export function isGemini4Model(modelId: string): boolean {
  return /^gemini-4-(hydrogen|neon|argon|carbon)\b/i.test(modelId.trim());
}

export function isDeprecatedGeminiModel(modelId: string): boolean {
  const lower = modelId.trim().toLowerCase();
  return lower.includes('gemini-1.5') || lower.includes('gemini-2.0') || lower.includes('gemini-1.0');
}

export function isOpenAiReasoningModel(modelId: string): boolean {
  const lower = modelId.trim().toLowerCase();
  return /^(o1|o3|o4|o5)\b/.test(lower) || lower.startsWith('gpt-5');
}

/**
 * Estimates USD cost per 1M input/output tokens for known model families.
 * Returns null if the model/provider pricing is unknown (e.g., custom endpoints).
 */
export function estimateAiCostUsd(
  provider: AiProviderId,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  if (provider === 'custom' || (inputTokens <= 0 && outputTokens <= 0)) {
    return null;
  }
  const m = modelId.toLowerCase();
  let inPerM: number | null = null;
  let outPerM: number | null = null;

  if (provider === 'gemini') {
    if (m.includes('hydrogen') || m.includes('flash-lite') || m.includes('flash')) {
      inPerM = 0.15;
      outPerM = 0.6;
    } else if (m.includes('neon')) {
      inPerM = 0.5;
      outPerM = 2.0;
    } else if (m.includes('argon') || m.includes('carbon') || m.includes('pro')) {
      inPerM = 1.25;
      outPerM = 5.0;
    }
  } else if (provider === 'openai') {
    if (m.includes('4.1-nano')) {
      inPerM = 0.1;
      outPerM = 0.4;
    } else if (m.includes('4.1-mini') || m.includes('4o-mini')) {
      inPerM = 0.15;
      outPerM = 0.6;
    } else if (m.includes('o3-mini') || m.includes('o4-mini')) {
      inPerM = 1.1;
      outPerM = 4.4;
    } else if (m.includes('4.1') || m.includes('4o') || m.includes('gpt-5')) {
      inPerM = 2.5;
      outPerM = 10.0;
    }
  } else if (provider === 'anthropic') {
    if (m.includes('haiku')) {
      inPerM = 0.8;
      outPerM = 4.0;
    } else if (m.includes('opus')) {
      inPerM = 15.0;
      outPerM = 75.0;
    } else if (m.includes('sonnet')) {
      inPerM = 3.0;
      outPerM = 15.0;
    }
  }

  if (inPerM === null || outPerM === null) {
    return null;
  }

  const usd = (inputTokens / 1_000_000) * inPerM + (outputTokens / 1_000_000) * outPerM;
  return Number(usd.toFixed(6));
}
