import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  composeSegmentText,
  splitTextIntoSegments,
  stitchAudioSegments,
  type AudioFormat,
} from './server/ttsEngine.ts';
import {
  buildTranscriptFromSegments,
  extractTranscriptForRecord,
  measureAudioFileDurationMs,
  measureBufferDurationMs,
  type TranscriptCue,
  type TranscriptExtractionMode,
  type TranscriptSource,
} from './server/transcriptEngine.ts';
import { createAiProvidersRouter } from './server/aiProviderRoutes.ts';
import { hasAnyAiProviderConfigured, resolveProviderCredentials } from './server/aiProviderStore.ts';
import { createYouTubeRouter } from './server/ytRoutes.ts';
import { resetStuckRenderJobsOnStartup } from './server/ytStorage.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const FISH_API_BASE = 'https://api.fish.audio';
const DATA_DIR = path.resolve(process.cwd(), '.data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SECRET_FILE = path.join(DATA_DIR, '.secret');

type FishAudioModel = 's2.1-pro' | 's2.1-pro-free' | 's2-pro' | 's1';
type LatencyMode = 'normal' | 'balanced';

interface StoredConfig {
  encryptedApiKey?: string;
  iv?: string;
  authTag?: string;
  maskedKey?: string;
  updatedAt?: string;
  preferences: {
    uiLanguage: 'en' | 'ar';
    defaultParams: {
      model: FishAudioModel;
      format: AudioFormat;
      mp3_bitrate: 64 | 128 | 192;
      opus_bitrate: 24 | 32 | 48 | 64 | -1000;
      sample_rate: number | null;
      speed: number;
      volume: number;
      temperature: number;
      top_p: number;
      repetition_penalty: number;
      chunk_length: number;
      normalize: boolean;
      latency: LatencyMode;
      continuous_narration: boolean;
      segment_pause_ms: 0 | 150 | 350;
      parallel_concurrency: 1 | 2 | 3;
    };
    selectedVoice: Record<string, unknown> | null;
  };
}

interface GenerationRecord {
  id: string;
  text: string;
  voiceId: string | null;
  voiceName: string;
  voiceAuthor?: string;
  model: FishAudioModel;
  format: AudioFormat;
  sampleRate: number | null;
  bitrate: number | null;
  speed: number;
  volume: number;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  latency: LatencyMode;
  normalize: boolean;
  chunkLength: number;
  segmentCount?: number;
  durationSeconds?: number;
  transcript?: TranscriptCue[];
  transcriptSource?: TranscriptSource;
  fileSizeBytes: number;
  createdAt: string;
  audioUrl: string;
  downloadUrl: string;
}

interface StoredDatabase {
  favorites: Record<string, unknown>[];
  history: GenerationRecord[];
}

const DEFAULT_PREFERENCES: StoredConfig['preferences'] = {
  uiLanguage: 'en',
  defaultParams: {
    model: 's2.1-pro-free',
    format: 'mp3',
    mp3_bitrate: 128,
    opus_bitrate: 32,
    sample_rate: 44100,
    speed: 1.0,
    volume: 0.0,
    temperature: 0.7,
    top_p: 0.7,
    repetition_penalty: 1.2,
    chunk_length: 200,
    normalize: true,
    latency: 'balanced',
    continuous_narration: true,
    segment_pause_ms: 150,
    parallel_concurrency: 3,
  },
  selectedVoice: null,
};

async function ensureDataDirs(): Promise<void> {
  await fsp.mkdir(AUDIO_DIR, { recursive: true });
}

async function getEncryptionKey(): Promise<Buffer> {
  await ensureDataDirs();
  try {
    const existing = await fsp.readFile(SECRET_FILE, 'utf8');
    const buf = Buffer.from(existing.trim(), 'hex');
    if (buf.length === 32) return buf;
  } catch {
    // Generate fresh secret key
  }
  const secret = crypto.randomBytes(32);
  await fsp.writeFile(SECRET_FILE, secret.toString('hex'), { mode: 0o600 });
  return secret;
}

async function encryptSecret(plaintext: string): Promise<{ encryptedApiKey: string; iv: string; authTag: string }> {
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

async function decryptSecret(encryptedApiKey: string, ivB64: string, authTagB64: string): Promise<string | null> {
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

async function readConfig(): Promise<StoredConfig> {
  await ensureDataDirs();
  try {
    const raw = await fsp.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredConfig>;
    return {
      encryptedApiKey: parsed.encryptedApiKey,
      iv: parsed.iv,
      authTag: parsed.authTag,
      maskedKey: parsed.maskedKey,
      updatedAt: parsed.updatedAt,
      preferences: {
        uiLanguage: parsed.preferences?.uiLanguage === 'ar' ? 'ar' : 'en',
        defaultParams: {
          ...DEFAULT_PREFERENCES.defaultParams,
          ...(parsed.preferences?.defaultParams || {}),
        },
        selectedVoice: parsed.preferences?.selectedVoice ?? null,
      },
    };
  } catch {
    return { preferences: structuredClone(DEFAULT_PREFERENCES) };
  }
}

async function writeConfig(config: StoredConfig): Promise<void> {
  await ensureDataDirs();
  const tmpPath = `${CONFIG_FILE}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  await fsp.rename(tmpPath, CONFIG_FILE);
}

async function readDb(): Promise<StoredDatabase> {
  await ensureDataDirs();
  try {
    const raw = await fsp.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredDatabase>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return { favorites: [], history: [] };
  }
}

async function writeDb(db: StoredDatabase): Promise<void> {
  await ensureDataDirs();
  const tmpPath = `${DB_FILE}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(db, null, 2));
  await fsp.rename(tmpPath, DB_FILE);
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return `••••${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

async function getEffectiveApiKey(): Promise<{
  apiKey: string | null;
  source: 'env' | 'user' | 'none';
  maskedKey: string | null;
  updatedAt: string | null;
}> {
  const config = await readConfig();
  if (config.encryptedApiKey && config.iv && config.authTag) {
    const decrypted = await decryptSecret(config.encryptedApiKey, config.iv, config.authTag);
    if (decrypted) {
      return {
        apiKey: decrypted,
        source: 'user',
        maskedKey: config.maskedKey || maskApiKey(decrypted),
        updatedAt: config.updatedAt || null,
      };
    }
  }
  const envKey = process.env.FISH_AUDIO_API_KEY?.trim();
  if (envKey) {
    return {
      apiKey: envKey,
      source: 'env',
      maskedKey: maskApiKey(envKey),
      updatedAt: null,
    };
  }
  return {
    apiKey: null,
    source: 'none',
    maskedKey: null,
    updatedAt: null,
  };
}

async function extractFishErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as Record<string, unknown>;
      if (typeof data.message === 'string' && data.message) return data.message;
      if (typeof data.detail === 'string' && data.detail) return data.detail;
      if (typeof data.error === 'string' && data.error) return data.error;
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0] as Record<string, unknown>;
        if (typeof first?.msg === 'string') return first.msg;
      }
      return JSON.stringify(data);
    }
    const text = await res.text();
    return text.slice(0, 300) || `Fish Audio API error (${res.status})`;
  } catch {
    return `Fish Audio API error (${res.status} ${res.statusText})`;
  }
}

async function fetchFishCredits(apiKey: string): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`${FISH_API_BASE}/wallet/self/api-credit`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown> | number;
    if (typeof data === 'number') return data;
    if (typeof data?.credit === 'number') return data.credit;
    if (typeof data?.balance === 'number') return data.balance;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyFishApiKey(apiKey: string): Promise<{
  valid: boolean;
  credit: number | null;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${FISH_API_BASE}/model?page_size=1&self=true`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;

    if (res.status === 401 || res.status === 403) {
      return {
        valid: false,
        credit: null,
        latencyMs,
        error: 'Authentication failed: Invalid or unauthorized Fish Audio API key.',
      };
    }

    if (!res.ok) {
      const msg = await extractFishErrorMessage(res);
      return {
        valid: false,
        credit: null,
        latencyMs,
        error: msg,
      };
    }

    const credit = await fetchFishCredits(apiKey);
    return { valid: true, credit, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Connection to Fish Audio timed out. Please try again.'
        : 'Unable to reach Fish Audio servers. Check your network connection.';
    return { valid: false, credit: null, latencyMs, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMediaUrl(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  let fullUrl = raw.trim();
  if (!fullUrl) return undefined;
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    const cleaned = fullUrl.replace(/^\/+/, '');
    fullUrl = `https://public-audio.fish.audio/${cleaned}`;
  }
  return `/api/media-proxy?url=${encodeURIComponent(fullUrl)}`;
}

function normalizeVoiceItem(item: Record<string, unknown>): Record<string, unknown> {
  const samples = Array.isArray(item.samples)
    ? item.samples.map((sample) => {
        const s = sample as Record<string, unknown>;
        return {
          ...s,
          audio: normalizeMediaUrl(typeof s.audio === 'string' ? s.audio : undefined) || s.audio,
        };
      })
    : [];

  return {
    ...item,
    cover_image: normalizeMediaUrl(typeof item.cover_image === 'string' ? item.cover_image : undefined),
    samples,
  };
}

function isAllowedMediaHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'fish.audio' ||
    lower.endsWith('.fish.audio') ||
    lower.endsWith('.r2.cloudflarestorage.com') ||
    lower.endsWith('.r2.dev')
  );
}

function getMimeType(format: AudioFormat): string {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'opus':
      return 'audio/ogg';
    case 'pcm':
      return 'application/octet-stream';
  }
}

function safeClientStatus(upstreamStatus: number): number {
  // Nginx intercepts 403, 502, 503, 504 with HTML pages (200 OK), breaking JSON API clients.
  if (upstreamStatus === 403) return 401;
  if (upstreamStatus === 502 || upstreamStatus === 503 || upstreamStatus === 504) return 500;
  return upstreamStatus;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function startServer() {
  await ensureDataDirs();
  await resetStuckRenderJobsOnStartup();
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'voice-studio-ai' });
  });

  // API Configuration Status (never returns plaintext key)
  app.get('/api/config/status', async (_req, res) => {
    const keyInfo = await getEffectiveApiKey();
    let credit: number | null = null;
    if (keyInfo.apiKey) {
      credit = await fetchFishCredits(keyInfo.apiKey);
    }
    const [geminiCreds, aiProvidersConfigured] = await Promise.all([
      resolveProviderCredentials('gemini'),
      hasAnyAiProviderConfigured(),
    ]);
    const geminiConfigured = Boolean(geminiCreds.apiKey);
    res.json({
      configured: Boolean(keyInfo.apiKey),
      source: keyInfo.source,
      maskedKey: keyInfo.maskedKey,
      credit,
      updatedAt: keyInfo.updatedAt,
      geminiConfigured,
      aiProvidersConfigured,
    });
  });

  // Save & verify API key securely on server
  app.post('/api/config/key', async (req, res) => {
    const rawKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    if (!rawKey) {
      res.status(400).json({ error: 'API key is required.' });
      return;
    }

    const verification = await verifyFishApiKey(rawKey);
    if (!verification.valid) {
      res.status(401).json({ error: verification.error || 'Failed to verify Fish Audio API key.' });
      return;
    }

    const encrypted = await encryptSecret(rawKey);
    const config = await readConfig();
    const updatedAt = new Date().toISOString();
    config.encryptedApiKey = encrypted.encryptedApiKey;
    config.iv = encrypted.iv;
    config.authTag = encrypted.authTag;
    config.maskedKey = maskApiKey(rawKey);
    config.updatedAt = updatedAt;
    await writeConfig(config);

    res.json({
      configured: true,
      source: 'user',
      maskedKey: config.maskedKey,
      credit: verification.credit,
      latencyMs: verification.latencyMs,
      updatedAt,
    });
  });

  // Remove user-saved API key
  app.delete('/api/config/key', async (_req, res) => {
    const config = await readConfig();
    delete config.encryptedApiKey;
    delete config.iv;
    delete config.authTag;
    delete config.maskedKey;
    delete config.updatedAt;
    await writeConfig(config);

    const keyInfo = await getEffectiveApiKey();
    res.json({
      configured: Boolean(keyInfo.apiKey),
      source: keyInfo.source,
      maskedKey: keyInfo.maskedKey,
      credit: null,
      updatedAt: null,
    });
  });

  // Test currently active API key
  app.post('/api/config/test', async (_req, res) => {
    const keyInfo = await getEffectiveApiKey();
    if (!keyInfo.apiKey) {
      res.status(400).json({ ok: false, error: 'No Fish Audio API key is configured.' });
      return;
    }
    const result = await verifyFishApiKey(keyInfo.apiKey);
    if (!result.valid) {
      res.status(401).json({ ok: false, error: result.error, latencyMs: result.latencyMs });
      return;
    }
    res.json({
      ok: true,
      latencyMs: result.latencyMs,
      credit: result.credit,
    });
  });

  // User Preferences
  app.get('/api/preferences', async (_req, res) => {
    const config = await readConfig();
    res.json(config.preferences);
  });

  app.patch('/api/preferences', async (req, res) => {
    const config = await readConfig();
    const incoming = req.body || {};
    if (incoming.uiLanguage === 'en' || incoming.uiLanguage === 'ar') {
      config.preferences.uiLanguage = incoming.uiLanguage;
    }
    if (incoming.defaultParams && typeof incoming.defaultParams === 'object') {
      config.preferences.defaultParams = {
        ...config.preferences.defaultParams,
        ...incoming.defaultParams,
      };
    }
    if ('selectedVoice' in incoming) {
      config.preferences.selectedVoice = incoming.selectedVoice ?? null;
    }
    await writeConfig(config);
    res.json(config.preferences);
  });

  // Browse Fish Audio Voices
  app.get('/api/voices', async (req, res) => {
    const keyInfo = await getEffectiveApiKey();
    if (!keyInfo.apiKey) {
      res.status(401).json({
        error: 'Fish Audio API key not configured. Please add your API key in API Configuration.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    const params = new URLSearchParams();
    const pageSize = clamp(Number(req.query.page_size) || 24, 1, 50);
    const pageNumber = Math.max(1, Number(req.query.page_number) || 1);
    params.set('page_size', String(pageSize));
    params.set('page_number', String(pageNumber));

    if (typeof req.query.title === 'string' && req.query.title.trim()) {
      params.set('title', req.query.title.trim());
    }
    if (typeof req.query.language === 'string' && req.query.language.trim() && req.query.language !== 'all') {
      params.set('language', req.query.language.trim());
    }
    if (typeof req.query.tag === 'string' && req.query.tag.trim() && req.query.tag !== 'all') {
      params.set('tag', req.query.tag.trim());
    }
    if (typeof req.query.sort_by === 'string' && (req.query.sort_by === 'task_count' || req.query.sort_by === 'created_at')) {
      params.set('sort_by', req.query.sort_by);
    } else {
      params.set('sort_by', 'task_count');
    }
    if (req.query.self === 'true') {
      params.set('self', 'true');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const fishRes = await fetch(`${FISH_API_BASE}/model?${params.toString()}`, {
        headers: { Authorization: `Bearer ${keyInfo.apiKey}` },
        signal: controller.signal,
      });

      if (!fishRes.ok) {
        const msg = await extractFishErrorMessage(fishRes);
        res.status(safeClientStatus(fishRes.status)).json({ error: msg });
        return;
      }

      const data = (await fishRes.json()) as { total?: number; items?: Record<string, unknown>[] };
      const items = Array.isArray(data.items) ? data.items.map(normalizeVoiceItem) : [];
      res.json({
        total: typeof data.total === 'number' ? data.total : items.length,
        items,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Fish Audio voice request timed out.'
          : 'Network error communicating with Fish Audio.';
      res.status(500).json({ error: message });
    } finally {
      clearTimeout(timeout);
    }
  });

  // Get single Fish Audio voice details + samples
  app.get('/api/voices/:id', async (req, res) => {
    const keyInfo = await getEffectiveApiKey();
    if (!keyInfo.apiKey) {
      res.status(401).json({ error: 'Fish Audio API key not configured.', code: 'API_KEY_MISSING' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const fishRes = await fetch(`${FISH_API_BASE}/model/${encodeURIComponent(req.params.id)}`, {
        headers: { Authorization: `Bearer ${keyInfo.apiKey}` },
        signal: controller.signal,
      });
      if (!fishRes.ok) {
        const msg = await extractFishErrorMessage(fishRes);
        res.status(safeClientStatus(fishRes.status)).json({ error: msg });
        return;
      }
      const model = (await fishRes.json()) as Record<string, unknown>;
      res.json(normalizeVoiceItem(model));
    } catch {
      res.status(500).json({ error: 'Failed to retrieve voice details from Fish Audio.' });
    } finally {
      clearTimeout(timeout);
    }
  });

  // Safe Media Proxy for Fish Audio cover images & audio previews
  app.get('/api/media-proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl) {
      res.status(400).end();
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).end();
      return;
    }

    if (parsedUrl.protocol !== 'https:' || !isAllowedMediaHost(parsedUrl.hostname)) {
      res.status(400).end();
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const upstream = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!upstream.ok) {
        res.status(safeClientStatus(upstream.status)).end();
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      const arrayBuf = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.status(500).end();
    } finally {
      clearTimeout(timeout);
    }
  });

  // Shared TTS Synthesis Runner (supports Continuous Narration segmentation + stitching)
  async function executeTtsSynthesis(
    body: Record<string, unknown>,
    apiKey: string,
    signal: AbortSignal,
    onProgress?: (event: {
      phase: 'splitting' | 'generating' | 'stitching';
      currentSegment: number;
      completedSegments?: number;
      totalSegments: number;
      segmentText?: string;
    }) => void
  ): Promise<{ status: number; record?: GenerationRecord; error?: string }> {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return { status: 400, error: 'Script text cannot be empty.' };
    }
    if (text.length > 60000) {
      return { status: 400, error: 'Script text exceeds the 60,000 character request limit.' };
    }

    const allowedModels: FishAudioModel[] = ['s2.1-pro', 's2.1-pro-free', 's2-pro', 's1'];
    const model: FishAudioModel = allowedModels.includes(body?.model as FishAudioModel)
      ? (body.model as FishAudioModel)
      : 's2.1-pro-free';

    const allowedFormats: AudioFormat[] = ['mp3', 'wav', 'opus', 'pcm'];
    const format: AudioFormat = allowedFormats.includes(body?.format as AudioFormat)
      ? (body.format as AudioFormat)
      : 'mp3';

    const voiceId =
      typeof body?.voiceId === 'string' && body.voiceId.trim() ? body.voiceId.trim() : null;
    const voiceName =
      typeof body?.voiceName === 'string' && body.voiceName.trim()
        ? body.voiceName.trim()
        : 'Fish Audio Default Voice';
    const voiceAuthor =
      typeof body?.voiceAuthor === 'string' && body.voiceAuthor.trim()
        ? body.voiceAuthor.trim()
        : undefined;

    const speed = clamp(Number(body?.speed ?? 1.0) || 1.0, 0.5, 2.0);
    const volume = clamp(Number(body?.volume ?? 0.0) || 0.0, -20.0, 20.0);
    const temperature = clamp(Number(body?.temperature ?? 0.7), 0.0, 1.0);
    const topP = clamp(Number(body?.top_p ?? 0.7), 0.0, 1.0);
    const repetitionPenalty = clamp(Number(body?.repetition_penalty ?? 1.2) || 1.2, 0.9, 2.0);
    const chunkLength = Math.round(clamp(Number(body?.chunk_length ?? 200) || 200, 100, 300));
    const normalize = body?.normalize !== false;
    const latency: LatencyMode = body?.latency === 'normal' ? 'normal' : 'balanced';
    const continuousNarration = body?.continuous_narration !== false;
    const rawPause = Number(body?.segment_pause_ms ?? 150);
    const segmentPauseMs: 0 | 150 | 350 = rawPause === 0 ? 0 : rawPause === 350 ? 350 : 150;
    const requestedConcurrency = Math.round(clamp(Number(body?.parallel_concurrency ?? 3) || 3, 1, 3));

    const rawSampleRate = body?.sample_rate;
    const sampleRate =
      typeof rawSampleRate === 'number' && Number.isFinite(rawSampleRate) && rawSampleRate > 0
        ? Math.round(rawSampleRate)
        : null;

    const mp3Bitrate: 64 | 128 | 192 =
      body?.mp3_bitrate === 64 || body?.mp3_bitrate === 192 ? body.mp3_bitrate : 128;
    const opusBitrate: 24 | 32 | 48 | 64 | -1000 =
      body?.opus_bitrate === 24 ||
      body?.opus_bitrate === 48 ||
      body?.opus_bitrate === 64 ||
      body?.opus_bitrate === -1000
        ? body.opus_bitrate
        : 32;

    interface SynthesisSegment {
      text: string;
      speed: number;
      voiceId: string | null;
    }

    const rawDirectedSegments = Array.isArray(body?.segments) ? body.segments : null;
    let segments: SynthesisSegment[] = [];

    if (rawDirectedSegments && rawDirectedSegments.length > 0) {
      if (rawDirectedSegments.length > 150) {
        return { status: 400, error: 'Too many directed segments (maximum 150).' };
      }
      let totalDirectedChars = 0;
      for (const rawSeg of rawDirectedSegments) {
        const s = (rawSeg || {}) as Record<string, unknown>;
        const segTextRaw = typeof s.text === 'string' ? s.text.trim() : '';
        const segEmotion = typeof s.emotionTag === 'string' ? s.emotionTag.trim() : '';
        const composed = composeSegmentText(segTextRaw, segEmotion);
        if (!composed) continue;

        totalDirectedChars += composed.length;
        if (totalDirectedChars > 60000) {
          return { status: 400, error: 'Total directed script exceeds the 60,000 character limit.' };
        }

        const segSpeed =
          typeof s.speed === 'number' && Number.isFinite(s.speed)
            ? clamp(s.speed, 0.5, 2.0)
            : speed;
        const segVoiceId =
          s.voiceId === undefined
            ? voiceId
            : typeof s.voiceId === 'string' && s.voiceId.trim()
              ? s.voiceId.trim()
              : null;

        if (continuousNarration && composed.length > 560) {
          const subPieces = splitTextIntoSegments(composed, 480);
          for (const piece of subPieces) {
            segments.push({ text: piece, speed: segSpeed, voiceId: segVoiceId });
          }
        } else {
          segments.push({ text: composed, speed: segSpeed, voiceId: segVoiceId });
        }
      }
    } else {
      const plainPieces = continuousNarration ? splitTextIntoSegments(text, 480) : [text];
      segments = plainPieces.map((piece) => ({
        text: piece,
        speed,
        voiceId,
      }));
    }

    if (segments.length === 0) {
      return { status: 400, error: 'Script text cannot be empty.' };
    }

    const effectiveRecordText =
      rawDirectedSegments && rawDirectedSegments.length > 0
        ? segments.map((s) => s.text).join('\n')
        : text;

    const totalSegments = segments.length;

    onProgress?.({
      phase: 'splitting',
      currentSegment: 0,
      completedSegments: 0,
      totalSegments,
    });

    let activeLimit = Math.min(requestedConcurrency, totalSegments);

    const synthesizeSingleSegment = async (seg: SynthesisSegment): Promise<Buffer> => {
      const payload: Record<string, unknown> = {
        text: seg.text,
        format,
        chunk_length: chunkLength,
        normalize,
        latency,
        temperature: Number(temperature.toFixed(2)),
        top_p: Number(topP.toFixed(2)),
        repetition_penalty: Number(repetitionPenalty.toFixed(2)),
        prosody: {
          speed: Number(seg.speed.toFixed(2)),
          volume: Number(volume.toFixed(1)),
        },
      };

      if (seg.voiceId) payload.reference_id = seg.voiceId;
      if (sampleRate !== null) payload.sample_rate = sampleRate;
      if (format === 'mp3') payload.mp3_bitrate = mp3Bitrate;
      else if (format === 'opus') payload.opus_bitrate = opusBitrate;

      const maxAttempts = 4;
      let lastStatus = 500;
      let lastError = 'Speech synthesis failed.';

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (signal.aborted) {
          throw Object.assign(new Error('Generation cancelled.'), { status: 499, aborted: true });
        }

        const segController = new AbortController();
        const onParentAbort = () => segController.abort();
        signal.addEventListener('abort', onParentAbort, { once: true });
        const timeout = setTimeout(() => segController.abort(), 60000);

        try {
          const fishRes = await fetch(`${FISH_API_BASE}/v1/tts`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              model,
            },
            body: JSON.stringify(payload),
            signal: segController.signal,
          });

          if (!fishRes.ok) {
            const msg = await extractFishErrorMessage(fishRes);
            lastStatus = safeClientStatus(fishRes.status);
            lastError = msg;

            if (fishRes.status === 429 && attempt < maxAttempts) {
              // Downshift concurrency dynamically on rate limit and back off
              activeLimit = Math.max(1, activeLimit - 1);
              const retryAfter = Number(fishRes.headers.get('retry-after'));
              const delayMs =
                Number.isFinite(retryAfter) && retryAfter > 0
                  ? Math.min(8000, retryAfter * 1000)
                  : 1200 * attempt;
              await new Promise((r) => setTimeout(r, delayMs));
              continue;
            }
            if (fishRes.status >= 500 && attempt < maxAttempts) {
              await new Promise((r) => setTimeout(r, 700 * attempt));
              continue;
            }
            throw Object.assign(new Error(msg), { status: lastStatus });
          }

          const buf = Buffer.from(await fishRes.arrayBuffer());
          if (buf.length === 0) {
            lastStatus = 500;
            lastError = 'Fish Audio returned an empty audio stream.';
            if (attempt < maxAttempts) continue;
            throw Object.assign(new Error(lastError), { status: 500 });
          }
          return buf;
        } catch (err) {
          if (signal.aborted) {
            throw Object.assign(new Error('Generation cancelled.'), { status: 499, aborted: true });
          }
          if (err instanceof Error && 'status' in err) {
            throw err;
          }
          const isTimeout = err instanceof Error && err.name === 'AbortError';
          lastStatus = 500;
          lastError = isTimeout
            ? 'Speech synthesis timed out on a segment. Try Balanced latency mode or lower concurrency.'
            : 'Network failure while connecting to Fish Audio synthesis endpoint.';
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 700 * attempt));
            continue;
          }
          throw Object.assign(new Error(lastError), { status: lastStatus });
        } finally {
          clearTimeout(timeout);
          signal.removeEventListener('abort', onParentAbort);
        }
      }

      throw Object.assign(new Error(lastError), { status: lastStatus });
    };

    const segmentBuffers: Buffer[] = new Array(totalSegments);
    try {
      let nextIndex = 0;
      let completedCount = 0;
      let fatalError: unknown = null;

      onProgress?.({
        phase: 'generating',
        currentSegment: 0,
        completedSegments: 0,
        totalSegments,
        segmentText: segments[0]?.text.slice(0, 120),
      });

      const worker = async (workerId: number) => {
        while (true) {
          if (fatalError || signal.aborted) return;
          // If concurrency downshifted due to 429, pause extra workers
          if (workerId >= activeLimit) return;

          const idx = nextIndex;
          if (idx >= totalSegments) return;
          nextIndex += 1;

          const seg = segments[idx];
          try {
            const buf = await synthesizeSingleSegment(seg);
            segmentBuffers[idx] = buf;
            completedCount += 1;
            onProgress?.({
              phase: 'generating',
              currentSegment: completedCount,
              completedSegments: completedCount,
              totalSegments,
              segmentText: seg.text.slice(0, 120),
            });
          } catch (err) {
            fatalError = err;
            return;
          }
        }
      };

      const initialWorkers = Array.from({ length: activeLimit }, (_, i) => worker(i));
      await Promise.all(initialWorkers);

      // If all workers exited early due to downshift while segments remained, finish with 1 worker
      if (!fatalError && !signal.aborted && nextIndex < totalSegments) {
        await worker(0);
      }

      if (fatalError) {
        throw fatalError;
      }
      if (signal.aborted) {
        throw Object.assign(new Error('Generation cancelled.'), { status: 499 });
      }

      if (totalSegments > 1) {
        onProgress?.({
          phase: 'stitching',
          currentSegment: totalSegments,
          completedSegments: totalSegments,
          totalSegments,
        });
      }

      const [finalBuffer, segmentDurationsMs] = await Promise.all([
        stitchAudioSegments({
          buffers: segmentBuffers,
          format,
          sampleRate,
          mp3Bitrate,
          opusBitrate,
          pauseMs: segmentPauseMs,
          tmpRootDir: TMP_DIR,
        }),
        Promise.all(
          segmentBuffers.map((buf) => measureBufferDurationMs(buf, format, sampleRate, TMP_DIR))
        ).catch(() => [] as number[]),
      ]);

      const id = crypto.randomUUID();
      const filePath = path.join(AUDIO_DIR, `${id}.${format}`);
      await fsp.writeFile(filePath, finalBuffer);

      const safeSlug =
        voiceName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 32) || 'voice';
      const downloadFilename = `voice-studio-${safeSlug}-${id.slice(0, 8)}.${format}`;

      let transcript: TranscriptCue[] | undefined;
      let transcriptSource: TranscriptSource | undefined;
      let durationSeconds: number | undefined;

      try {
        const totalDurMs = await measureAudioFileDurationMs(filePath, format, sampleRate);
        durationSeconds = Number((totalDurMs / 1000).toFixed(2));
      } catch {
        // Non-fatal
      }

      if (segmentDurationsMs.length === segments.length) {
        const cues = buildTranscriptFromSegments(
          segments.map((s) => s.text),
          segmentDurationsMs,
          totalSegments > 1 ? segmentPauseMs : 0
        );
        if (cues.length > 0) {
          transcript = cues;
          transcriptSource = 'segment-exact';
        }
      }

      const record: GenerationRecord = {
        id,
        text: effectiveRecordText,
        voiceId,
        voiceName,
        voiceAuthor,
        model,
        format,
        sampleRate,
        bitrate: format === 'mp3' ? mp3Bitrate : format === 'opus' ? opusBitrate : null,
        speed: Number(speed.toFixed(2)),
        volume: Number(volume.toFixed(1)),
        temperature: Number(temperature.toFixed(2)),
        topP: Number(topP.toFixed(2)),
        repetitionPenalty: Number(repetitionPenalty.toFixed(2)),
        latency,
        normalize,
        chunkLength,
        segmentCount: totalSegments,
        durationSeconds,
        transcript,
        transcriptSource,
        fileSizeBytes: finalBuffer.length,
        createdAt: new Date().toISOString(),
        audioUrl: `/api/history/${id}/audio`,
        downloadUrl: `/api/history/${id}/download/${downloadFilename}`,
      };

      const db = await readDb();
      db.history.unshift(record);
      await writeDb(db);

      return { status: 201, record };
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? err.status
          : 500;
      const message = err instanceof Error ? err.message : 'Speech synthesis failed.';
      return { status, error: message };
    }
  }

  // Streaming Continuous Narration TTS Endpoint (SSE progress + seamless stitched output)
  app.post('/api/tts/stream', async (req, res) => {
    const keyInfo = await getEffectiveApiKey();
    if (!keyInfo.apiKey) {
      res.status(401).json({
        error: 'Fish Audio API key is not configured. Please add your API key in API Configuration.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const controller = new AbortController();
    let closed = false;
    res.on('close', () => {
      closed = true;
      controller.abort();
    });

    const sendEvent = (event: string, data: unknown) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const result = await executeTtsSynthesis(
      (req.body || {}) as Record<string, unknown>,
      keyInfo.apiKey,
      controller.signal,
      (progress) => sendEvent('progress', progress)
    );

    if (closed) return;

    if (result.record) {
      sendEvent('complete', { record: result.record });
    } else {
      sendEvent('error', {
        error: result.error || 'Speech synthesis failed.',
        status: result.status,
      });
    }
    res.end();
  });

  // Standard Text-to-Speech Generation Endpoint (also supports Continuous Narration)
  app.post('/api/tts', async (req, res) => {
    const keyInfo = await getEffectiveApiKey();
    if (!keyInfo.apiKey) {
      res.status(401).json({
        error: 'Fish Audio API key is not configured. Please add your API key in API Configuration.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    const controller = new AbortController();
    res.on('close', () => controller.abort());

    const result = await executeTtsSynthesis(
      (req.body || {}) as Record<string, unknown>,
      keyInfo.apiKey,
      controller.signal
    );

    if (result.record) {
      res.status(201).json({ record: result.record });
    } else {
      res.status(safeClientStatus(result.status)).json({
        error: result.error || 'Speech synthesis failed.',
      });
    }
  });

  // Single-Segment Audition Endpoint (ephemeral preview without adding to history)
  app.post('/api/tts/audition', async (req, res) => {
    const keyInfo = await getEffectiveApiKey();
    if (!keyInfo.apiKey) {
      res.status(401).json({
        error: 'Fish Audio API key is not configured. Please add your API key in API Configuration.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const rawText = typeof body.text === 'string' ? body.text.trim() : '';
    const emotionTag = typeof body.emotionTag === 'string' ? body.emotionTag.trim() : '';
    const composedText = composeSegmentText(rawText, emotionTag);

    if (!composedText) {
      res.status(400).json({ error: 'Segment text cannot be empty.' });
      return;
    }
    if (composedText.length > 900) {
      res.status(400).json({ error: 'Segment preview is limited to 900 characters.' });
      return;
    }

    const allowedModels: FishAudioModel[] = ['s2.1-pro', 's2.1-pro-free', 's2-pro', 's1'];
    const model: FishAudioModel = allowedModels.includes(body.model as FishAudioModel)
      ? (body.model as FishAudioModel)
      : 's2.1-pro-free';

    const requestedFormat = body.format === 'wav' || body.format === 'opus' ? body.format : 'mp3';
    const voiceId = typeof body.voiceId === 'string' && body.voiceId.trim() ? body.voiceId.trim() : null;
    const speed = clamp(Number(body.speed ?? 1.0) || 1.0, 0.5, 2.0);
    const volume = clamp(Number(body.volume ?? 0.0) || 0.0, -20.0, 20.0);
    const temperature = clamp(Number(body.temperature ?? 0.7), 0.0, 1.0);
    const topP = clamp(Number(body.top_p ?? 0.7), 0.0, 1.0);
    const repetitionPenalty = clamp(Number(body.repetition_penalty ?? 1.2) || 1.2, 0.9, 2.0);
    const chunkLength = Math.round(clamp(Number(body.chunk_length ?? 200) || 200, 100, 300));
    const normalize = body.normalize !== false;
    const latency: LatencyMode = body.latency === 'normal' ? 'normal' : 'balanced';

    const payload: Record<string, unknown> = {
      text: composedText,
      format: requestedFormat,
      chunk_length: chunkLength,
      normalize,
      latency,
      temperature: Number(temperature.toFixed(2)),
      top_p: Number(topP.toFixed(2)),
      repetition_penalty: Number(repetitionPenalty.toFixed(2)),
      prosody: {
        speed: Number(speed.toFixed(2)),
        volume: Number(volume.toFixed(1)),
      },
    };

    if (voiceId) payload.reference_id = voiceId;
    if (requestedFormat === 'mp3') payload.mp3_bitrate = 128;
    else if (requestedFormat === 'opus') payload.opus_bitrate = 32;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    res.on('close', () => controller.abort());

    try {
      const fishRes = await fetch(`${FISH_API_BASE}/v1/tts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keyInfo.apiKey}`,
          'Content-Type': 'application/json',
          model,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!fishRes.ok) {
        const msg = await extractFishErrorMessage(fishRes);
        res.status(safeClientStatus(fishRes.status)).json({ error: msg });
        return;
      }

      const buf = Buffer.from(await fishRes.arrayBuffer());
      if (buf.length === 0) {
        res.status(500).json({ error: 'Fish Audio returned an empty audio stream.' });
        return;
      }

      res.setHeader('Content-Type', getMimeType(requestedFormat));
      res.setHeader('Cache-Control', 'no-store');
      res.send(buf);
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      res.status(500).json({
        error: isTimeout
          ? 'Segment audition timed out.'
          : 'Failed to connect to Fish Audio for segment audition.',
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  // Generation History Endpoints
  app.get('/api/history', async (_req, res) => {
    const db = await readDb();
    res.json({ items: db.history });
  });

  app.get('/api/history/:id/audio', async (req, res) => {
    const db = await readDb();
    const item = db.history.find((h) => h.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Audio recording not found.' });
      return;
    }
    const filePath = path.join(AUDIO_DIR, `${item.id}.${item.format}`);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Audio file missing from storage.' });
      return;
    }
    res.setHeader('Content-Type', getMimeType(item.format));
    res.sendFile(filePath);
  });

  app.get(['/api/history/:id/download', '/api/history/:id/download/:filename'], async (req, res) => {
    const db = await readDb();
    const item = db.history.find((h) => h.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Audio recording not found.' });
      return;
    }
    const filePath = path.join(AUDIO_DIR, `${item.id}.${item.format}`);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Audio file missing from storage.' });
      return;
    }
    const safeSlug =
      item.voiceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'voice';
    const filename = `voice-studio-${safeSlug}-${item.id.slice(0, 8)}.${item.format}`;
    res.setHeader('Content-Type', getMimeType(item.format));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.sendFile(filePath);
  });

  // Extract or Refresh Timestamped Transcript for a History Recording
  app.post('/api/history/:id/transcribe', async (req, res) => {
    const db = await readDb();
    const idx = db.history.findIndex((h) => h.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Audio recording not found.' });
      return;
    }

    const item = db.history[idx];
    const filePath = path.join(AUDIO_DIR, `${item.id}.${item.format}`);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Audio file missing from storage.' });
      return;
    }

    const rawMode = typeof req.body?.mode === 'string' ? req.body.mode : 'auto';
    const allowedModes: TranscriptExtractionMode[] = ['auto', 'fish-asr', 'gemini', 'acoustic'];
    const mode: TranscriptExtractionMode = allowedModes.includes(rawMode as TranscriptExtractionMode)
      ? (rawMode as TranscriptExtractionMode)
      : 'auto';

    const keyInfo = await getEffectiveApiKey();

    try {
      const result = await extractTranscriptForRecord({
        filePath,
        format: item.format,
        sampleRate: item.sampleRate,
        text: item.text,
        mode,
        fishApiKey: keyInfo.apiKey,
        tmpRootDir: TMP_DIR,
      });

      const updated: GenerationRecord = {
        ...item,
        durationSeconds: result.durationSeconds,
        transcript: result.cues,
        transcriptSource: result.source,
      };
      db.history[idx] = updated;
      await writeDb(db);

      res.json({ record: updated });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? safeClientStatus(err.status)
          : 500;
      const message =
        err instanceof Error ? err.message : 'Unable to extract transcript with timestamps.';
      res.status(status).json({ error: message });
    }
  });

  app.delete('/api/history/:id', async (req, res) => {
    const db = await readDb();
    const idx = db.history.findIndex((h) => h.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'History item not found.' });
      return;
    }
    const [removed] = db.history.splice(idx, 1);
    await writeDb(db);
    const filePath = path.join(AUDIO_DIR, `${removed.id}.${removed.format}`);
    await fsp.unlink(filePath).catch(() => undefined);
    res.json({ ok: true });
  });

  app.delete('/api/history', async (_req, res) => {
    const db = await readDb();
    const toRemove = [...db.history];
    db.history = [];
    await writeDb(db);
    await Promise.all(
      toRemove.map((item) => fsp.unlink(path.join(AUDIO_DIR, `${item.id}.${item.format}`)).catch(() => undefined))
    );
    res.json({ ok: true });
  });

  // Favorites Endpoints
  app.get('/api/favorites', async (_req, res) => {
    const db = await readDb();
    res.json({ items: db.favorites });
  });

  app.post('/api/favorites', async (req, res) => {
    const voice = req.body?.voice;
    if (!voice || typeof voice._id !== 'string' || typeof voice.title !== 'string') {
      res.status(400).json({ error: 'Invalid voice payload.' });
      return;
    }
    const db = await readDb();
    const exists = db.favorites.some((f) => f._id === voice._id);
    if (!exists) {
      db.favorites.unshift(voice);
      await writeDb(db);
    }
    res.status(201).json({ items: db.favorites });
  });

  app.delete('/api/favorites/:id', async (req, res) => {
    const db = await readDb();
    db.favorites = db.favorites.filter((f) => f._id !== req.params.id);
    await writeDb(db);
    res.json({ items: db.favorites });
  });

  // AI Providers & API Key Management Routes (separate from Fish Audio credentials)
  app.use('/api/ai-providers', createAiProvidersRouter(safeClientStatus));

  // AI YouTube Production Studio API Routes
  app.use('/api/yt', createYouTubeRouter({ getEffectiveApiKey, safeClientStatus }));

  // JSON 404 for unmatched API routes so Vite SPA fallback never serves HTML for /api/*
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Vite / Static Frontend Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Voice Studio AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Voice Studio AI server:', err);
  process.exit(1);
});
