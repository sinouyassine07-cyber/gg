import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { api } from '../lib/api';
import type {
  AiProviderId,
  AiProviderParameters,
  AiProvidersPublicState,
  AiProviderStatus,
  AiProviderSummary,
  AiTaskRouteConfig,
  AiTaskType,
  GeminiThinkingLevel,
} from '../types';

interface AiProvidersSettingsSectionProps {
  t: TranslationDictionary;
  onProvidersChanged?: (anyConfigured: boolean) => void;
}

const PROVIDER_ORDER: AiProviderId[] = ['gemini', 'openai', 'anthropic', 'custom'];

function isGemini4Id(modelId: string): boolean {
  return /^gemini-4-(hydrogen|neon|argon|carbon)\b/i.test(modelId.trim());
}

function isOpenAiReasoningId(modelId: string): boolean {
  const lower = modelId.trim().toLowerCase();
  return /^(o1|o3|o4|o5)\b/.test(lower) || lower.startsWith('gpt-5');
}

interface CardDraftState {
  apiKeyInput: string;
  showKey: boolean;
  baseUrl: string;
  selectedModel: string;
  customModelId: string;
  parameters: AiProviderParameters;
  confirmDelete: boolean;
}

function getFallbackModelsForProvider(providerId: AiProviderId): Array<{ id: string; label: string }> {
  switch (providerId) {
    case 'gemini':
      return [
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen' },
        { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      ];
    case 'openai':
      return [
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { id: 'o1', label: 'OpenAI o1' },
        { id: 'o3-mini', label: 'OpenAI o3-mini' },
      ];
    case 'anthropic':
      return [
        { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      ];
    case 'custom':
      return [
        { id: 'custom-model', label: 'Custom Model' },
      ];
  }
}

function buildDraftFromSummary(p: AiProviderSummary): CardDraftState {
  return {
    apiKeyInput: '',
    showKey: false,
    baseUrl: p.baseUrl || '',
    selectedModel: p.selectedModel || p.availableModels[0]?.id || '',
    customModelId: p.customModelId || '',
    parameters: { ...p.parameters },
    confirmDelete: false,
  };
}

const DEFAULT_PUBLIC_STATE: AiProvidersPublicState = {
  defaultProvider: 'gemini',
  anyConfigured: false,
  taskRouting: {
    scriptGeneration: { useDefault: true, provider: 'gemini', model: 'gemini-2.5-flash' },
    scenePlanning: { useDefault: true, provider: 'gemini', model: 'gemini-2.5-flash' },
    imagePrompts: { useDefault: true, provider: 'gemini', model: 'gemini-2.5-flash' },
  },
  providers: {
    gemini: {
      id: 'gemini',
      name: 'Google Gemini API',
      status: 'not_configured',
      source: 'none',
      hasSavedKey: false,
      hasEffectiveKey: false,
      maskedKey: null,
      baseUrl: '',
      customModelId: '',
      lastSuccessAt: null,
      updatedAt: null,
      selectedModel: 'gemini-2.5-flash',
      availableModels: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', supportsTemperature: true, supportsMaxTokens: true }],
      parameters: { temperature: 0.7, thinkingLevel: 'LOW' },
      lastTestedAt: null,
      lastLatencyMs: null,
      lastError: null,
      usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: null },
    },
    openai: {
      id: 'openai',
      name: 'OpenAI API',
      status: 'not_configured',
      source: 'none',
      hasSavedKey: false,
      hasEffectiveKey: false,
      maskedKey: null,
      baseUrl: '',
      customModelId: '',
      lastSuccessAt: null,
      updatedAt: null,
      selectedModel: 'gpt-4o',
      availableModels: [{ id: 'gpt-4o', label: 'GPT-4o', supportsTemperature: true, supportsMaxTokens: true }],
      parameters: { temperature: 0.7 },
      lastTestedAt: null,
      lastLatencyMs: null,
      lastError: null,
      usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: null },
    },
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic Claude API',
      status: 'not_configured',
      source: 'none',
      hasSavedKey: false,
      hasEffectiveKey: false,
      maskedKey: null,
      baseUrl: '',
      customModelId: '',
      lastSuccessAt: null,
      updatedAt: null,
      selectedModel: 'claude-3-5-sonnet-20241022',
      availableModels: [{ id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', supportsTemperature: true, supportsMaxTokens: true }],
      parameters: { temperature: 0.7 },
      lastTestedAt: null,
      lastLatencyMs: null,
      lastError: null,
      usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: null },
    },
    custom: {
      id: 'custom',
      name: 'Custom OpenAI-Compatible API',
      status: 'not_configured',
      source: 'none',
      hasSavedKey: false,
      hasEffectiveKey: false,
      maskedKey: null,
      baseUrl: '',
      selectedModel: 'custom-model',
      customModelId: '',
      lastSuccessAt: null,
      updatedAt: null,
      availableModels: [],
      parameters: { temperature: 0.7 },
      lastTestedAt: null,
      lastLatencyMs: null,
      lastError: null,
      usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: null },
    },
  },
};

export function AiProvidersSettingsSection({
  t,
  onProvidersChanged,
}: AiProvidersSettingsSectionProps) {
  const [state, setState] = useState<AiProvidersPublicState>(DEFAULT_PUBLIC_STATE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [defaultProviderDraft, setDefaultProviderDraft] = useState<AiProviderId>('gemini');
  const [routingDraft, setRoutingDraft] = useState<Record<AiTaskType, AiTaskRouteConfig>>(
    DEFAULT_PUBLIC_STATE.taskRouting
  );
  const [savingRouting, setSavingRouting] = useState(false);
  const [routingNotice, setRoutingNotice] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<Record<AiProviderId, CardDraftState>>({
    gemini: buildDraftFromSummary(DEFAULT_PUBLIC_STATE.providers.gemini),
    openai: buildDraftFromSummary(DEFAULT_PUBLIC_STATE.providers.openai),
    anthropic: buildDraftFromSummary(DEFAULT_PUBLIC_STATE.providers.anthropic),
    custom: buildDraftFromSummary(DEFAULT_PUBLIC_STATE.providers.custom),
  });
  const [busyCard, setBusyCard] = useState<Record<string, boolean>>({});
  const [cardFeedback, setCardFeedback] = useState<
    Partial<Record<AiProviderId, { type: 'success' | 'error'; message: string }>>
  >({});

  const syncFromServerState = useCallback(
    (next: AiProvidersPublicState, isInitial = false) => {
      setState(next);
      if (isInitial || !defaultProviderDraft) {
        setDefaultProviderDraft(next.defaultProvider);
      }
      if (isInitial || !routingDraft) {
        setRoutingDraft(next.taskRouting);
      }
      setDrafts((prev) => {
        const buildPreserved = (pid: AiProviderId, sum: AiProviderSummary) => {
          const fresh = buildDraftFromSummary(sum);
          const existing = prev?.[pid];
          return {
            ...fresh,
            apiKeyInput: existing?.apiKeyInput || '',
            showKey: existing?.showKey || false,
            baseUrl: existing?.baseUrl !== undefined && existing?.baseUrl !== '' ? existing.baseUrl : fresh.baseUrl,
            selectedModel: existing?.selectedModel || fresh.selectedModel,
            customModelId: existing?.customModelId !== undefined && existing?.customModelId !== '' ? existing.customModelId : fresh.customModelId,
            parameters: existing?.parameters ? { ...existing.parameters } : fresh.parameters,
            confirmDelete: existing?.confirmDelete || false,
          };
        };
        return {
          gemini: buildPreserved('gemini', next.providers.gemini),
          openai: buildPreserved('openai', next.providers.openai),
          anthropic: buildPreserved('anthropic', next.providers.anthropic),
          custom: buildPreserved('custom', next.providers.custom),
        };
      });
      onProvidersChanged?.(next.anyConfigured);
    },
    [defaultProviderDraft, routingDraft, onProvidersChanged]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError(null);
      try {
        const res = await api.getAiProviders();
        if (!cancelled) {
          syncFromServerState(res, true);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load AI providers.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [syncFromServerState]);

  const setDraftField = (provider: AiProviderId, patch: Partial<CardDraftState>) => {
    setDrafts((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [provider]: {
          ...prev[provider],
          ...patch,
        },
      };
    });
  };

  const handleSaveRouting = async () => {
    if (!routingDraft) return;
    setSavingRouting(true);
    setRoutingNotice(null);
    setLoadError(null);
    try {
      const res = await api.updateAiRouting({
        defaultProvider: defaultProviderDraft,
        taskRouting: routingDraft,
      });
      syncFromServerState(res.state);
      setRoutingNotice(t.aiProviders.routingSaved);
      setTimeout(() => setRoutingNotice(null), 3000);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to save routing configuration.');
    } finally {
      setSavingRouting(false);
    }
  };

  const handleSaveProvider = async (provider: AiProviderId) => {
    if (!drafts) return;
    const draft = drafts[provider];
    setBusyCard((b) => ({ ...b, [`${provider}:save`]: true }));
    setCardFeedback((f) => ({ ...f, [provider]: undefined }));

    try {
      const res = await api.saveAiProviderConfig(provider, {
        apiKey: draft.apiKeyInput.trim() || undefined,
        baseUrl: provider === 'custom' ? draft.baseUrl.trim() : undefined,
        selectedModel: draft.selectedModel.trim() || undefined,
        customModelId: draft.customModelId.trim(),
        parameters: draft.parameters,
      });
      setDraftField(provider, { apiKeyInput: '', showKey: false, confirmDelete: false });
      syncFromServerState(res.state);
      const latency = res.latencyMs ? ` (${res.latencyMs} ms)` : '';
      setCardFeedback((f) => ({
        ...f,
        [provider]: { type: 'success', message: `${t.aiProviders.saveSuccess}${latency}` },
      }));
    } catch (err) {
      setCardFeedback((f) => ({
        ...f,
        [provider]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Unable to save provider configuration.',
        },
      }));
    } finally {
      setBusyCard((b) => ({ ...b, [`${provider}:save`]: false }));
    }
  };

  const handleTestProvider = async (provider: AiProviderId) => {
    if (!drafts) return;
    const draft = drafts[provider];
    setBusyCard((b) => ({ ...b, [`${provider}:test`]: true }));
    setCardFeedback((f) => ({ ...f, [provider]: undefined }));

    try {
      const res = await api.testAiProvider(provider, {
        apiKey: draft.apiKeyInput.trim() || undefined,
        baseUrl: provider === 'custom' ? draft.baseUrl.trim() || undefined : undefined,
        customModelId: draft.customModelId.trim() || draft.selectedModel.trim() || undefined,
      });
      syncFromServerState(res.state);
      setCardFeedback((f) => ({
        ...f,
        [provider]: {
          type: 'success',
          message: `${t.aiProviders.testSuccess} (${res.latencyMs} ms · ${res.models.length} models)`,
        },
      }));
    } catch (err) {
      try {
        const latest = await api.getAiProviders();
        syncFromServerState(latest);
      } catch {
        // Ignore refresh error
      }
      setCardFeedback((f) => ({
        ...f,
        [provider]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Connection test failed.',
        },
      }));
    } finally {
      setBusyCard((b) => ({ ...b, [`${provider}:test`]: false }));
    }
  };

  const handleRefreshModels = async (provider: AiProviderId) => {
    if (!drafts) return;
    const draft = drafts[provider];
    setBusyCard((b) => ({ ...b, [`${provider}:models`]: true }));
    setCardFeedback((f) => ({ ...f, [provider]: undefined }));
    try {
      const res = await api.refreshAiProviderModels(provider, {
        apiKey: draft.apiKeyInput.trim() || undefined,
        baseUrl: provider === 'custom' ? draft.baseUrl.trim() || undefined : undefined,
      });
      syncFromServerState(res.state);
      setCardFeedback((f) => ({
        ...f,
        [provider]: {
          type: 'success',
          message: `${res.models.length} supported models loaded.`,
        },
      }));
    } catch (err) {
      setCardFeedback((f) => ({
        ...f,
        [provider]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Unable to fetch models from provider.',
        },
      }));
    } finally {
      setBusyCard((b) => ({ ...b, [`${provider}:models`]: false }));
    }
  };

  const handleDeleteKey = async (provider: AiProviderId) => {
    setBusyCard((b) => ({ ...b, [`${provider}:delete`]: true }));
    setCardFeedback((f) => ({ ...f, [provider]: undefined }));
    try {
      const res = await api.deleteAiProviderKey(provider);
      setDraftField(provider, { confirmDelete: false, apiKeyInput: '' });
      syncFromServerState(res.state);
      setCardFeedback((f) => ({
        ...f,
        [provider]: { type: 'success', message: t.aiProviders.deleteSuccess },
      }));
    } catch (err) {
      setCardFeedback((f) => ({
        ...f,
        [provider]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Unable to delete saved key.',
        },
      }));
    } finally {
      setBusyCard((b) => ({ ...b, [`${provider}:delete`]: false }));
    }
  };

  const renderStatusIndicator = (status: AiProviderStatus) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{t.aiProviders.statusConnected}</span>
          </span>
        );
      case 'invalid_key':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-300">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{t.aiProviders.statusInvalidKey}</span>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{t.aiProviders.statusError}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
            <span>{t.aiProviders.statusNotConfigured}</span>
          </span>
        );
    }
  };

  return (
    <section className="space-y-5">
      {/* Header & Security Guarantee */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
              <h2 className="text-base font-semibold text-white">{t.aiProviders.sectionTitle}</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              {t.aiProviders.sectionSubtitle}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
          <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-[#070910] p-3">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>{t.aiProviders.securityNote}</span>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-[#070910] p-3">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{t.aiProviders.fishNote}</span>
          </div>
        </div>

        {loadError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Default Provider & Per-Task Routing */}
        {state && routingDraft && (
          <div className="space-y-4 pt-2 border-t border-white/[0.08]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label
                  htmlFor="default-ai-provider"
                  className="block text-xs font-semibold text-slate-200"
                >
                  {t.aiProviders.defaultProviderLabel}
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {t.aiProviders.defaultProviderDesc}
                </p>
              </div>

              <select
                id="default-ai-provider"
                value={defaultProviderDraft}
                onChange={(e) => setDefaultProviderDraft(e.target.value as AiProviderId)}
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400"
              >
                {PROVIDER_ORDER.map((id) => {
                  const p = state.providers[id];
                  return (
                    <option key={id} value={id}>
                      {p.name}
                      {p.hasEffectiveKey ? ` (${p.selectedModel || 'Ready'})` : ' — Not Configured'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2.5 pt-2">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  {t.aiProviders.routingTitle}
                </div>
                <div className="text-[11px] text-slate-400">{t.aiProviders.routingDesc}</div>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {(
                  [
                    ['scriptGeneration', t.aiProviders.taskScript],
                    ['scenePlanning', t.aiProviders.taskScenes],
                    ['imagePrompts', t.aiProviders.taskPrompts],
                  ] as const
                ).map(([taskKey, label]) => {
                  const route = routingDraft[taskKey];
                  const targetProvider = state.providers[route.provider];
                  const models = targetProvider?.availableModels || [];

                  return (
                    <div
                      key={taskKey}
                      className="rounded-lg border border-white/[0.06] bg-[#070910] p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                    >
                      <span className="text-xs font-medium text-slate-200 min-w-[170px]">
                        {label}
                      </span>

                      <div className="flex flex-wrap items-center gap-2 flex-1 lg:justify-end">
                        <select
                          value={route.useDefault ? '__default__' : route.provider}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__default__') {
                              setRoutingDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      [taskKey]: { ...prev[taskKey], useDefault: true },
                                    }
                                  : prev
                              );
                            } else {
                              const pid = val as AiProviderId;
                              const firstModel =
                                state.providers[pid].selectedModel ||
                                state.providers[pid].availableModels[0]?.id ||
                                '';
                              setRoutingDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      [taskKey]: {
                                        useDefault: false,
                                        provider: pid,
                                        model: firstModel,
                                      },
                                    }
                                  : prev
                              );
                            }
                          }}
                          className="rounded-lg border border-white/10 bg-[#0c101b] px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
                        >
                          <option value="__default__">
                            {t.aiProviders.followDefault} ({state.providers[defaultProviderDraft].name})
                          </option>
                          {PROVIDER_ORDER.map((id) => (
                            <option key={id} value={id}>
                              {state.providers[id].name}
                            </option>
                          ))}
                        </select>

                        {!route.useDefault && (
                          <select
                            value={route.model}
                            onChange={(e) =>
                              setRoutingDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      [taskKey]: { ...prev[taskKey], model: e.target.value },
                                    }
                                  : prev
                              )
                            }
                            className="rounded-lg border border-white/10 bg-[#0c101b] px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-400 max-w-[260px]"
                          >
                            {models.length === 0 && route.model && (
                              <option value={route.model}>{route.model}</option>
                            )}
                            {models.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                {routingNotice && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                    <Check className="w-3.5 h-3.5" />
                    <span>{routingNotice}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveRouting}
                  disabled={savingRouting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                >
                  {savingRouting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t.aiProviders.saveRouting}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Individual Provider Cards */}
      {state && drafts && (
        <div className="grid grid-cols-1 gap-4">
          {PROVIDER_ORDER.map((providerId) => {
            const p = state.providers[providerId];
            const draft = drafts[providerId];
            const effectiveModelId = draft.customModelId.trim() || draft.selectedModel.trim();
            const isGemini4 = providerId === 'gemini' && isGemini4Id(effectiveModelId);
            const hideTemp =
              isGemini4 || (providerId === 'openai' && isOpenAiReasoningId(effectiveModelId));

            const isSaving = Boolean(busyCard[`${providerId}:save`]);
            const isTesting = Boolean(busyCard[`${providerId}:test`]);
            const isRefreshingModels = Boolean(busyCard[`${providerId}:models`]);
            const isDeleting = Boolean(busyCard[`${providerId}:delete`]);
            const feedback = cardFeedback[providerId];

            const sourceText =
              p.source === 'user'
                ? t.aiProviders.sourceUser
                : p.source === 'env'
                  ? t.aiProviders.sourceEnv
                  : t.aiProviders.sourceNone;

            return (
              <article
                key={providerId}
                className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4"
              >
                {/* Card Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                      {state.defaultProvider === providerId && (
                        <span className="text-[11px] font-semibold text-indigo-300 border border-indigo-400/35 bg-indigo-500/10 px-2 py-0.5 rounded-md">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{sourceText}</span>
                      {p.maskedKey && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-200 tabular-nums">{p.maskedKey}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {renderStatusIndicator(p.status)}
                  </div>
                </div>

                {/* Custom Base URL */}
                {providerId === 'custom' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`ai-baseurl-${providerId}`}
                      className="block text-xs font-medium text-slate-300"
                    >
                      {t.aiProviders.baseUrlLabel}
                    </label>
                    <input
                      id={`ai-baseurl-${providerId}`}
                      type="url"
                      dir="ltr"
                      value={draft.baseUrl}
                      onChange={(e) => setDraftField(providerId, { baseUrl: e.target.value })}
                      placeholder={t.aiProviders.baseUrlPlaceholder}
                      className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                )}

                {/* API Key & Model Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`ai-key-${providerId}`}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{t.aiProviders.apiKeyLabel}</span>
                    </label>
                    <div className="relative">
                      <input
                        id={`ai-key-${providerId}`}
                        type={draft.showKey ? 'text' : 'password'}
                        value={draft.apiKeyInput}
                        onChange={(e) => setDraftField(providerId, { apiKeyInput: e.target.value })}
                        placeholder={
                          p.hasSavedKey
                            ? t.aiProviders.apiKeyPlaceholderReplace
                            : t.aiProviders.apiKeyPlaceholder
                        }
                        autoComplete="new-password"
                        spellCheck={false}
                        dir="ltr"
                        className="w-full rounded-lg border border-white/10 bg-[#070910] ps-3 pe-10 py-2 text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                      />
                      <button
                        type="button"
                        onClick={() => setDraftField(providerId, { showKey: !draft.showKey })}
                        aria-label={draft.showKey ? 'Hide API key' : 'Show API key'}
                        className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white"
                      >
                        {draft.showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`ai-model-${providerId}`}
                        className="text-xs font-medium text-slate-300"
                      >
                        {t.aiProviders.modelLabel}
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRefreshModels(providerId)}
                        disabled={isRefreshingModels || (!p.hasEffectiveKey && !draft.apiKeyInput.trim())}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 hover:text-indigo-200 disabled:opacity-45"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isRefreshingModels ? 'animate-spin' : ''}`}
                        />
                        <span>{t.aiProviders.refreshModels}</span>
                      </button>
                    </div>

                    <select
                      id={`ai-model-${providerId}`}
                      value={draft.selectedModel}
                      onChange={(e) =>
                        setDraftField(providerId, { selectedModel: e.target.value })
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
                    >
                      {p.availableModels.length === 0 && (
                        <option value="">
                          {draft.customModelId
                            ? `Custom: ${draft.customModelId}`
                            : 'Fetch models or enter Custom Model ID below'}
                        </option>
                      )}
                      {p.availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                      {draft.selectedModel &&
                        p.availableModels.length > 0 &&
                        !p.availableModels.some((m) => m.id === draft.selectedModel) && (
                          <option value={draft.selectedModel}>{draft.selectedModel}</option>
                        )}
                    </select>
                  </div>
                </div>

                {/* Parameters & Custom Model Override */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  {providerId === 'custom' && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`ai-custom-model-${providerId}`}
                        className="block text-xs font-medium text-slate-400"
                      >
                        {t.aiProviders.customModelLabel}
                      </label>
                      <input
                        id={`ai-custom-model-${providerId}`}
                        type="text"
                        dir="ltr"
                        value={draft.customModelId}
                        onChange={(e) =>
                          setDraftField(providerId, { customModelId: e.target.value })
                        }
                        placeholder={t.aiProviders.customModelPlaceholder}
                        className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-1.5 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  )}

                  {providerId === 'gemini' && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`ai-thinking-${providerId}`}
                        className="block text-xs font-medium text-slate-400"
                      >
                        {t.aiProviders.thinkingLevelLabel}
                      </label>
                      <select
                        id={`ai-thinking-${providerId}`}
                        value={draft.parameters.thinkingLevel || 'LOW'}
                        onChange={(e) =>
                          setDraftField(providerId, {
                            parameters: {
                              ...draft.parameters,
                              thinkingLevel: e.target.value as GeminiThinkingLevel,
                            },
                          })
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
                      >
                        <option value="LOW">LOW (Fast & Economical)</option>
                        <option value="MEDIUM">MEDIUM (Balanced)</option>
                        <option value="HIGH">HIGH (Deep Reasoning)</option>
                      </select>
                      {isGemini4 && (
                        <p className="text-[11px] text-slate-500">{t.aiProviders.gemini4Note}</p>
                      )}
                    </div>
                  )}

                  {!hideTemp && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`ai-temp-${providerId}`}
                        className="block text-xs font-medium text-slate-400"
                      >
                        {t.aiProviders.temperatureLabel} (
                        {(draft.parameters.temperature ?? 0.7).toFixed(2)})
                      </label>
                      <input
                        id={`ai-temp-${providerId}`}
                        type="range"
                        min={0}
                        max={providerId === 'anthropic' ? 1 : 1.5}
                        step={0.05}
                        dir="ltr"
                        value={draft.parameters.temperature ?? 0.7}
                        onChange={(e) =>
                          setDraftField(providerId, {
                            parameters: {
                              ...draft.parameters,
                              temperature: Number(e.target.value),
                            },
                          })
                        }
                        className="studio-range w-full mt-1.5"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor={`ai-maxtok-${providerId}`}
                      className="block text-xs font-medium text-slate-400"
                    >
                      {t.aiProviders.maxTokensLabel}
                    </label>
                    <input
                      id={`ai-maxtok-${providerId}`}
                      type="number"
                      min={256}
                      max={65536}
                      step={256}
                      dir="ltr"
                      value={draft.parameters.maxTokens ?? ''}
                      placeholder="Auto"
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        setDraftField(providerId, {
                          parameters: {
                            ...draft.parameters,
                            maxTokens: raw ? Math.max(256, Number(raw)) : undefined,
                          },
                        });
                      }}
                      className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-1.5 text-xs font-mono tabular-nums text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>

                {/* Inline Error or Feedback */}
                {(feedback || p.lastError) && (
                  <div
                    role="status"
                    className={`rounded-lg border px-3.5 py-2.5 text-xs flex items-start gap-2 ${
                      feedback?.type === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    }`}
                  >
                    {feedback?.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{feedback?.message || p.lastError}</span>
                  </div>
                )}

                {/* Usage Telemetry + Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 font-mono tabular-nums">
                    <span>
                      {t.aiProviders.lastTestLabel}:{' '}
                      <strong className="text-slate-200 font-medium">
                        {p.lastTestedAt
                          ? `${new Date(p.lastTestedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}${p.lastLatencyMs !== null ? ` (${p.lastLatencyMs} ms)` : ''}`
                          : t.aiProviders.neverTested}
                      </strong>
                    </span>
                    <span>
                      {t.aiProviders.requestsLabel}:{' '}
                      <strong className="text-slate-200 font-medium">{p.usage.requests}</strong>
                    </span>
                    <span>
                      {t.aiProviders.tokensUsedLabel}:{' '}
                      <strong className="text-slate-200 font-medium">
                        {p.usage.totalTokens.toLocaleString()}
                      </strong>
                    </span>
                    <span>
                      {t.aiProviders.estCostLabel}:{' '}
                      <strong className="text-slate-200 font-medium">
                        {p.usage.estimatedCostUsd !== null
                          ? `$${p.usage.estimatedCostUsd.toFixed(4)}`
                          : '—'}
                      </strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {p.hasSavedKey &&
                      (!draft.confirmDelete ? (
                        <button
                          type="button"
                          onClick={() => setDraftField(providerId, { confirmDelete: true })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-medium text-rose-200 transition-colors whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t.aiProviders.deleteKey}</span>
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDeleteKey(providerId)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white whitespace-nowrap"
                          >
                            {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                            <span>{t.aiProviders.confirmDeleteKey}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraftField(providerId, { confirmDelete: false })}
                            className="px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white whitespace-nowrap"
                          >
                            {t.aiProviders.cancelDelete}
                          </button>
                        </div>
                      ))}

                    <button
                      type="button"
                      onClick={() => handleTestProvider(providerId)}
                      disabled={isTesting || (!p.hasEffectiveKey && !draft.apiKeyInput.trim())}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 text-xs font-semibold text-slate-100 transition-colors whitespace-nowrap"
                    >
                      {isTesting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>
                        {isTesting ? t.aiProviders.testingConnection : t.aiProviders.testConnection}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveProvider(providerId)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                    >
                      {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>
                        {isSaving ? t.aiProviders.savingConfig : t.aiProviders.saveConfig}
                      </span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
