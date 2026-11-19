import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  AI_PROVIDER_IDS,
  DEFAULT_ANTHROPIC_MODELS,
  DEFAULT_GEMINI_MODELS,
  DEFAULT_OPENAI_MODELS,
  estimateAiCostUsd,
  isDeprecatedGeminiModel,
  type AiModelOption,
  type AiProviderId,
  type AiProviderParameters,
  type AiProvidersPublicState,
  type AiProviderStatus,
  type AiProviderSummary,
  type AiProviderUsageStats,
  type AiTaskRouteConfig,
  type AiTaskType,
  type StoredAiProviderEntry,
} from './aiProviderTypes.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const SECRET_FILE = path.join(DATA_DIR, '.secret');
const AI_PROVIDERS_FILE = path.join(DATA_DIR, 'ai-providers.json');

interface WorkspaceVault {
  defaultProvider: AiProviderId;
  taskRouting: Record<AiTaskType, AiTaskRouteConfig>;
  providers: Partial<Record<AiProviderId, StoredAiProviderEntry>>;
}

interface StoredVaultFile {
  version: number;
  workspaces: Record<string, WorkspaceVault>;
}

const PROVIDER_DISPLAY_NAMES: Record<AiProviderId, string> = {
  gemini: 'Google Gemini API',
  openai: 'OpenAI API',
  anthropic: 'Anthropic Claude API',
  custom: 'Custom OpenAI-Compatible API',
};

const DEFAULT_SELECTED_MODELS: Record<AiProviderId, string> = {
  gemini: 'gemini-4-hydrogen',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-20250514',
  custom: '',
};

const DEFAULT_FALLBACK_MODELS: Record<AiProviderId, AiModelOption[]> = {
  gemini: DEFAULT_GEMINI_MODELS,
  openai: DEFAULT_OPENAI_MODELS,
  anthropic: DEFAULT_ANTHROPIC_MODELS,
  custom: [],
};

const DEFAULT_PARAMETERS: Record<AiProviderId, AiProviderParameters> = {
  gemini: { thinkingLevel: 'LOW' },
  openai: { temperature: 0.7, maxTokens: 4096 },
  anthropic: { temperature: 0.7, maxTokens: 4096 },
  custom: { temperature: 0.7, maxTokens: 4096 },
};

function createEmptyUsage(): AiProviderUsageStats {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null,
  };
}

function createDefaultWorkspaceVault(): WorkspaceVault {
  return {
    defaultProvider: 'gemini',
    taskRouting: {
      scriptGeneration: { useDefault: true, provider: 'gemini', model: 'gemini-4-hydrogen' },
      scenePlanning: { useDefault: true, provider: 'gemini', model: 'gemini-4-hydrogen' },
      imagePrompts: { useDefault: true, provider: 'gemini', model: 'gemini-4-hydrogen' },
    },
    providers: {},
  };
}

async function ensureDataDir(): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

async function getEncryptionKey(): Promise<Buffer> {
  await ensureDataDir();
  try {
    const existing = await fsp.readFile(SECRET_FILE, 'utf8');
    const buf = Buffer.from(existing.trim(), 'hex');
    if (buf.length === 32) return buf;
  } catch {
    // Generate fresh secret key if absent
  }
  const secret = crypto.randomBytes(32);
  await fsp.writeFile(SECRET_FILE, secret.toString('hex'), { mode: 0o600 });
  return secret;
}

async function encryptProviderSecret(
  plaintext: string
): Promise<{ encryptedApiKey: string; iv: string; authTag: string }> {
  const key = await getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedApiKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

async function decryptProviderSecret(
  encryptedApiKey: string,
  ivB64: string,
  authTagB64: string
): Promise<string | null> {
  try {
    const key = await getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedApiKey, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function maskSecretKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) {
    return `••••${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

async function readVaultFile(): Promise<StoredVaultFile> {
  await ensureDataDir();
  try {
    const raw = await fsp.readFile(AI_PROVIDERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredVaultFile>;
    if (parsed && typeof parsed === 'object' && parsed.workspaces && typeof parsed.workspaces === 'object') {
      return {
        version: Number(parsed.version) || 1,
        workspaces: parsed.workspaces,
      };
    }
  } catch {
    // Initialize fresh store
  }
  return {
    version: 1,
    workspaces: {
      default: createDefaultWorkspaceVault(),
    },
  };
}

async function writeVaultFile(vault: StoredVaultFile): Promise<void> {
  await ensureDataDir();
  const tmp = `${AI_PROVIDERS_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(vault, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, AI_PROVIDERS_FILE);
}

function normalizeWorkspaceId(workspaceId?: string | null): string {
  if (!workspaceId || typeof workspaceId !== 'string') return 'default';
  const cleaned = workspaceId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || 'default';
}

function getWorkspaceFromVault(file: StoredVaultFile, workspaceId?: string): WorkspaceVault {
  const id = normalizeWorkspaceId(workspaceId);
  const existing = file.workspaces[id];
  const def = createDefaultWorkspaceVault();
  if (!existing) return def;
  return {
    defaultProvider: AI_PROVIDER_IDS.includes(existing.defaultProvider)
      ? existing.defaultProvider
      : 'gemini',
    taskRouting: {
      scriptGeneration: {
        ...def.taskRouting.scriptGeneration,
        ...(existing.taskRouting?.scriptGeneration || {}),
      },
      scenePlanning: {
        ...def.taskRouting.scenePlanning,
        ...(existing.taskRouting?.scenePlanning || {}),
      },
      imagePrompts: {
        ...def.taskRouting.imagePrompts,
        ...(existing.taskRouting?.imagePrompts || {}),
      },
    },
    providers: existing.providers || {},
  };
}

function getEnvApiKeyForProvider(provider: AiProviderId): { apiKey: string | null; baseUrl?: string } {
  if (provider === 'gemini') {
    const raw = process.env.GEMINI_API_KEY?.trim();
    if (raw && raw !== 'MY_GEMINI_API_KEY') {
      return { apiKey: raw };
    }
    return { apiKey: null };
  }
  if (provider === 'openai') {
    const raw = process.env.OPENAI_API_KEY?.trim();
    return { apiKey: raw || null };
  }
  if (provider === 'anthropic') {
    const raw = process.env.ANTHROPIC_API_KEY?.trim();
    return { apiKey: raw || null };
  }
  if (provider === 'custom') {
    const raw = process.env.CUSTOM_AI_API_KEY?.trim();
    const baseUrl = process.env.CUSTOM_AI_BASE_URL?.trim();
    return { apiKey: raw || null, baseUrl: baseUrl || '' };
  }
  return { apiKey: null };
}

export function normalizeBaseUrl(raw?: string): string {
  if (!raw) return '';
  let trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  // Allow http(s) endpoints only
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    trimmed = parsed.toString().replace(/\/+$/, '');
    return trimmed;
  } catch {
    return '';
  }
}

function sanitizeModelList(provider: AiProviderId, models?: AiModelOption[]): AiModelOption[] {
  const list = Array.isArray(models) && models.length > 0 ? models : DEFAULT_FALLBACK_MODELS[provider];
  if (provider === 'gemini') {
    const filtered = list.filter((m) => !isDeprecatedGeminiModel(m.id));
    return filtered.length > 0 ? filtered : DEFAULT_GEMINI_MODELS;
  }
  return list;
}

export async function resolveProviderCredentials(
  provider: AiProviderId,
  workspaceId = 'default'
): Promise<{
  apiKey: string | null;
  source: 'user' | 'env' | 'none';
  maskedKey: string | null;
  baseUrl: string;
  selectedModel: string;
  parameters: AiProviderParameters;
  entry: StoredAiProviderEntry;
}> {
  const file = await readVaultFile();
  const ws = getWorkspaceFromVault(file, workspaceId);
  const entry = ws.providers[provider] || {};
  const envInfo = getEnvApiKeyForProvider(provider);

  const selectedModel =
    (entry.customModelId?.trim() || entry.selectedModel?.trim() || DEFAULT_SELECTED_MODELS[provider]).trim();

  const safeModel =
    provider === 'gemini' && isDeprecatedGeminiModel(selectedModel)
      ? DEFAULT_SELECTED_MODELS.gemini
      : selectedModel;

  const baseUrl =
    provider === 'custom'
      ? normalizeBaseUrl(entry.baseUrl) || normalizeBaseUrl(envInfo.baseUrl)
      : provider === 'openai'
        ? 'https://api.openai.com/v1'
        : provider === 'anthropic'
          ? 'https://api.anthropic.com/v1'
          : '';

  const parameters: AiProviderParameters = {
    ...DEFAULT_PARAMETERS[provider],
    ...(entry.parameters || {}),
  };

  if (entry.encryptedApiKey && entry.iv && entry.authTag) {
    const decrypted = await decryptProviderSecret(entry.encryptedApiKey, entry.iv, entry.authTag);
    if (decrypted) {
      return {
        apiKey: decrypted,
        source: 'user',
        maskedKey: entry.maskedKey || maskSecretKey(decrypted),
        baseUrl,
        selectedModel: safeModel,
        parameters,
        entry,
      };
    }
  }

  if (envInfo.apiKey) {
    return {
      apiKey: envInfo.apiKey,
      source: 'env',
      maskedKey: maskSecretKey(envInfo.apiKey),
      baseUrl,
      selectedModel: safeModel,
      parameters,
      entry,
    };
  }

  return {
    apiKey: null,
    source: 'none',
    maskedKey: null,
    baseUrl,
    selectedModel: safeModel,
    parameters,
    entry,
  };
}

export async function getPublicAiProvidersState(
  workspaceId = 'default'
): Promise<AiProvidersPublicState> {
  const file = await readVaultFile();
  const ws = getWorkspaceFromVault(file, workspaceId);

  const providers = {} as Record<AiProviderId, AiProviderSummary>;
  let anyConfigured = false;

  for (const id of AI_PROVIDER_IDS) {
    const creds = await resolveProviderCredentials(id, workspaceId);
    const entry = creds.entry;
    const hasSavedKey = Boolean(entry.encryptedApiKey && entry.iv && entry.authTag);
    const hasEffectiveKey = Boolean(creds.apiKey && (id !== 'custom' || creds.baseUrl));
    if (hasEffectiveKey) {
      anyConfigured = true;
    }

    let status: AiProviderStatus = entry.status || 'not_configured';
    if (!hasEffectiveKey) {
      status = 'not_configured';
    } else if (status === 'not_configured') {
      // Env key or newly configured key without a failed test defaults to connected
      status = creds.source === 'env' ? 'connected' : 'connected';
    }

    const availableModels = sanitizeModelList(id, entry.availableModels);

    providers[id] = {
      id,
      name: PROVIDER_DISPLAY_NAMES[id],
      hasSavedKey,
      hasEffectiveKey,
      source: creds.source,
      maskedKey: creds.maskedKey,
      baseUrl: id === 'custom' ? creds.baseUrl : '',
      selectedModel: creds.selectedModel,
      customModelId: entry.customModelId || '',
      availableModels,
      parameters: creds.parameters,
      status,
      lastTestedAt: entry.lastTestedAt || null,
      lastSuccessAt: entry.lastSuccessAt || null,
      lastLatencyMs: typeof entry.lastLatencyMs === 'number' ? entry.lastLatencyMs : null,
      lastError: entry.lastError || null,
      updatedAt: entry.updatedAt || null,
      usage: {
        ...createEmptyUsage(),
        ...(entry.usage || {}),
      },
    };
  }

  return {
    defaultProvider: ws.defaultProvider,
    taskRouting: ws.taskRouting,
    providers,
    anyConfigured,
  };
}

export async function hasAnyAiProviderConfigured(workspaceId = 'default'): Promise<boolean> {
  const state = await getPublicAiProvidersState(workspaceId);
  return state.anyConfigured;
}

export async function saveProviderConfig(
  provider: AiProviderId,
  updates: {
    apiKey?: string;
    baseUrl?: string;
    selectedModel?: string;
    customModelId?: string;
    parameters?: AiProviderParameters;
    status?: AiProviderStatus;
    availableModels?: AiModelOption[];
    lastTestedAt?: string;
    lastSuccessAt?: string;
    lastLatencyMs?: number;
    lastError?: string | null;
  },
  workspaceId = 'default'
): Promise<AiProvidersPublicState> {
  const file = await readVaultFile();
  const id = normalizeWorkspaceId(workspaceId);
  const ws = getWorkspaceFromVault(file, id);
  const prev = ws.providers[provider] || {};
  const next: StoredAiProviderEntry = { ...prev };

  if (typeof updates.apiKey === 'string' && updates.apiKey.trim()) {
    const cleanKey = updates.apiKey.trim();
    const encrypted = await encryptProviderSecret(cleanKey);
    next.encryptedApiKey = encrypted.encryptedApiKey;
    next.iv = encrypted.iv;
    next.authTag = encrypted.authTag;
    next.maskedKey = maskSecretKey(cleanKey);
    next.updatedAt = new Date().toISOString();
  }

  if (provider === 'custom' && typeof updates.baseUrl === 'string') {
    const normalized = normalizeBaseUrl(updates.baseUrl);
    next.baseUrl = normalized;
  }

  if (typeof updates.selectedModel === 'string' && updates.selectedModel.trim()) {
    const trimmed = updates.selectedModel.trim();
    if (provider === 'gemini' && isDeprecatedGeminiModel(trimmed)) {
      throw Object.assign(
        new Error(`Model "${trimmed}" is deprecated and not supported. Please select Gemini 3.1 or Gemini 4.`),
        { status: 400 }
      );
    }
    next.selectedModel = trimmed;
  }

  if (typeof updates.customModelId === 'string') {
    next.customModelId = updates.customModelId.trim();
  }

  if (updates.parameters && typeof updates.parameters === 'object') {
    next.parameters = {
      ...DEFAULT_PARAMETERS[provider],
      ...(prev.parameters || {}),
      ...updates.parameters,
    };
  }

  if (Array.isArray(updates.availableModels) && updates.availableModels.length > 0) {
    next.availableModels = sanitizeModelList(provider, updates.availableModels);
  }

  if (updates.status) {
    next.status = updates.status;
  }
  if (updates.lastTestedAt) {
    next.lastTestedAt = updates.lastTestedAt;
  }
  if (updates.lastSuccessAt) {
    next.lastSuccessAt = updates.lastSuccessAt;
  }
  if (typeof updates.lastLatencyMs === 'number') {
    next.lastLatencyMs = updates.lastLatencyMs;
  }
  if (updates.lastError === null) {
    delete next.lastError;
  } else if (typeof updates.lastError === 'string') {
    next.lastError = updates.lastError;
  }

  ws.providers[provider] = next;
  file.workspaces[id] = ws;
  await writeVaultFile(file);
  return getPublicAiProvidersState(id);
}

export async function deleteProviderKey(
  provider: AiProviderId,
  workspaceId = 'default'
): Promise<AiProvidersPublicState> {
  const file = await readVaultFile();
  const id = normalizeWorkspaceId(workspaceId);
  const ws = getWorkspaceFromVault(file, id);
  const prev = ws.providers[provider] || {};

  const next: StoredAiProviderEntry = { ...prev };
  delete next.encryptedApiKey;
  delete next.iv;
  delete next.authTag;
  delete next.maskedKey;
  delete next.updatedAt;
  delete next.lastError;

  const envInfo = getEnvApiKeyForProvider(provider);
  next.status = envInfo.apiKey ? 'connected' : 'not_configured';

  ws.providers[provider] = next;
  file.workspaces[id] = ws;
  await writeVaultFile(file);
  return getPublicAiProvidersState(id);
}

export async function updateAiRouting(
  updates: {
    defaultProvider?: AiProviderId;
    taskRouting?: Partial<Record<AiTaskType, Partial<AiTaskRouteConfig>>>;
  },
  workspaceId = 'default'
): Promise<AiProvidersPublicState> {
  const file = await readVaultFile();
  const id = normalizeWorkspaceId(workspaceId);
  const ws = getWorkspaceFromVault(file, id);

  if (updates.defaultProvider && AI_PROVIDER_IDS.includes(updates.defaultProvider)) {
    ws.defaultProvider = updates.defaultProvider;
  }

  if (updates.taskRouting && typeof updates.taskRouting === 'object') {
    for (const task of ['scriptGeneration', 'scenePlanning', 'imagePrompts'] as AiTaskType[]) {
      const incoming = updates.taskRouting[task];
      if (!incoming) continue;
      const cur = ws.taskRouting[task];
      const nextProvider =
        incoming.provider && AI_PROVIDER_IDS.includes(incoming.provider)
          ? incoming.provider
          : cur.provider;
      const nextModel =
        typeof incoming.model === 'string' && incoming.model.trim()
          ? incoming.model.trim()
          : cur.model || DEFAULT_SELECTED_MODELS[nextProvider];
      ws.taskRouting[task] = {
        useDefault: typeof incoming.useDefault === 'boolean' ? incoming.useDefault : cur.useDefault,
        provider: nextProvider,
        model:
          nextProvider === 'gemini' && isDeprecatedGeminiModel(nextModel)
            ? DEFAULT_SELECTED_MODELS.gemini
            : nextModel,
      };
    }
  }

  file.workspaces[id] = ws;
  await writeVaultFile(file);
  return getPublicAiProvidersState(id);
}

export async function resolveTaskTarget(
  task: AiTaskType,
  workspaceId = 'default',
  override?: { provider?: AiProviderId; model?: string }
): Promise<{
  provider: AiProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;
  parameters: AiProviderParameters;
}> {
  const file = await readVaultFile();
  const ws = getWorkspaceFromVault(file, workspaceId);
  const route = ws.taskRouting[task];

  const chosenProvider: AiProviderId =
    override?.provider && AI_PROVIDER_IDS.includes(override.provider)
      ? override.provider
      : route?.useDefault !== false
        ? ws.defaultProvider
        : route.provider;

  const creds = await resolveProviderCredentials(chosenProvider, workspaceId);

  if (!creds.apiKey) {
    throw Object.assign(
      new Error(
        `${PROVIDER_DISPLAY_NAMES[chosenProvider]} API key is not configured. Open Settings > AI Providers & API Keys to configure your key or switch your active provider.`
      ),
      { status: 400, code: 'AI_PROVIDER_NOT_CONFIGURED', provider: chosenProvider }
    );
  }

  if (chosenProvider === 'custom' && !creds.baseUrl) {
    throw Object.assign(
      new Error(
        'Custom OpenAI-Compatible API Base URL is missing. Open Settings > AI Providers & API Keys to configure the endpoint URL.'
      ),
      { status: 400, code: 'AI_PROVIDER_NOT_CONFIGURED', provider: 'custom' }
    );
  }

  const chosenModel = (
    override?.model?.trim() ||
    (route?.useDefault === false && route.model?.trim() ? route.model.trim() : '') ||
    creds.selectedModel ||
    DEFAULT_SELECTED_MODELS[chosenProvider]
  ).trim();

  if (!chosenModel) {
    throw Object.assign(
      new Error(
        `No AI model selected for ${PROVIDER_DISPLAY_NAMES[chosenProvider]}. Open Settings > AI Providers & API Keys and choose or enter a model ID.`
      ),
      { status: 400, code: 'AI_MODEL_MISSING', provider: chosenProvider }
    );
  }

  return {
    provider: chosenProvider,
    model: chosenModel,
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl,
    parameters: creds.parameters,
  };
}

export async function recordProviderUsage(
  provider: AiProviderId,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  workspaceId = 'default'
): Promise<void> {
  try {
    const file = await readVaultFile();
    const id = normalizeWorkspaceId(workspaceId);
    const ws = getWorkspaceFromVault(file, id);
    const entry = ws.providers[provider] || {};
    const prev = entry.usage || createEmptyUsage();
    const totalAdded = Math.max(0, inputTokens) + Math.max(0, outputTokens);
    const callCost = estimateAiCostUsd(provider, modelId, inputTokens, outputTokens);

    entry.usage = {
      requests: prev.requests + 1,
      inputTokens: prev.inputTokens + Math.max(0, inputTokens),
      outputTokens: prev.outputTokens + Math.max(0, outputTokens),
      totalTokens: prev.totalTokens + totalAdded,
      estimatedCostUsd:
        callCost !== null
          ? Number(((prev.estimatedCostUsd || 0) + callCost).toFixed(6))
          : prev.estimatedCostUsd,
      lastUsedAt: new Date().toISOString(),
    };
    entry.status = 'connected';
    entry.lastSuccessAt = new Date().toISOString();
    delete entry.lastError;

    ws.providers[provider] = entry;
    file.workspaces[id] = ws;
    await writeVaultFile(file);
  } catch {
    // Telemetry write failure is non-fatal
  }
}

export async function recordProviderError(
  provider: AiProviderId,
  status: AiProviderStatus,
  message: string,
  workspaceId = 'default'
): Promise<void> {
  try {
    const file = await readVaultFile();
    const id = normalizeWorkspaceId(workspaceId);
    const ws = getWorkspaceFromVault(file, id);
    const entry = ws.providers[provider] || {};
    entry.status = status;
    entry.lastError = message.slice(0, 400);
    ws.providers[provider] = entry;
    file.workspaces[id] = ws;
    await writeVaultFile(file);
  } catch {
    // Non-fatal
  }
}
