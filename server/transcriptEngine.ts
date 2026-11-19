import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI, Type } from '@google/genai';
import { resolveProviderCredentials } from './aiProviderStore.ts';
import type { AudioFormat } from './ttsEngine.ts';

const execFileAsync = promisify(execFile);

export type TranscriptSource = 'segment-exact' | 'fish-asr' | 'gemini-ai' | 'acoustic-align';
export type TranscriptExtractionMode = 'auto' | 'fish-asr' | 'gemini' | 'acoustic';

export interface TranscriptCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SpeechInterval {
  startMs: number;
  endMs: number;
}

export function stripExpressionTags(raw: string): string {
  return raw
    .replace(/\[[^\]]{1,120}\]/g, ' ')
    .replace(/\([a-zA-Z\s,_-]{1,40}\)/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitCaptionSentences(rawText: string, maxCueChars = 140): string[] {
  const clean = stripExpressionTags(rawText);
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const cues: string[] = [];

  for (const para of paragraphs) {
    const sentences = para.split(/(?<=[.!?؟۔…])\s+/);
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;
      if (s.length <= maxCueChars) {
        cues.push(s);
        continue;
      }

      // Softly break very long sentences along clauses for clean subtitle readability
      const clauses = s.split(/(?<=[،,;؛:—-])\s+/);
      let buf = '';
      for (const clause of clauses) {
        const c = clause.trim();
        if (!c) continue;
        const candidate = buf ? `${buf} ${c}` : c;
        if (candidate.length <= maxCueChars) {
          buf = candidate;
        } else {
          if (buf) cues.push(buf);
          if (c.length <= maxCueChars) {
            buf = c;
          } else {
            // Word wrap fallback
            const words = c.split(/\s+/);
            let wbuf = '';
            for (const w of words) {
              const cand = wbuf ? `${wbuf} ${w}` : w;
              if (cand.length <= maxCueChars) {
                wbuf = cand;
              } else {
                if (wbuf) cues.push(wbuf);
                wbuf = w;
              }
            }
            buf = wbuf;
          }
        }
      }
      if (buf) cues.push(buf);
    }
  }

  return cues.filter(Boolean);
}

export async function measureAudioFileDurationMs(
  filePath: string,
  format: AudioFormat,
  sampleRate: number | null
): Promise<number> {
  if (format === 'pcm') {
    const stat = await fsp.stat(filePath);
    const sr = sampleRate || 44100;
    return Math.max(100, Math.round((stat.size / (sr * 2)) * 1000));
  }

  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    { maxBuffer: 1024 * 256 }
  );
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 1000;
  }
  return Math.max(100, Math.round(seconds * 1000));
}

export async function measureBufferDurationMs(
  buf: Buffer,
  format: AudioFormat,
  sampleRate: number | null,
  tmpRootDir: string
): Promise<number> {
  if (format === 'pcm') {
    const sr = sampleRate || 44100;
    return Math.max(100, Math.round((buf.length / (sr * 2)) * 1000));
  }

  await fsp.mkdir(tmpRootDir, { recursive: true });
  const ext = format === 'opus' ? 'ogg' : format;
  const tmpFile = path.join(tmpRootDir, `probe_${crypto.randomUUID()}.${ext}`);
  try {
    await fsp.writeFile(tmpFile, buf);
    return await measureAudioFileDurationMs(tmpFile, format, sampleRate);
  } finally {
    await fsp.unlink(tmpFile).catch(() => undefined);
  }
}

export function buildTranscriptFromSegments(
  segmentTexts: string[],
  durationsMs: number[],
  pauseMs: number
): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  let cursorMs = 0;

  for (let i = 0; i < segmentTexts.length; i++) {
    const segDurationMs = Math.max(200, Math.round(durationsMs[i] || 1000));
    const segStartMs = cursorMs;
    const segEndMs = segStartMs + segDurationMs;
    const lines = splitCaptionSentences(segmentTexts[i], 140);

    if (lines.length === 0) {
      // Expression-only cue or empty spoken text; advance timeline cleanly
      cursorMs = segEndMs + (i < segmentTexts.length - 1 ? pauseMs : 0);
      continue;
    }

    if (lines.length === 1) {
      cues.push({
        index: cues.length + 1,
        startMs: segStartMs,
        endMs: segEndMs,
        text: lines[0],
      });
    } else {
      const weights = lines.map((line) => Math.max(4, line.replace(/\s+/g, '').length));
      const totalWeight = weights.reduce((acc, w) => acc + w, 0);
      let lineStart = segStartMs;

      for (let j = 0; j < lines.length; j++) {
        const isLast = j === lines.length - 1;
        const shareMs = isLast
          ? Math.max(150, segEndMs - lineStart)
          : Math.max(200, Math.round((weights[j] / totalWeight) * segDurationMs));
        const lineEnd = isLast ? segEndMs : Math.min(segEndMs, lineStart + shareMs);

        cues.push({
          index: cues.length + 1,
          startMs: lineStart,
          endMs: Math.max(lineStart + 100, lineEnd),
          text: lines[j],
        });
        lineStart = lineEnd;
      }
    }

    cursorMs = segEndMs + (i < segmentTexts.length - 1 ? pauseMs : 0);
  }

  return cues;
}

export async function detectSpeechIntervals(
  filePath: string,
  format: AudioFormat,
  sampleRate: number | null,
  totalDurationMs: number
): Promise<SpeechInterval[]> {
  try {
    const inputArgs =
      format === 'pcm'
        ? ['-f', 's16le', '-ar', String(sampleRate || 44100), '-ac', '1', '-i', filePath]
        : ['-i', filePath];

    const { stderr } = await execFileAsync(
      'ffmpeg',
      [...inputArgs, '-af', 'silencedetect=noise=-30dB:d=0.10', '-f', 'null', '-'],
      { maxBuffer: 1024 * 1024 * 8 }
    );

    const silences: Array<{ startMs: number; endMs: number }> = [];
    let pendingStartMs: number | null = null;

    for (const line of stderr.split('\n')) {
      const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
      if (startMatch) {
        pendingStartMs = Math.round(Number(startMatch[1]) * 1000);
        continue;
      }
      const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
      if (endMatch) {
        const endMs = Math.round(Number(endMatch[1]) * 1000);
        const startMs = pendingStartMs ?? 0;
        if (endMs > startMs) {
          silences.push({ startMs, endMs });
        }
        pendingStartMs = null;
      }
    }
    if (pendingStartMs !== null && totalDurationMs > pendingStartMs) {
      silences.push({ startMs: pendingStartMs, endMs: totalDurationMs });
    }

    if (silences.length === 0) {
      return [{ startMs: 0, endMs: totalDurationMs }];
    }

    const speech: SpeechInterval[] = [];
    let cursor = 0;
    for (const sil of silences) {
      if (sil.startMs > cursor + 80) {
        speech.push({ startMs: cursor, endMs: sil.startMs });
      }
      cursor = Math.max(cursor, sil.endMs);
    }
    if (totalDurationMs > cursor + 80) {
      speech.push({ startMs: cursor, endMs: totalDurationMs });
    }

    return speech.length > 0 ? speech : [{ startMs: 0, endMs: totalDurationMs }];
  } catch {
    return [{ startMs: 0, endMs: totalDurationMs }];
  }
}

export function alignTextToSpeechIntervals(
  text: string,
  intervals: SpeechInterval[],
  totalDurationMs: number
): TranscriptCue[] {
  const lines = splitCaptionSentences(text, 140);
  if (lines.length === 0) return [];

  const safeIntervals =
    intervals.length > 0 ? intervals : [{ startMs: 0, endMs: Math.max(500, totalDurationMs) }];
  const totalSpeechMs = safeIntervals.reduce(
    (sum, iv) => sum + Math.max(100, iv.endMs - iv.startMs),
    0
  );

  // Map cumulative spoken timeline position [0 .. totalSpeechMs] -> actual audio timestamp (ms)
  const speechPosToAudioMs = (speechPos: number): number => {
    const clamped = Math.max(0, Math.min(totalSpeechMs, speechPos));
    let remaining = clamped;
    for (const iv of safeIntervals) {
      const len = Math.max(100, iv.endMs - iv.startMs);
      if (remaining <= len) {
        return Math.round(iv.startMs + remaining);
      }
      remaining -= len;
    }
    return safeIntervals[safeIntervals.length - 1].endMs;
  };

  const weights = lines.map((l) => Math.max(4, l.replace(/\s+/g, '').length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  const cues: TranscriptCue[] = [];
  let accumWeight = 0;

  for (let i = 0; i < lines.length; i++) {
    const startSpeechPos = (accumWeight / totalWeight) * totalSpeechMs;
    accumWeight += weights[i];
    const endSpeechPos = (accumWeight / totalWeight) * totalSpeechMs;

    const startMs = speechPosToAudioMs(startSpeechPos);
    const rawEndMs = i === lines.length - 1 ? safeIntervals[safeIntervals.length - 1].endMs : speechPosToAudioMs(endSpeechPos);
    const endMs = Math.max(startMs + 150, rawEndMs);

    cues.push({
      index: i + 1,
      startMs,
      endMs,
      text: lines[i],
    });
  }

  return cues;
}

async function transcribeWithFishAsr(
  filePath: string,
  format: AudioFormat,
  apiKey: string
): Promise<TranscriptCue[]> {
  const bytes = await fsp.readFile(filePath);
  const mimeType =
    format === 'mp3'
      ? 'audio/mpeg'
      : format === 'wav'
        ? 'audio/wav'
        : format === 'opus'
          ? 'audio/ogg'
          : 'application/octet-stream';

  const form = new FormData();
  form.append('audio', new Blob([bytes], { type: mimeType }), path.basename(filePath));
  form.append('ignore_timestamps', 'false');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch('https://api.fish.audio/v1/asr', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        model: 'transcribe-1-pro',
      },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      let msg = `Fish Audio ASR failed (${res.status})`;
      try {
        const errJson = (await res.json()) as Record<string, unknown>;
        if (typeof errJson.message === 'string' && errJson.message) msg = errJson.message;
        else if (typeof errJson.detail === 'string' && errJson.detail) msg = errJson.detail;
      } catch {
        // Ignore parse error
      }
      throw Object.assign(new Error(msg), { status: res.status });
    }

    const data = (await res.json()) as {
      text?: string;
      segments?: Array<{ text?: string; start?: number; end?: number }>;
    };

    const segments = Array.isArray(data.segments) ? data.segments : [];
    const cues: TranscriptCue[] = segments
      .map((seg, idx) => {
        const text = typeof seg.text === 'string' ? seg.text.trim() : '';
        const startSec = typeof seg.start === 'number' ? seg.start : 0;
        const endSec = typeof seg.end === 'number' ? seg.end : startSec + 1;
        return {
          index: idx + 1,
          startMs: Math.max(0, Math.round(startSec * 1000)),
          endMs: Math.max(Math.round(startSec * 1000) + 100, Math.round(endSec * 1000)),
          text,
        };
      })
      .filter((c) => Boolean(c.text));

    if (cues.length === 0) {
      throw Object.assign(new Error('Fish Audio ASR returned no timestamped segments.'), {
        status: 500,
      });
    }

    return cues;
  } finally {
    clearTimeout(timeout);
  }
}

async function transcribeWithGemini(
  filePath: string,
  format: AudioFormat,
  referenceText: string,
  totalDurationMs: number,
  tmpRootDir: string
): Promise<TranscriptCue[]> {
  const creds = await resolveProviderCredentials('gemini');
  const apiKey = creds.apiKey?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw Object.assign(
      new Error('Google Gemini API key is not configured. Configure it in Settings > AI Providers & API Keys.'),
      { status: 400 }
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Ensure audio is MP3 and split into <= 8-minute chunks for reliable inline base64 alignment
  const jobDir = path.join(tmpRootDir, `gemini_asr_${crypto.randomUUID()}`);
  await fsp.mkdir(jobDir, { recursive: true });

  try {
    const chunkDurationSec = 480;
    const chunkPattern = path.join(jobDir, 'part_%03d.mp3');
    const sourceArgs =
      format === 'pcm' ? ['-f', 's16le', '-ar', '44100', '-ac', '1', '-i', filePath] : ['-i', filePath];

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        ...sourceArgs,
        '-f',
        'segment',
        '-segment_time',
        String(chunkDurationSec),
        '-c:a',
        'libmp3lame',
        '-b:a',
        '64k',
        chunkPattern,
      ],
      { maxBuffer: 1024 * 1024 }
    );

    const files = (await fsp.readdir(jobDir)).filter((f) => f.endsWith('.mp3')).sort();
    const allCues: TranscriptCue[] = [];
    let offsetMs = 0;

    for (let i = 0; i < files.length; i++) {
      const partPath = path.join(jobDir, files[i]);
      const partDurMs = await measureAudioFileDurationMs(partPath, 'mp3', null);
      const audioB64 = (await fsp.readFile(partPath)).toString('base64');

      const promptParts: string[] = [
        `Transcribe this audio recording into accurate sentence-level subtitle cues with exact startMs and endMs timestamps (relative to this audio clip, 0 to ${partDurMs} ms).`,
        'Preserve the exact spoken language (Arabic, English, Spanish, French, etc.) and exclude any bracketed stage cues if not spoken aloud.',
      ];
      if (files.length === 1 && referenceText.trim()) {
        promptParts.push(
          `Reference script for spelling accuracy:\n"""\n${stripExpressionTags(referenceText).slice(0, 8000)}\n"""`
        );
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/mp3',
                data: audioB64,
              },
            },
            { text: promptParts.join('\n\n') },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startMs: { type: Type.INTEGER },
                    endMs: { type: Type.INTEGER },
                    text: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        cues?: Array<{ startMs?: number; endMs?: number; text?: string }>;
      };
      const rawCues = Array.isArray(parsed.cues) ? parsed.cues : [];

      for (const c of rawCues) {
        const text = typeof c.text === 'string' ? c.text.trim() : '';
        if (!text) continue;
        const localStart = Math.max(0, Math.min(partDurMs, Math.round(Number(c.startMs) || 0)));
        const localEnd = Math.max(
          localStart + 120,
          Math.min(partDurMs, Math.round(Number(c.endMs) || localStart + 1000))
        );
        allCues.push({
          index: allCues.length + 1,
          startMs: offsetMs + localStart,
          endMs: Math.min(totalDurationMs, offsetMs + localEnd),
          text,
        });
      }

      offsetMs += partDurMs;
    }

    if (allCues.length === 0) {
      throw Object.assign(new Error('Gemini returned no timestamped cues.'), { status: 500 });
    }
    return allCues;
  } finally {
    await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function extractTranscriptForRecord(options: {
  filePath: string;
  format: AudioFormat;
  sampleRate: number | null;
  text: string;
  mode: TranscriptExtractionMode;
  fishApiKey: string | null;
  tmpRootDir: string;
}): Promise<{
  cues: TranscriptCue[];
  source: TranscriptSource;
  durationSeconds: number;
}> {
  const { filePath, format, sampleRate, text, mode, fishApiKey, tmpRootDir } = options;
  const totalDurationMs = await measureAudioFileDurationMs(filePath, format, sampleRate);
  const durationSeconds = Number((totalDurationMs / 1000).toFixed(2));

  if (mode === 'fish-asr') {
    if (!fishApiKey) {
      throw Object.assign(new Error('Fish Audio API key is required for Fish ASR.'), { status: 401 });
    }
    const cues = await transcribeWithFishAsr(filePath, format, fishApiKey);
    return { cues, source: 'fish-asr', durationSeconds };
  }

  if (mode === 'gemini') {
    const cues = await transcribeWithGemini(filePath, format, text, totalDurationMs, tmpRootDir);
    return { cues, source: 'gemini-ai', durationSeconds };
  }

  if (mode === 'auto') {
    const geminiCreds = await resolveProviderCredentials('gemini');
    const hasGeminiKey = Boolean(geminiCreds.apiKey && geminiCreds.apiKey !== 'MY_GEMINI_API_KEY');
    if (hasGeminiKey) {
      try {
        const cues = await transcribeWithGemini(filePath, format, text, totalDurationMs, tmpRootDir);
        return { cues, source: 'gemini-ai', durationSeconds };
      } catch {
        // Fall through to acoustic speech alignment
      }
    }
    if (fishApiKey) {
      try {
        const stat = await fsp.stat(filePath);
        if (stat.size <= 24 * 1024 * 1024) {
          const cues = await transcribeWithFishAsr(filePath, format, fishApiKey);
          return { cues, source: 'fish-asr', durationSeconds };
        }
      } catch {
        // Fall through to local acoustic alignment
      }
    }
  }

  // Acoustic speech-activity + reference script alignment (always available offline & instant)
  const intervals = await detectSpeechIntervals(filePath, format, sampleRate, totalDurationMs);
  const cues = alignTextToSpeechIntervals(text, intervals, totalDurationMs);
  return { cues, source: 'acoustic-align', durationSeconds };
}
