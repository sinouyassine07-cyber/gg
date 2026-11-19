import express from 'express';
import {
  AI_PROVIDER_IDS,
  type AiProviderId,
  type AiProviderParameters,
  type AiTaskRouteConfig,
  type AiTaskType,
} from './aiProviderTypes.ts';
import {
  deleteProviderKey,
  getPublicAiProvidersState,
  normalizeBaseUrl,
  resolveProviderCredentials,
  saveProviderConfig,
  updateAiRouting,
} from './aiProviderStore.ts';
import { fetchLiveModelsForProvider, testProviderConnection } from './aiClient.ts';

function isValidProvider(raw: string): raw is AiProviderId {
  return AI_PROVIDER_IDS.includes(raw as AiProviderId);
}

export function createAiProvidersRouter(safeClientStatus: (status: number) => number): express.Router {
  const router = express.Router();

  // Get full sanitized AI provider state (never includes plaintext keys)
  router.get('/', async (_req, res) => {
    try {
      const state = await getPublicAiProvidersState();
      res.json(state);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to load AI provider settings.',
      });
    }
  });

  // Update default AI provider & per-task routing
  router.put('/routing', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        defaultProvider?: AiProviderId;
        taskRouting?: Partial<Record<AiTaskType, Partial<AiTaskRouteConfig>>>;
      };
      const state = await updateAiRouting({
        defaultProvider: body.defaultProvider,
        taskRouting: body.taskRouting,
      });
      res.json({ state });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? safeClientStatus(err.status)
          : 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Failed to update AI routing settings.',
      });
    }
  });

  // Save provider configuration (API key, baseUrl, selectedModel, customModelId, parameters)
  router.post('/:provider/config', async (req, res) => {
    const provider = req.params.provider;
    if (!isValidProvider(provider)) {
      res.status(404).json({ error: `Unsupported AI provider "${provider}".` });
      return;
    }

    try {
      const body = (req.body || {}) as {
        apiKey?: string;
        baseUrl?: string;
        selectedModel?: string;
        customModelId?: string;
        parameters?: AiProviderParameters;
        skipLiveTest?: boolean;
      };

      const candidateKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      const candidateBaseUrl =
        provider === 'custom' && typeof body.baseUrl === 'string' ? body.baseUrl.trim() : undefined;

      if (provider === 'custom' && candidateBaseUrl !== undefined && candidateBaseUrl !== '') {
        if (!normalizeBaseUrl(candidateBaseUrl)) {
          res.status(400).json({
            error: 'Custom Base URL must be a valid http:// or https:// URL (e.g. https://openrouter.ai/api/v1).',
          });
          return;
        }
      }

      // If a new API key is provided, run a real live verification first so invalid keys are rejected clearly
      if (candidateKey && !body.skipLiveTest) {
        const test = await testProviderConnection({
          provider,
          apiKey: candidateKey,
          baseUrl: candidateBaseUrl,
          customModelId: body.customModelId || body.selectedModel,
        });

        if (!test.ok) {
          const clientStatus = test.status === 'invalid_key' ? 401 : 400;
          res.status(clientStatus).json({
            error: test.error || 'Failed to verify API key with provider.',
            status: test.status,
            latencyMs: test.latencyMs,
          });
          return;
        }

        const now = new Date().toISOString();
        const chosenModel =
          body.selectedModel?.trim() ||
          body.customModelId?.trim() ||
          test.models[0]?.id ||
          undefined;

        const state = await saveProviderConfig(provider, {
          apiKey: candidateKey,
          baseUrl: candidateBaseUrl,
          selectedModel: chosenModel,
          customModelId: body.customModelId,
          parameters: body.parameters,
          availableModels: test.models.length > 0 ? test.models : undefined,
          status: 'connected',
          lastTestedAt: now,
          lastSuccessAt: now,
          lastLatencyMs: test.latencyMs,
          lastError: null,
        });

        res.json({
          state,
          latencyMs: test.latencyMs,
          modelsCount: test.models.length,
        });
        return;
      }

      const state = await saveProviderConfig(provider, {
        apiKey: candidateKey || undefined,
        baseUrl: candidateBaseUrl,
        selectedModel: body.selectedModel,
        customModelId: body.customModelId,
        parameters: body.parameters,
      });

      res.json({ state });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? safeClientStatus(err.status)
          : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Unable to save provider configuration.',
      });
    }
  });

  // Test connection against live provider API
  router.post('/:provider/test', async (req, res) => {
    const provider = req.params.provider;
    if (!isValidProvider(provider)) {
      res.status(404).json({ error: `Unsupported AI provider "${provider}".` });
      return;
    }

    const body = (req.body || {}) as {
      apiKey?: string;
      baseUrl?: string;
      customModelId?: string;
    };

    const candidateKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const test = await testProviderConnection({
      provider,
      apiKey: candidateKey || undefined,
      baseUrl: body.baseUrl,
      customModelId: body.customModelId,
    });

    const now = new Date().toISOString();

    // Update persisted status metadata when testing the currently configured credential
    let state = await getPublicAiProvidersState();
    if (!candidateKey) {
      state = await saveProviderConfig(provider, {
        status: test.status,
        lastTestedAt: now,
        lastSuccessAt: test.ok ? now : undefined,
        lastLatencyMs: test.latencyMs,
        lastError: test.ok ? null : test.error || 'Connection test failed.',
        availableModels: test.ok && test.models.length > 0 ? test.models : undefined,
      });
    }

    if (!test.ok) {
      const httpStatus = test.status === 'invalid_key' ? 401 : 400;
      res.status(httpStatus).json({
        ok: false,
        status: test.status,
        latencyMs: test.latencyMs,
        error: test.error || 'Connection test failed.',
        state,
      });
      return;
    }

    res.json({
      ok: true,
      status: test.status,
      latencyMs: test.latencyMs,
      models: test.models,
      state,
    });
  });

  // Refresh live available models from provider
  router.post('/:provider/models', async (req, res) => {
    const provider = req.params.provider;
    if (!isValidProvider(provider)) {
      res.status(404).json({ error: `Unsupported AI provider "${provider}".` });
      return;
    }

    try {
      const creds = await resolveProviderCredentials(provider);
      const effectiveKey =
        typeof req.body?.apiKey === 'string' && req.body.apiKey.trim()
          ? req.body.apiKey.trim()
          : creds.apiKey;
      const effectiveBaseUrl =
        provider === 'custom' && typeof req.body?.baseUrl === 'string' && req.body.baseUrl.trim()
          ? normalizeBaseUrl(req.body.baseUrl)
          : creds.baseUrl;

      if (!effectiveKey) {
        res.status(400).json({ error: 'Configure an API key first to fetch available models.' });
        return;
      }

      const models = await fetchLiveModelsForProvider({
        provider,
        apiKey: effectiveKey,
        baseUrl: effectiveBaseUrl,
      });

      const now = new Date().toISOString();
      const state = await saveProviderConfig(provider, {
        availableModels: models,
        status: 'connected',
        lastTestedAt: now,
        lastSuccessAt: now,
        lastError: null,
      });

      res.json({ models, state });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? safeClientStatus(err.status)
          : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Unable to refresh models from provider.',
      });
    }
  });

  // Delete user-saved encrypted API key
  router.delete('/:provider/key', async (req, res) => {
    const provider = req.params.provider;
    if (!isValidProvider(provider)) {
      res.status(404).json({ error: `Unsupported AI provider "${provider}".` });
      return;
    }

    try {
      const state = await deleteProviderKey(provider);
      res.json({ state });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to remove saved API key.',
      });
    }
  });

  return router;
}
