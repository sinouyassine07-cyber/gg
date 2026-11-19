import type { AudioFormat, GenerationRecord } from '../types';

export function getAudioMimeType(format: AudioFormat): string {
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

export function getAudioDownloadFilename(record: GenerationRecord): string {
  const safeSlug =
    (record.voiceName || 'voice')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'voice';
  const ext = record.format || 'mp3';
  return `voice-studio-${safeSlug}-${record.id.slice(0, 8)}.${ext}`;
}

export function getAudioDownloadHref(record: GenerationRecord): string {
  const filename = getAudioDownloadFilename(record);
  return `/api/history/${encodeURIComponent(record.id)}/download/${encodeURIComponent(filename)}`;
}

export async function downloadGenerationAudio(record: GenerationRecord): Promise<void> {
  const filename = getAudioDownloadFilename(record);
  const href = getAudioDownloadHref(record);

  const res = await fetch(href);
  if (!res.ok) {
    let message = `Download failed (${res.status}).`;
    try {
      const text = await res.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.error === 'string' && parsed.error) {
        message = parsed.error;
      }
    } catch {
      // Ignore parse error
    }
    throw new Error(message);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('Server returned an unexpected response instead of the audio file.');
  }

  const buffer = await res.arrayBuffer();
  const mime = getAudioMimeType(record.format || 'mp3');
  const blob = new Blob([buffer], { type: mime });
  const blobUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60000);
}
