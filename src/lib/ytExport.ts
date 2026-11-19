import type { YouTubeProject, YouTubeScene } from '../types/youtube';

export function formatShortClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatProjectSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'youtube-project'
  );
}

export function buildAllPromptsText(project: YouTubeProject): string {
  return project.scenes
    .map(
      (sc) =>
        `=== Scene ${String(sc.sceneNumber).padStart(3, '0')} (${formatShortClock(sc.startMs)} - ${formatShortClock(sc.endMs)}) | ${sc.chapterTitle} ===\n${sc.imagePrompt || sc.visualDescription}`
    )
    .join('\n\n');
}

function escapeCsvCell(value: string): string {
  const clean = (value ?? '').replace(/"/g, '""');
  return `"${clean}"`;
}

export function buildStoryboardCsv(scenes: YouTubeScene[]): string {
  const headers = [
    'Scene #',
    'Scene ID',
    'Chapter',
    'Start',
    'End',
    'Duration (s)',
    'Narration',
    'Visual Description',
    'Image Prompt',
    'Motion Effect',
    'Upload Status',
    'Approved',
  ];
  const rows = scenes.map((sc) =>
    [
      String(sc.sceneNumber),
      sc.id,
      sc.chapterTitle,
      formatShortClock(sc.startMs),
      formatShortClock(sc.endMs),
      (sc.durationMs / 1000).toFixed(2),
      sc.narrationText,
      sc.visualDescription,
      sc.imagePrompt,
      sc.motionDisabled ? 'static' : sc.motionEffect,
      sc.uploadStatus,
      sc.approved ? 'yes' : 'no',
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  return [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
}

export function triggerTextDownload(content: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadAllPromptsTxt(project: YouTubeProject): void {
  triggerTextDownload(
    buildAllPromptsText(project),
    `${formatProjectSlug(project.settings.name)}-prompts.txt`,
    'text/plain;charset=utf-8'
  );
}

export function downloadStoryboardCsv(project: YouTubeProject): void {
  triggerTextDownload(
    buildStoryboardCsv(project.scenes),
    `${formatProjectSlug(project.settings.name)}-storyboard.csv`,
    'text/csv;charset=utf-8'
  );
}

export function downloadStoryboardJson(project: YouTubeProject): void {
  const payload = {
    projectId: project.id,
    projectName: project.settings.name,
    topic: project.settings.topic,
    visualStyle: project.settings.visualStyle,
    aspectRatio: project.settings.aspectRatio,
    scenes: project.scenes,
  };
  triggerTextDownload(
    JSON.stringify(payload, null, 2),
    `${formatProjectSlug(project.settings.name)}-storyboard.json`,
    'application/json;charset=utf-8'
  );
}

export async function downloadRemoteBinaryFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Unable to download file (${res.status}).`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}
