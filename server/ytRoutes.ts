import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import {
  autoAssignMotionEffects,
  generateFullYouTubeScript,
  generateImagePromptsBatch,
  generateVideoConcepts,
  planSmartScenesFromAudio,
  transformScriptText,
  type ScriptEditAction,
} from './ytAiEngine.ts';
import {
  analyzeProjectVoiceoverAudio,
  generateProjectVoiceover,
} from './ytAudioEngine.ts';
import {
  createProject,
  DEFAULT_AUDIO_MIX,
  DEFAULT_SUBTITLE_STYLE,
  deleteProject,
  duplicateProject,
  getProject,
  getProjectStorageBytes,
  getProjectSubdir,
  listProjects,
  matchSceneNumberFromFilename,
  saveProject,
} from './ytStorage.ts';
import {
  buildSrtContent,
  buildVttContent,
  cancelRenderJob,
  generateBuiltinAmbientTrack,
  isRenderRunning,
  startBackgroundVideoRender,
} from './ytVideoEngine.ts';
import type {
  AudioTrackAsset,
  ProjectSettings,
  SoundEffectCue,
  VoiceoverSettings,
  YouTubeProject,
} from './ytTypes.ts';
import type { TranscriptExtractionMode } from './transcriptEngine.ts';

const execFileAsync = promisify(execFile);

interface RouterDeps {
  getEffectiveApiKey: () => Promise<{ apiKey: string | null }>;
  safeClientStatus: (status: number) => number;
}

function getSafeExt(filename: string, fallback: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return ext || fallback;
}

function getImageMime(ext: string): string {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function getMediaContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg' || ext === '.opus') return 'audio/ogg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.srt') return 'text/plain; charset=utf-8';
  if (ext === '.vtt') return 'text/vtt; charset=utf-8';
  return 'application/octet-stream';
}

async function probeImageDimensions(filePath: string): Promise<{ width?: number; height?: number }> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', filePath],
      { maxBuffer: 1024 * 128 }
    );
    const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
    const st = parsed.streams?.[0];
    return { width: st?.width, height: st?.height };
  } catch {
    return {};
  }
}

async function probeAudioDurationMs(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { maxBuffer: 1024 * 64 }
    );
    const sec = Number(stdout.trim());
    return Number.isFinite(sec) && sec > 0 ? Math.round(sec * 1000) : 10000;
  } catch {
    return 10000;
  }
}

function streamFileWithRange(req: express.Request, res: express.Response, filePath: string, downloadName?: string) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.status(404).json({ error: 'Media file not found.' });
      return;
    }

    const contentType = getMediaContentType(filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (downloadName) {
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Cache-Control', 'no-store');
    }

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', String(end - start + 1));
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }
      }
    }

    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(filePath).pipe(res);
  });
}

export function createYouTubeRouter(deps: RouterDeps): express.Router {
  const router = express.Router();

  // Generate Video Ideas, Titles & Descriptions via active AI provider
  router.post('/ideas/generate', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        seedTopic?: string;
        category?: string;
        language?: string;
        targetAudience?: string;
      };
      const result = await generateVideoConcepts({
        seedTopic: body.seedTopic,
        category: (body.category || 'documentary') as ProjectSettings['category'],
        language: body.language?.trim() || 'English',
        targetAudience: body.targetAudience?.trim(),
      });
      res.json(result);
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? deps.safeClientStatus(err.status)
          : 500;
      const code =
        err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
          ? err.code
          : undefined;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Unable to generate video concepts.',
        code,
      });
    }
  });

  // List projects
  router.get('/projects', async (_req, res) => {
    try {
      const items = await listProjects();
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list projects.' });
    }
  });

  // Create project
  router.post('/projects', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        settings?: Partial<ProjectSettings>;
        voiceoverSettings?: Partial<VoiceoverSettings>;
        subtitles?: Record<string, unknown>;
        audioMix?: Record<string, unknown>;
      };

      const rawSettings = body.settings || {};
      const topic = typeof rawSettings.topic === 'string' ? rawSettings.topic.trim() : '';
      const name =
        typeof rawSettings.name === 'string' && rawSettings.name.trim()
          ? rawSettings.name.trim()
          : topic.slice(0, 60) || 'Untitled YouTube Video';

      if (!topic) {
        res.status(400).json({ error: 'Video topic or idea is required.' });
        return;
      }

      const settings: ProjectSettings = {
        name,
        topic,
        language: rawSettings.language?.trim() || 'English',
        targetAudience: rawSettings.targetAudience?.trim() || 'General curious viewers',
        category: rawSettings.category || 'documentary',
        targetDurationMinutes: Math.max(1, Math.min(90, Number(rawSettings.targetDurationMinutes) || 15)),
        preferredSceneDurationSec: Math.max(3, Math.min(45, Number(rawSettings.preferredSceneDurationSec) || 10)),
        visualStyle: rawSettings.visualStyle || 'cinematic-photorealism',
        aspectRatio: rawSettings.aspectRatio || '16:9',
        resolution: rawSettings.resolution || '1080p',
        fps: rawSettings.fps || 30,
        qualityPreset: rawSettings.qualityPreset || 'balanced',
        includeResearchNotes: rawSettings.includeResearchNotes !== false,
      };

      const rawVo = body.voiceoverSettings || {};
      const voiceoverSettings: VoiceoverSettings = {
        voiceId: rawVo.voiceId ?? null,
        voiceName: rawVo.voiceName || 'Fish Audio Default Narrator',
        voiceAuthor: rawVo.voiceAuthor,
        model: rawVo.model || 's2.1-pro-free',
        format: rawVo.format === 'pcm' ? 'mp3' : rawVo.format || 'mp3',
        sampleRate: rawVo.sampleRate ?? 44100,
        mp3Bitrate: rawVo.mp3Bitrate || 128,
        speed: rawVo.speed ?? 1.0,
        volume: rawVo.volume ?? 0.0,
        temperature: rawVo.temperature ?? 0.7,
        topP: rawVo.topP ?? 0.7,
        repetitionPenalty: rawVo.repetitionPenalty ?? 1.2,
        chunkLength: rawVo.chunkLength ?? 200,
        normalize: rawVo.normalize !== false,
        latency: rawVo.latency || 'balanced',
        segmentPauseMs: rawVo.segmentPauseMs ?? 150,
        parallelConcurrency: rawVo.parallelConcurrency ?? 3,
        narrationStyle: rawVo.narrationStyle || 'Engaging documentary storytelling',
        pronunciationRules: Array.isArray(rawVo.pronunciationRules) ? rawVo.pronunciationRules : [],
      };

      const project = await createProject({
        settings,
        voiceoverSettings,
        subtitles: { ...DEFAULT_SUBTITLE_STYLE, ...(body.subtitles || {}) },
        audioMix: { ...DEFAULT_AUDIO_MIX, ...(body.audioMix || {}) },
      });

      res.status(201).json({ project });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create project.' });
    }
  });

  // Get single project + live storage usage
  router.get('/projects/:id', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const storageBytes = await getProjectStorageBytes(project.id);
    res.json({
      project,
      storageBytes,
      renderActive: isRenderRunning(project.id),
    });
  });

  // Patch/Auto-save project
  router.patch('/projects/:id', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const patch = (req.body || {}) as Partial<YouTubeProject>;
    if (patch.settings) {
      project.settings = { ...project.settings, ...patch.settings };
    }
    if (patch.voiceoverSettings) {
      project.voiceoverSettings = { ...project.voiceoverSettings, ...patch.voiceoverSettings };
    }
    if ('script' in patch && patch.script) {
      project.script = {
        ...patch.script,
        updatedAt: new Date().toISOString(),
      };
    }
    if (Array.isArray(patch.scenes)) {
      project.scenes = patch.scenes.map((sc, idx) => ({
        ...sc,
        sceneNumber: idx + 1,
        durationMs: Math.max(400, sc.endMs - sc.startMs),
      }));
    }
    if (patch.subtitles) {
      project.subtitles = { ...project.subtitles, ...patch.subtitles };
    }
    if (patch.audioMix) {
      project.audioMix = { ...project.audioMix, ...patch.audioMix };
    }
    if (patch.voiceover && Array.isArray(patch.voiceover.cues)) {
      project.voiceover.cues = patch.voiceover.cues;
    }

    await saveProject(project);
    const storageBytes = await getProjectStorageBytes(project.id);
    res.json({ project, storageBytes });
  });

  // Duplicate project
  router.post('/projects/:id/duplicate', async (req, res) => {
    const cloned = await duplicateProject(req.params.id, req.body?.name);
    if (!cloned) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.status(201).json({ project: cloned });
  });

  // Delete project
  router.delete('/projects/:id', async (req, res) => {
    cancelRenderJob(req.params.id);
    const ok = await deleteProject(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // Generate Full Script via Gemini
  router.post('/projects/:id/script/generate', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    try {
      const result = await generateFullYouTubeScript({
        settings: project.settings,
        narrationStyle: project.voiceoverSettings.narrationStyle,
      });

      project.script = result.script;
      project.usage.geminiCalls += result.calls;
      project.usage.geminiTokensApprox += result.tokensApprox;
      await saveProject(project);

      res.json({ project });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? deps.safeClientStatus(err.status)
          : 500;
      const code =
        err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
          ? err.code
          : undefined;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Script generation failed.',
        code,
      });
    }
  });

  // Transform / Rewrite / Expand / Shorten / Improve a Script Section
  router.post('/projects/:id/script/transform', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const { action, targetText, surroundingContext, customInstruction } = (req.body || {}) as {
      action?: ScriptEditAction;
      targetText?: string;
      surroundingContext?: string;
      customInstruction?: string;
    };

    if (!action || !targetText?.trim()) {
      res.status(400).json({ error: 'Action and target text are required.' });
      return;
    }

    try {
      const result = await transformScriptText({
        action,
        settings: project.settings,
        narrationStyle: project.voiceoverSettings.narrationStyle,
        targetText,
        surroundingContext,
        customInstruction,
      });

      project.usage.geminiCalls += 1;
      project.usage.geminiTokensApprox += result.tokensApprox;
      await saveProject(project);

      res.json({ text: result.text, project });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? deps.safeClientStatus(err.status)
          : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Script edit action failed.',
      });
    }
  });

  // Approve / Lock Script
  router.post('/projects/:id/script/approve', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project || !project.script) {
      res.status(404).json({ error: 'Project script not found.' });
      return;
    }
    const approved = req.body?.approved !== false;
    project.script.approved = approved;
    project.script.approvedAt = approved ? new Date().toISOString() : undefined;
    if (approved) {
      project.script.chapters = project.script.chapters.map((ch) => ({
        ...ch,
        approved: true,
      }));
    }
    await saveProject(project);
    res.json({ project });
  });

  // Generate Voiceover (Complete Script OR Specific Chapter) via SSE Progress Stream
  router.post('/projects/:id/voiceover/generate', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    if (!project.script) {
      res.status(400).json({ error: 'Generate a script first.' });
      return;
    }
    if (!project.script.approved && !req.body?.force) {
      res.status(400).json({ error: 'Please approve the script before generating voiceover.' });
      return;
    }

    const keyInfo = await deps.getEffectiveApiKey();
    if (!keyInfo.apiKey) {
      res.status(401).json({
        error: 'Fish Audio API key is not configured. Please add it in API Configuration.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    // Persist any updated voiceover settings sent in request
    if (req.body?.voiceoverSettings) {
      project.voiceoverSettings = { ...project.voiceoverSettings, ...req.body.voiceoverSettings };
    }
    project.voiceover.status = 'generating';
    project.voiceover.error = undefined;
    await saveProject(project);

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

    try {
      const targetChapterId =
        typeof req.body?.chapterId === 'string' ? req.body.chapterId : undefined;
      const result = await generateProjectVoiceover({
        project,
        apiKey: keyInfo.apiKey,
        targetChapterId,
        signal: controller.signal,
        onProgress: (prog) => sendEvent('progress', prog),
      });

      const latest = (await getProject(project.id)) || project;
      latest.voiceover = {
        status: 'completed',
        audioFileName: result.audioFileName,
        audioUrl: result.audioUrl,
        downloadUrl: result.downloadUrl,
        format: result.format,
        durationMs: result.durationMs,
        fileSizeBytes: result.fileSizeBytes,
        generatedAt: new Date().toISOString(),
        cues: result.cues,
        words: result.words,
        transcriptSource: 'segment-exact',
        chapterAudios: result.chapterAudios,
      };
      latest.usage.fishAudioCharacters += result.charactersSent;
      latest.usage.fishAudioRequests += result.requestsSent;
      await saveProject(latest);

      sendEvent('complete', { project: latest });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Voiceover synthesis failed.';
      const latest = (await getProject(project.id)) || project;
      latest.voiceover.status = 'failed';
      latest.voiceover.error = msg;
      await saveProject(latest);

      sendEvent('error', { error: msg, status: 500 });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  // Analyze Actual Voiceover Audio for Sentence/Word Timestamps
  router.post('/projects/:id/voiceover/analyze', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const mode = (req.body?.mode || 'auto') as TranscriptExtractionMode;
    const keyInfo = await deps.getEffectiveApiKey();

    try {
      const analysis = await analyzeProjectVoiceoverAudio({
        project,
        mode,
        fishApiKey: keyInfo.apiKey,
      });

      project.voiceover.durationMs = analysis.durationMs;
      project.voiceover.cues = analysis.cues;
      project.voiceover.words = analysis.words;
      project.voiceover.transcriptSource = analysis.source;
      await saveProject(project);

      res.json({
        project,
        pauseIntervalsCount: analysis.pauseIntervalsCount,
      });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? deps.safeClientStatus(err.status)
          : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Audio timing analysis failed.',
      });
    }
  });

  // Download Voiceover File as Attachment
  router.get('/projects/:id/voiceover/download/:filename', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project?.voiceover.audioFileName) {
      res.status(404).json({ error: 'Voiceover audio not found.' });
      return;
    }
    const audioPath = path.join(
      getProjectSubdir(project.id, 'audio'),
      project.voiceover.audioFileName
    );
    const safeName = path.basename(req.params.filename).replace(/[^a-zA-Z0-9._-]/g, '');
    streamFileWithRange(req, res, audioPath, safeName || project.voiceover.audioFileName);
  });

  // Smart Duration Scene Planning over Real Audio Timestamps
  router.post('/projects/:id/scenes/plan', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    if (!project.voiceover.cues.length || project.voiceover.durationMs <= 0) {
      res.status(400).json({
        error: 'Generate and analyze the voiceover audio before running Smart Scene Planning.',
      });
      return;
    }

    try {
      const result = await planSmartScenesFromAudio({
        settings: project.settings,
        script: project.script,
        cues: project.voiceover.cues,
        totalDurationMs: project.voiceover.durationMs,
      });

      project.scenes = result.scenes;
      project.usage.geminiCalls += result.calls;
      project.usage.geminiTokensApprox += result.tokensApprox;
      await saveProject(project);

      res.json({ project });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? deps.safeClientStatus(err.status)
          : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Smart scene planning failed.',
      });
    }
  });

  // Generate Detailed Image Prompts for Scenes (All or Selected IDs)
  router.post('/projects/:id/scenes/prompts', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    if (project.scenes.length === 0) {
      res.status(400).json({ error: 'Plan scenes first before generating image prompts.' });
      return;
    }

    const targetSceneIds = Array.isArray(req.body?.sceneIds)
      ? (req.body.sceneIds as string[])
      : undefined;

    try {
      const result = await generateImagePromptsBatch({
        settings: project.settings,
        scenes: project.scenes,
        targetSceneIds,
      });

      const updateMap = new Map(result.updates.map((u) => [u.sceneId, u]));
      project.scenes = project.scenes.map((sc) => {
        const up = updateMap.get(sc.id);
        if (!up) return sc;
        return {
          ...sc,
          imagePrompt: up.imagePrompt,
          continuityNotes: up.continuityNotes,
          visualDescription: up.visualDescription || sc.visualDescription,
        };
      });
      project.usage.geminiCalls += result.calls;
      project.usage.geminiTokensApprox += result.tokensApprox;
      await saveProject(project);

      res.json({ project, updatedCount: result.updates.length });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? deps.safeClientStatus(err.status)
          : 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Image prompt generation failed.',
      });
    }
  });

  // Auto-Assign Non-Repetitive Cinematic Motion Effects Across All Scenes
  router.post('/projects/:id/scenes/auto-motion', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    project.scenes = autoAssignMotionEffects(project.scenes);
    await saveProject(project);
    res.json({ project });
  });

  // Upload Scene Image (Single-Scene Target OR Filename Auto-Matching Queue)
  router.post(
    '/projects/:id/images/upload',
    express.raw({ type: ['image/*', 'application/octet-stream'], limit: '30mb' }),
    async (req, res) => {
      const project = await getProject(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (buf.length < 16) {
        res.status(400).json({ error: 'Uploaded image file is empty or invalid.' });
        return;
      }

      const originalName =
        typeof req.query.filename === 'string' && req.query.filename.trim()
          ? path.basename(req.query.filename.trim())
          : `upload_${Date.now()}.png`;
      const targetSceneId =
        typeof req.query.sceneId === 'string' && req.query.sceneId.trim()
          ? req.query.sceneId.trim()
          : null;

      const ext = getSafeExt(originalName, '.png');
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        res.status(400).json({ error: `Unsupported image type "${ext}". Use PNG, JPG, or WebP.` });
        return;
      }

      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const imagesDir = getProjectSubdir(project.id, 'images');
      await fsp.mkdir(imagesDir, { recursive: true });

      const storedFileName = `img_${crypto.randomUUID().slice(0, 10)}${ext}`;
      const storedPath = path.join(imagesDir, storedFileName);
      await fsp.writeFile(storedPath, buf);
      const dims = await probeImageDimensions(storedPath);
      const imageUrl = `/api/yt/projects/${project.id}/media/images/${storedFileName}`;
      const now = new Date().toISOString();

      const duplicateScene = project.scenes.find(
        (s) => s.image?.sha256 === sha256 && s.id !== targetSceneId
      );

      if (targetSceneId) {
        const scene = project.scenes.find((s) => s.id === targetSceneId);
        if (!scene) {
          await fsp.unlink(storedPath).catch(() => undefined);
          res.status(404).json({ error: 'Target scene not found.' });
          return;
        }
        if (scene.image?.fileName) {
          await fsp.unlink(path.join(imagesDir, scene.image.fileName)).catch(() => undefined);
        }
        scene.image = {
          fileName: storedFileName,
          originalName,
          imageUrl,
          mimeType: getImageMime(ext),
          width: dims.width,
          height: dims.height,
          sizeBytes: buf.length,
          sha256,
          uploadedAt: now,
          matchConfidence: 'single-upload',
        };
        scene.uploadStatus = 'uploaded';
        await saveProject(project);
        res.json({
          project,
          matchedSceneId: scene.id,
          matchedSceneNumber: scene.sceneNumber,
          duplicateOfSceneNumber: duplicateScene?.sceneNumber || null,
        });
        return;
      }

      // Automatic filename matching (e.g. scene_001.png)
      const match = matchSceneNumberFromFilename(originalName, project.scenes.length);
      if (match.sceneNumber !== null) {
        const scene = project.scenes.find((s) => s.sceneNumber === match.sceneNumber);
        if (scene) {
          if (scene.image?.fileName) {
            await fsp.unlink(path.join(imagesDir, scene.image.fileName)).catch(() => undefined);
          }
          scene.image = {
            fileName: storedFileName,
            originalName,
            imageUrl,
            mimeType: getImageMime(ext),
            width: dims.width,
            height: dims.height,
            sizeBytes: buf.length,
            sha256,
            uploadedAt: now,
            matchConfidence: 'exact-filename',
          };
          scene.uploadStatus = 'uploaded';
          await saveProject(project);
          res.json({
            project,
            matchedSceneId: scene.id,
            matchedSceneNumber: scene.sceneNumber,
            duplicateOfSceneNumber: duplicateScene?.sceneNumber || null,
          });
          return;
        }
      }

      // Ambiguous filename: never assign silently! Store in unassignedImages queue for manual confirmation
      const unassignedItem = {
        id: `un_${crypto.randomUUID().slice(0, 8)}`,
        fileName: storedFileName,
        originalName,
        imageUrl,
        mimeType: getImageMime(ext),
        sizeBytes: buf.length,
        sha256,
        uploadedAt: now,
        reason: match.reason,
      };
      project.unassignedImages.unshift(unassignedItem);
      await saveProject(project);
      res.json({
        project,
        matchedSceneId: null,
        unassignedImage: unassignedItem,
        duplicateOfSceneNumber: duplicateScene?.sceneNumber || null,
      });
    }
  );

  // Assign an Unassigned Image to a Specific Scene
  router.post('/projects/:id/images/assign', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const { imageId, sceneId } = (req.body || {}) as { imageId?: string; sceneId?: string };
    const unIdx = project.unassignedImages.findIndex((u) => u.id === imageId);
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (unIdx === -1 || !scene) {
      res.status(404).json({ error: 'Image or target scene not found.' });
      return;
    }

    const [unassigned] = project.unassignedImages.splice(unIdx, 1);
    const imagesDir = getProjectSubdir(project.id, 'images');
    if (scene.image?.fileName) {
      await fsp.unlink(path.join(imagesDir, scene.image.fileName)).catch(() => undefined);
    }
    const dims = await probeImageDimensions(path.join(imagesDir, unassigned.fileName));
    scene.image = {
      fileName: unassigned.fileName,
      originalName: unassigned.originalName,
      imageUrl: unassigned.imageUrl,
      mimeType: unassigned.mimeType,
      width: dims.width,
      height: dims.height,
      sizeBytes: unassigned.sizeBytes,
      sha256: unassigned.sha256,
      uploadedAt: unassigned.uploadedAt,
      matchConfidence: 'manual',
    };
    scene.uploadStatus = 'uploaded';
    await saveProject(project);
    res.json({ project });
  });

  // Remove Unassigned Image
  router.delete('/projects/:id/images/unassigned/:imageId', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const idx = project.unassignedImages.findIndex((u) => u.id === req.params.imageId);
    if (idx === -1) {
      res.status(404).json({ error: 'Unassigned image not found.' });
      return;
    }
    const [removed] = project.unassignedImages.splice(idx, 1);
    await fsp
      .unlink(path.join(getProjectSubdir(project.id, 'images'), removed.fileName))
      .catch(() => undefined);
    await saveProject(project);
    res.json({ project });
  });

  // Remove Image from a Scene
  router.delete('/projects/:id/scenes/:sceneId/image', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const scene = project.scenes.find((s) => s.id === req.params.sceneId);
    if (!scene) {
      res.status(404).json({ error: 'Scene not found.' });
      return;
    }
    if (scene.image?.fileName) {
      await fsp
        .unlink(path.join(getProjectSubdir(project.id, 'images'), scene.image.fileName))
        .catch(() => undefined);
    }
    scene.image = undefined;
    scene.uploadStatus = 'missing';
    scene.approved = false;
    await saveProject(project);
    res.json({ project });
  });

  // Generate Built-in Ambient Music Bed
  router.post('/projects/:id/music/builtin', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const preset = (req.body?.preset || 'documentary-pad') as
      | 'documentary-pad'
      | 'dark-tension'
      | 'warm-piano-drone';
    try {
      const track = await generateBuiltinAmbientTrack({ projectId: project.id, preset });
      if (project.audioMix.musicTrack?.fileName) {
        await fsp
          .unlink(path.join(getProjectSubdir(project.id, 'music'), project.audioMix.musicTrack.fileName))
          .catch(() => undefined);
      }
      project.audioMix.musicTrack = track;
      project.audioMix.musicEnabled = true;
      await saveProject(project);
      res.json({ project, track });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to create ambient music track.',
      });
    }
  });

  // Upload Custom Background Music
  router.post(
    '/projects/:id/music/upload',
    express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '50mb' }),
    async (req, res) => {
      const project = await getProject(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (buf.length < 128) {
        res.status(400).json({ error: 'Uploaded music file is empty or invalid.' });
        return;
      }
      const originalName =
        typeof req.query.filename === 'string' && req.query.filename.trim()
          ? path.basename(req.query.filename.trim())
          : 'music.mp3';
      const ext = getSafeExt(originalName, '.mp3');
      const musicDir = getProjectSubdir(project.id, 'music');
      await fsp.mkdir(musicDir, { recursive: true });

      const storedFileName = `bgm_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const storedPath = path.join(musicDir, storedFileName);
      await fsp.writeFile(storedPath, buf);
      const durationMs = await probeAudioDurationMs(storedPath);

      if (project.audioMix.musicTrack?.fileName) {
        await fsp
          .unlink(path.join(musicDir, project.audioMix.musicTrack.fileName))
          .catch(() => undefined);
      }

      const track: AudioTrackAsset = {
        id: `trk_${crypto.randomUUID().slice(0, 8)}`,
        name: originalName,
        fileName: storedFileName,
        audioUrl: `/api/yt/projects/${project.id}/media/music/${storedFileName}`,
        durationMs,
        sizeBytes: buf.length,
        source: 'upload',
      };
      project.audioMix.musicTrack = track;
      project.audioMix.musicEnabled = true;
      await saveProject(project);
      res.json({ project, track });
    }
  );

  // Upload Sound Effect Cue
  router.post(
    '/projects/:id/sfx/upload',
    express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '25mb' }),
    async (req, res) => {
      const project = await getProject(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (buf.length < 64) {
        res.status(400).json({ error: 'Uploaded SFX file is invalid.' });
        return;
      }
      const originalName =
        typeof req.query.filename === 'string' && req.query.filename.trim()
          ? path.basename(req.query.filename.trim())
          : 'sfx.mp3';
      const startMs = Math.max(0, Math.round(Number(req.query.startMs) || 0));
      const ext = getSafeExt(originalName, '.mp3');
      const sfxDir = getProjectSubdir(project.id, 'sfx');
      await fsp.mkdir(sfxDir, { recursive: true });

      const storedFileName = `sfx_${crypto.randomUUID().slice(0, 8)}${ext}`;
      await fsp.writeFile(path.join(sfxDir, storedFileName), buf);

      const sfxCue: SoundEffectCue = {
        id: `sfx_${crypto.randomUUID().slice(0, 8)}`,
        name: originalName,
        fileName: storedFileName,
        audioUrl: `/api/yt/projects/${project.id}/media/sfx/${storedFileName}`,
        startMs,
        volume: 0.75,
        sizeBytes: buf.length,
      };
      project.audioMix.soundEffects.push(sfxCue);
      await saveProject(project);
      res.json({ project, sfxCue });
    }
  );

  // Download Subtitles directly (SRT or VTT)
  router.get('/projects/:id/subtitles/export/:format', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const cues = project.voiceover.cues || [];
    if (cues.length === 0) {
      res.status(400).json({ error: 'No analyzed subtitle cues available.' });
      return;
    }
    const fmt = req.params.format === 'vtt' ? 'vtt' : 'srt';
    const content = fmt === 'vtt' ? buildVttContent(cues) : buildSrtContent(cues);
    const slug =
      project.settings.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 28) || 'subtitles';
    res.setHeader('Content-Type', fmt === 'vtt' ? 'text/vtt; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.${fmt}"`);
    res.send(content);
  });

  // Start Background Video Assembly & MP4 Export
  router.post('/projects/:id/render/start', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    try {
      const { jobId } = startBackgroundVideoRender(project.id, req.body || {});
      res.status(202).json({ jobId, status: 'started' });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
          ? err.status
          : 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Unable to start video render.',
      });
    }
  });

  // Cancel Running Render Safely
  router.post('/projects/:id/render/cancel', async (req, res) => {
    const cancelled = cancelRenderJob(req.params.id);
    res.json({ cancelled });
  });

  // Download Exported MP4 as Attachment
  router.get('/projects/:id/exports/:filename/download', async (req, res) => {
    const project = await getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const safeFile = path.basename(req.params.filename);
    const fullPath = path.join(getProjectSubdir(project.id, 'exports'), safeFile);
    streamFileWithRange(req, res, fullPath, safeFile);
  });

  // Stream Persistent Media (Audio / Images / Music / SFX / Exports) with HTTP Range Support
  router.get('/projects/:id/media/:folder/:filename', async (req, res) => {
    const folder = req.params.folder;
    if (!['audio', 'images', 'music', 'sfx', 'exports'].includes(folder)) {
      res.status(400).json({ error: 'Invalid media folder.' });
      return;
    }
    const safeFile = path.basename(req.params.filename);
    const fullPath = path.join(
      getProjectSubdir(req.params.id, folder as 'audio' | 'images' | 'music' | 'sfx' | 'exports'),
      safeFile
    );
    streamFileWithRange(req, res, fullPath);
  });

  return router;
}
