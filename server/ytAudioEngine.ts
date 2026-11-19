import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  buildTranscriptFromSegments,
  detectSpeechIntervals,
  extractTranscriptForRecord,
  measureAudioFileDurationMs,
  measureBufferDurationMs,
  stripExpressionTags,
  type TranscriptCue,
  type TranscriptExtractionMode,
} from './transcriptEngine.ts';
import {
  splitTextIntoSegments,
  stitchAudioSegments,
  type AudioFormat,
} from './ttsEngine.ts';
import { getProjectSubdir } from './ytStorage.ts';
import type {
  PronunciationRule,
  ScriptChapter,
  VoiceoverChapterAudio,
  VoiceoverSettings,
  WordTimestamp,
  YouTubeProject,
} from './ytTypes.ts';

const FISH_API_BASE = 'https://api.fish.audio';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyPronunciationRules(text: string, rules: PronunciationRule[]): string {
  let out = text;
  for (const rule of rules) {
    const from = rule.from?.trim();
    const to = rule.to?.trim();
    if (!from || !to) continue;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = rule.caseSensitive ? 'g' : 'gi';
    out = out.replace(new RegExp(`\\b${escaped}\\b|${escaped}`, flags), to);
  }
  return out;
}

async function synthesizeFishSegmentBuffer(params: {
  text: string;
  apiKey: string;
  settings: VoiceoverSettings;
  signal: AbortSignal;
}): Promise<Buffer> {
  const { text, apiKey, settings, signal } = params;
  const format: AudioFormat = settings.format === 'pcm' ? 'mp3' : settings.format;

  const payload: Record<string, unknown> = {
    text,
    format,
    chunk_length: Math.round(clamp(settings.chunkLength || 200, 100, 300)),
    normalize: settings.normalize !== false,
    latency: settings.latency === 'normal' ? 'normal' : 'balanced',
    temperature: Number(clamp(settings.temperature ?? 0.7, 0, 1).toFixed(2)),
    top_p: Number(clamp(settings.topP ?? 0.7, 0, 1).toFixed(2)),
    repetition_penalty: Number(clamp(settings.repetitionPenalty ?? 1.2, 0.9, 2.0).toFixed(2)),
    prosody: {
      speed: Number(clamp(settings.speed ?? 1.0, 0.5, 2.0).toFixed(2)),
      volume: Number(clamp(settings.volume ?? 0.0, -20, 20).toFixed(1)),
    },
  };

  if (settings.voiceId) payload.reference_id = settings.voiceId;
  if (settings.sampleRate) payload.sample_rate = settings.sampleRate;
  if (format === 'mp3') payload.mp3_bitrate = settings.mp3Bitrate || 128;
  else if (format === 'opus') payload.opus_bitrate = 48;

  const maxAttempts = 4;
  let lastError = 'Fish Audio synthesis failed.';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) {
      throw Object.assign(new Error('Voiceover generation cancelled.'), { status: 499 });
    }
    const segController = new AbortController();
    const onParentAbort = () => segController.abort();
    signal.addEventListener('abort', onParentAbort, { once: true });
    const timeout = setTimeout(() => segController.abort(), 65000);

    try {
      const fishRes = await fetch(`${FISH_API_BASE}/v1/tts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          model: settings.model || 's2.1-pro-free',
        },
        body: JSON.stringify(payload),
        signal: segController.signal,
      });

      if (!fishRes.ok) {
        let msg = `Fish Audio API error (${fishRes.status})`;
        try {
          const data = (await fishRes.json()) as Record<string, unknown>;
          if (typeof data.message === 'string') msg = data.message;
          else if (typeof data.detail === 'string') msg = data.detail;
        } catch {
          // Ignore parse error
        }
        lastError = msg;

        if (fishRes.status === 429 && attempt < maxAttempts) {
          const retryAfter = Number(fishRes.headers.get('retry-after'));
          const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * attempt;
          await new Promise((r) => setTimeout(r, Math.min(8000, delayMs)));
          continue;
        }
        if (fishRes.status >= 500 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          continue;
        }
        throw Object.assign(new Error(msg), { status: fishRes.status });
      }

      const buf = Buffer.from(await fishRes.arrayBuffer());
      if (buf.length === 0) {
        if (attempt < maxAttempts) continue;
        throw new Error('Fish Audio returned empty audio.');
      }
      return buf;
    } catch (err) {
      if (signal.aborted) {
        throw Object.assign(new Error('Voiceover generation cancelled.'), { status: 499 });
      }
      if (err instanceof Error && 'status' in err) throw err;
      lastError =
        err instanceof Error && err.name === 'AbortError'
          ? 'Fish Audio segment timed out.'
          : 'Network error connecting to Fish Audio.';
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw Object.assign(new Error(lastError), { status: 500 });
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onParentAbort);
    }
  }

  throw new Error(lastError);
}

/**
 * Generates word-level timestamps distributed proportionally across spoken cues.
 */
export function buildWordTimestampsFromCues(cues: TranscriptCue[]): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  for (const cue of cues) {
    const clean = stripExpressionTags(cue.text);
    const tokens = clean.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const totalDur = Math.max(120, cue.endMs - cue.startMs);
    const weights = tokens.map((t) => Math.max(1.5, t.replace(/[^\p{L}\p{N}]/gu, '').length));
    const sumW = weights.reduce((a, b) => a + b, 0);

    let cursor = cue.startMs;
    for (let i = 0; i < tokens.length; i++) {
      const isLast = i === tokens.length - 1;
      const wDur = isLast
        ? Math.max(40, cue.endMs - cursor)
        : Math.max(40, Math.round((weights[i] / sumW) * totalDur));
      const endMs = isLast ? cue.endMs : Math.min(cue.endMs, cursor + wDur);
      words.push({
        word: tokens[i],
        startMs: cursor,
        endMs: Math.max(cursor + 40, endMs),
      });
      cursor = endMs;
    }
  }
  return words;
}

export interface ChapterSynthesisInput {
  chapterId: string;
  chapterTitle: string;
  rawText: string;
}

export function buildNarrationSectionsFromScript(project: YouTubeProject): ChapterSynthesisInput[] {
  if (!project.script) return [];
  const sections: ChapterSynthesisInput[] = [];

  if (project.script.hook.trim()) {
    sections.push({
      chapterId: 'hook',
      chapterTitle: 'Opening Hook',
      rawText: project.script.hook.trim(),
    });
  }
  if (project.script.introduction.trim()) {
    sections.push({
      chapterId: 'intro',
      chapterTitle: 'Introduction',
      rawText: project.script.introduction.trim(),
    });
  }
  for (const ch of project.script.chapters) {
    if (ch.content.trim()) {
      sections.push({
        chapterId: ch.id,
        chapterTitle: `Ch. ${ch.index}: ${ch.title}`,
        rawText: ch.content.trim(),
      });
    }
  }
  if (project.script.conclusion.trim()) {
    sections.push({
      chapterId: 'conclusion',
      chapterTitle: 'Conclusion',
      rawText: project.script.conclusion.trim(),
    });
  }

  return sections;
}

export async function generateProjectVoiceover(params: {
  project: YouTubeProject;
  apiKey: string;
  targetChapterId?: string;
  signal: AbortSignal;
  onProgress?: (event: {
    phase: 'synthesizing' | 'stitching' | 'analyzing';
    completedSegments: number;
    totalSegments: number;
    chapterTitle?: string;
  }) => void;
}): Promise<{
  audioFileName: string;
  audioUrl: string;
  downloadUrl: string;
  format: AudioFormat;
  durationMs: number;
  fileSizeBytes: number;
  cues: TranscriptCue[];
  words: WordTimestamp[];
  chapterAudios: VoiceoverChapterAudio[];
  charactersSent: number;
  requestsSent: number;
}> {
  const { project, apiKey, targetChapterId, signal, onProgress } = params;
  const sections = buildNarrationSectionsFromScript(project);
  if (sections.length === 0) {
    throw Object.assign(new Error('No script content found to generate voiceover.'), { status: 400 });
  }

  const audioDir = getProjectSubdir(project.id, 'audio');
  const tmpDir = path.join(audioDir, 'tmp');
  await fsp.mkdir(tmpDir, { recursive: true });

  const settings = project.voiceoverSettings;
  const format: AudioFormat = settings.format === 'pcm' ? 'mp3' : settings.format || 'mp3';
  const ext = format === 'opus' ? 'ogg' : format;
  const pauseMs = settings.segmentPauseMs ?? 150;
  const concurrency = clamp(settings.parallelConcurrency || 2, 1, 3);

  const sectionsToSynthesize = targetChapterId
    ? sections.filter((s) => s.chapterId === targetChapterId)
    : sections;

  if (sectionsToSynthesize.length === 0) {
    throw Object.assign(new Error('Requested chapter was not found in the script.'), { status: 404 });
  }

  // Split each target section into Fish Audio segments
  const sectionTasks = sectionsToSynthesize.map((sec) => {
    const processed = applyPronunciationRules(sec.rawText, settings.pronunciationRules || []);
    const segments = splitTextIntoSegments(processed, 480);
    return { ...sec, segments };
  });

  const totalSegments = sectionTasks.reduce((sum, s) => sum + s.segments.length, 0);
  let completedSegments = 0;
  let charactersSent = 0;
  let requestsSent = 0;

  onProgress?.({
    phase: 'synthesizing',
    completedSegments: 0,
    totalSegments,
    chapterTitle: sectionTasks[0]?.chapterTitle,
  });

  const existingMap = new Map<string, VoiceoverChapterAudio>();
  for (const existing of project.voiceover.chapterAudios || []) {
    existingMap.set(existing.chapterId, existing);
  }

  for (const task of sectionTasks) {
    const buffers: Buffer[] = new Array(task.segments.length);
    let nextIdx = 0;

    const worker = async () => {
      while (true) {
        if (signal.aborted) return;
        const idx = nextIdx++;
        if (idx >= task.segments.length) return;
        const segText = task.segments[idx];
        charactersSent += segText.length;
        requestsSent += 1;

        buffers[idx] = await synthesizeFishSegmentBuffer({
          text: segText,
          apiKey,
          settings,
          signal,
        });
        completedSegments += 1;
        onProgress?.({
          phase: 'synthesizing',
          completedSegments,
          totalSegments,
          chapterTitle: task.chapterTitle,
        });
      }
    };

    const activeWorkers = Math.min(concurrency, task.segments.length);
    await Promise.all(Array.from({ length: activeWorkers }, () => worker()));
    if (signal.aborted) {
      throw Object.assign(new Error('Voiceover generation cancelled.'), { status: 499 });
    }

    const [stitchedSectionBuf, segDurations] = await Promise.all([
      stitchAudioSegments({
        buffers,
        format,
        sampleRate: settings.sampleRate,
        mp3Bitrate: settings.mp3Bitrate || 128,
        opusBitrate: 48,
        pauseMs,
        tmpRootDir: tmpDir,
      }),
      Promise.all(
        buffers.map((b) => measureBufferDurationMs(b, format, settings.sampleRate, tmpDir))
      ),
    ]);

    const chapterFileName = `chapter_${task.chapterId}_${crypto.randomUUID().slice(0, 6)}.${ext}`;
    const chapterPath = path.join(audioDir, chapterFileName);
    await fsp.writeFile(chapterPath, stitchedSectionBuf);

    // Clean up old file if replaced
    const prev = existingMap.get(task.chapterId);
    if (prev && prev.fileName !== chapterFileName) {
      await fsp.unlink(path.join(audioDir, prev.fileName)).catch(() => undefined);
    }

    const chapterDurationMs = await measureAudioFileDurationMs(
      chapterPath,
      format,
      settings.sampleRate
    );
    const localCues = buildTranscriptFromSegments(
      task.segments,
      segDurations,
      task.segments.length > 1 ? pauseMs : 0
    );

    existingMap.set(task.chapterId, {
      chapterId: task.chapterId,
      chapterTitle: task.chapterTitle,
      fileName: chapterFileName,
      audioUrl: `/api/yt/projects/${project.id}/media/audio/${chapterFileName}`,
      durationMs: chapterDurationMs,
      fileSizeBytes: stitchedSectionBuf.length,
      generatedAt: new Date().toISOString(),
      cues: localCues,
    });
  }

  // Stitch all existing chapter audios in exact script order to build the complete master voiceover
  onProgress?.({
    phase: 'stitching',
    completedSegments: totalSegments,
    totalSegments,
  });

  const orderedChapterAudios: VoiceoverChapterAudio[] = [];
  const chapterBuffers: Buffer[] = [];
  for (const sec of sections) {
    const chAudio = existingMap.get(sec.chapterId);
    if (!chAudio) continue;
    const chPath = path.join(audioDir, chAudio.fileName);
    const buf = await fsp.readFile(chPath).catch(() => null);
    if (!buf) continue;
    orderedChapterAudios.push(chAudio);
    chapterBuffers.push(buf);
  }

  if (chapterBuffers.length === 0) {
    throw new Error('No chapter audio buffers available to stitch.');
  }

  const chapterPauseMs = 350;
  const masterBuffer = await stitchAudioSegments({
    buffers: chapterBuffers,
    format,
    sampleRate: settings.sampleRate,
    mp3Bitrate: settings.mp3Bitrate || 128,
    opusBitrate: 48,
    pauseMs: chapterBuffers.length > 1 ? chapterPauseMs : 0,
    tmpRootDir: tmpDir,
  });

  const masterFileName = `voiceover_master_${crypto.randomUUID().slice(0, 6)}.${ext}`;
  const masterPath = path.join(audioDir, masterFileName);
  await fsp.writeFile(masterPath, masterBuffer);

  if (project.voiceover.audioFileName && project.voiceover.audioFileName !== masterFileName) {
    await fsp.unlink(path.join(audioDir, project.voiceover.audioFileName)).catch(() => undefined);
  }

  onProgress?.({
    phase: 'analyzing',
    completedSegments: totalSegments,
    totalSegments,
  });

  const totalDurationMs = await measureAudioFileDurationMs(
    masterPath,
    format,
    settings.sampleRate
  );

  // Build exact timeline cues from stitched chapter durations + real offsets
  const masterCues: TranscriptCue[] = [];
  let offsetMs = 0;
  for (let i = 0; i < orderedChapterAudios.length; i++) {
    const chAudio = orderedChapterAudios[i];
    for (const cue of chAudio.cues) {
      masterCues.push({
        index: masterCues.length + 1,
        startMs: offsetMs + cue.startMs,
        endMs: Math.min(totalDurationMs, offsetMs + cue.endMs),
        text: cue.text,
      });
    }
    offsetMs += chAudio.durationMs + (i < orderedChapterAudios.length - 1 ? chapterPauseMs : 0);
  }

  const words = buildWordTimestampsFromCues(masterCues);

  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);

  const safeSlug =
    project.settings.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'voiceover';

  return {
    audioFileName: masterFileName,
    audioUrl: `/api/yt/projects/${project.id}/media/audio/${masterFileName}`,
    downloadUrl: `/api/yt/projects/${project.id}/voiceover/download/${safeSlug}-voiceover.${ext}`,
    format,
    durationMs: totalDurationMs,
    fileSizeBytes: masterBuffer.length,
    cues: masterCues,
    words,
    chapterAudios: orderedChapterAudios,
    charactersSent,
    requestsSent,
  };
}

export async function analyzeProjectVoiceoverAudio(params: {
  project: YouTubeProject;
  mode: TranscriptExtractionMode;
  fishApiKey: string | null;
}): Promise<{
  durationMs: number;
  cues: TranscriptCue[];
  words: WordTimestamp[];
  source: 'segment-exact' | 'fish-asr' | 'gemini-ai' | 'acoustic-align';
  pauseIntervalsCount: number;
}> {
  const { project, mode, fishApiKey } = params;
  if (!project.voiceover.audioFileName) {
    throw Object.assign(new Error('No generated voiceover audio file found to analyze.'), { status: 400 });
  }

  const audioDir = getProjectSubdir(project.id, 'audio');
  const filePath = path.join(audioDir, project.voiceover.audioFileName);
  const format = project.voiceover.format || 'mp3';
  const sampleRate = project.voiceoverSettings.sampleRate || 44100;
  const durationMs = await measureAudioFileDurationMs(filePath, format, sampleRate);

  const speechIntervals = await detectSpeechIntervals(filePath, format, sampleRate, durationMs);
  const pauseIntervalsCount = Math.max(0, speechIntervals.length - 1);

  // Full spoken script text
  const fullText = buildNarrationSectionsFromScript(project)
    .map((s) => s.rawText)
    .join('\n\n');

  const tmpDir = path.join(audioDir, 'tmp_analyze');
  const result = await extractTranscriptForRecord({
    filePath,
    format,
    sampleRate,
    text: fullText,
    mode,
    fishApiKey,
    tmpRootDir: tmpDir,
  });

  const words = buildWordTimestampsFromCues(result.cues);
  return {
    durationMs,
    cues: result.cues,
    words,
    source: result.source,
    pauseIntervalsCount,
  };
}
