import type { GenerationRecord, TranscriptCue, TranscriptFormat } from '../types';

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, '0');
}

function pad3(n: number): string {
  return String(Math.floor(n)).padStart(3, '0');
}

export function formatSrtTimestamp(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3600000);
  const mins = Math.floor((safe % 3600000) / 60000);
  const secs = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)},${pad3(millis)}`;
}

export function formatVttTimestamp(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3600000);
  const mins = Math.floor((safe % 3600000) / 60000);
  const secs = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}.${pad3(millis)}`;
}

export function formatDisplayTimestamp(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3600000);
  const mins = Math.floor((safe % 3600000) / 60000);
  const secs = Math.floor((safe % 60000) / 1000);
  const millis = safe % 1000;
  if (hours > 0) {
    return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}.${pad3(millis)}`;
  }
  return `${pad2(mins)}:${pad2(secs)}.${pad3(millis)}`;
}

export function formatInlineShortTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${pad2(mins)}:${pad2(secs)}`;
  }
  return `${mins}:${pad2(secs)}`;
}

export function formatTranscriptString(
  record: GenerationRecord,
  cues: TranscriptCue[],
  format: TranscriptFormat,
  includeTimestampsInTxt = true
): string {
  if (format === 'srt') {
    return cues
      .map(
        (cue, idx) =>
          `${idx + 1}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${cue.text}`
      )
      .join('\n\n')
      .concat('\n');
  }

  if (format === 'vtt') {
    const body = cues
      .map(
        (cue) =>
          `${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}\n${cue.text}`
      )
      .join('\n\n');
    return `WEBVTT\n\n${body}\n`;
  }

  if (format === 'txt') {
    if (!includeTimestampsInTxt) {
      return (
        cues
          .map((cue) => cue.text.trim())
          .filter(Boolean)
          .join(' ') + '\n'
      );
    }
    const parts: string[] = [];
    let lastTag = '';
    for (const cue of cues) {
      const text = cue.text.trim();
      if (!text) continue;
      const tag = `(${formatInlineShortTimestamp(cue.startMs)})`;
      if (tag !== lastTag) {
        parts.push(`${tag} ${text}`);
        lastTag = tag;
      } else {
        parts.push(text);
      }
    }
    return parts.join(' ').trim() + '\n';
  }

  return JSON.stringify(
    {
      id: record.id,
      voiceName: record.voiceName,
      model: record.model,
      durationSeconds: record.durationSeconds ?? null,
      source: record.transcriptSource ?? 'segment-exact',
      createdAt: record.createdAt,
      cues: cues.map((cue, idx) => ({
        index: idx + 1,
        startMs: cue.startMs,
        endMs: cue.endMs,
        startTime: formatVttTimestamp(cue.startMs),
        endTime: formatVttTimestamp(cue.endMs),
        text: cue.text,
      })),
    },
    null,
    2
  );
}

export function getTranscriptFilename(record: GenerationRecord, format: TranscriptFormat): string {
  const safeSlug =
    (record.voiceName || 'voice')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'voice';
  return `voice-studio-${safeSlug}-${record.id.slice(0, 8)}.${format}`;
}

export function downloadTranscriptFile(
  record: GenerationRecord,
  cues: TranscriptCue[],
  format: TranscriptFormat,
  includeTimestampsInTxt = true
): void {
  const content = formatTranscriptString(record, cues, format, includeTimestampsInTxt);
  const mime =
    format === 'json'
      ? 'application/json;charset=utf-8'
      : format === 'vtt'
        ? 'text/vtt;charset=utf-8'
        : 'text/plain;charset=utf-8';
  const blob = new Blob([content], { type: mime });
  const blobUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = getTranscriptFilename(record, format);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
}
