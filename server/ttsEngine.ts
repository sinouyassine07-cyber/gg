import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type AudioFormat = 'mp3' | 'wav' | 'opus' | 'pcm';

const DEFAULT_SEGMENT_MAX_CHARS = 480;

function splitLongPiece(piece: string, maxChars: number): string[] {
  const trimmed = piece.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  // Try clause boundaries first (English & Arabic punctuation)
  const clauseParts = trimmed.split(/(?<=[،,;؛:—\-])\s+/);
  const results: string[] = [];
  let current = '';

  const pushWordSplit = (text: string) => {
    const words = text.split(/\s+/);
    let buf = '';
    for (const word of words) {
      if (!word) continue;
      if (word.length > maxChars) {
        if (buf) {
          results.push(buf);
          buf = '';
        }
        for (let i = 0; i < word.length; i += maxChars) {
          results.push(word.slice(i, i + maxChars));
        }
        continue;
      }
      const candidate = buf ? `${buf} ${word}` : word;
      if (candidate.length <= maxChars) {
        buf = candidate;
      } else {
        if (buf) results.push(buf);
        buf = word;
      }
    }
    if (buf) results.push(buf);
  };

  for (const part of clauseParts) {
    if (part.length > maxChars) {
      if (current) {
        results.push(current);
        current = '';
      }
      pushWordSplit(part);
      continue;
    }
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) results.push(current);
      current = part;
    }
  }
  if (current) results.push(current);
  return results;
}

export function splitTextIntoSegments(rawText: string, maxChars = DEFAULT_SEGMENT_MAX_CHARS): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const paragraphs = normalized
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segments: string[] = [];

  for (const paragraph of paragraphs) {
    // Split at sentence endings while keeping punctuation attached
    const rawSentences = paragraph.split(/(?<=[.!?؟۔…])\s+/);
    let buffer = '';

    for (const sentence of rawSentences) {
      const s = sentence.trim();
      if (!s) continue;

      if (s.length > maxChars) {
        if (buffer) {
          segments.push(buffer);
          buffer = '';
        }
        const subChunks = splitLongPiece(s, maxChars);
        segments.push(...subChunks);
        continue;
      }

      const candidate = buffer ? `${buffer} ${s}` : s;
      if (candidate.length <= maxChars) {
        buffer = candidate;
      } else {
        if (buffer) segments.push(buffer);
        buffer = s;
      }
    }

    if (buffer) {
      segments.push(buffer);
    }
  }

  // Prevent trailing orphaned S2 [bracket] or legacy S1 (parenthesis) tags at end of a segment
  for (let i = 0; i < segments.length - 1; i++) {
    const match = segments[i].match(/\s+(\[[^\]]{1,80}\]|\([a-zA-Z\s]{1,32}\))$/);
    if (match) {
      segments[i] = segments[i].slice(0, segments[i].length - match[0].length).trim();
      segments[i + 1] = `${match[1]} ${segments[i + 1]}`.trim();
    }
  }

  return segments.filter(Boolean);
}

export function composeSegmentText(text: string, emotionTag?: string): string {
  const cleanText = text.trim();
  const cleanTag = typeof emotionTag === 'string' ? emotionTag.trim() : '';
  if (!cleanTag) return cleanText;
  if (!cleanText) return cleanTag;
  if (cleanText.startsWith(cleanTag)) return cleanText;
  return `${cleanTag} ${cleanText}`;
}

export async function stitchAudioSegments(options: {
  buffers: Buffer[];
  format: AudioFormat;
  sampleRate: number | null;
  mp3Bitrate: number;
  opusBitrate: number;
  pauseMs: number;
  tmpRootDir: string;
}): Promise<Buffer> {
  const { buffers, format, sampleRate, mp3Bitrate, opusBitrate, pauseMs, tmpRootDir } = options;

  if (buffers.length === 0) {
    throw new Error('No audio segments available to stitch.');
  }
  if (buffers.length === 1) {
    return buffers[0];
  }

  if (format === 'pcm') {
    const sr = sampleRate || 44100;
    if (pauseMs <= 0) {
      return Buffer.concat(buffers);
    }
    const silenceSamples = Math.round((sr * pauseMs) / 1000);
    // Signed 16-bit mono PCM -> 2 bytes per sample, aligned to even byte count
    const silenceBuf = Buffer.alloc(silenceSamples * 2);
    const parts: Buffer[] = [];
    for (let i = 0; i < buffers.length; i++) {
      parts.push(buffers[i]);
      if (i < buffers.length - 1) {
        parts.push(silenceBuf);
      }
    }
    return Buffer.concat(parts);
  }

  const jobDir = path.join(tmpRootDir, crypto.randomUUID());
  await fsp.mkdir(jobDir, { recursive: true });

  const containerExt = format === 'opus' ? 'ogg' : format;
  const effectiveSampleRate = sampleRate || (format === 'opus' ? 48000 : 44100);

  try {
    const inputArgs: string[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const chunkPath = path.join(jobDir, `chunk_${String(i).padStart(4, '0')}.${containerExt}`);
      await fsp.writeFile(chunkPath, buffers[i]);
      inputArgs.push('-i', chunkPath);
    }

    const filterParts: string[] = [];
    const concatRefs: string[] = [];
    const pauseSec = (pauseMs / 1000).toFixed(3);

    for (let i = 0; i < buffers.length; i++) {
      filterParts.push(`[${i}:a]aformat=sample_fmts=fltp:sample_rates=${effectiveSampleRate}:channel_layouts=mono[a${i}]`);
      concatRefs.push(`[a${i}]`);
      if (pauseMs > 0 && i < buffers.length - 1) {
        filterParts.push(`anullsrc=r=${effectiveSampleRate}:cl=mono:d=${pauseSec}[s${i}]`);
        concatRefs.push(`[s${i}]`);
      }
    }

    const filterComplex = `${filterParts.join(';')};${concatRefs.join('')}concat=n=${concatRefs.length}:v=0:a=1[out]`;
    const outputPath = path.join(jobDir, `stitched.${containerExt}`);

    const codecArgs: string[] =
      format === 'mp3'
        ? ['-c:a', 'libmp3lame', '-b:a', `${mp3Bitrate}k`]
        : format === 'wav'
          ? ['-c:a', 'pcm_s16le']
          : ['-c:a', 'libopus', '-b:a', `${opusBitrate > 0 ? opusBitrate : 32}k`, '-f', 'ogg'];

    await execFileAsync(
      'ffmpeg',
      ['-y', '-v', 'error', ...inputArgs, '-filter_complex', filterComplex, '-map', '[out]', ...codecArgs, outputPath],
      { maxBuffer: 1024 * 1024 }
    );

    return await fsp.readFile(outputPath);
  } finally {
    await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
