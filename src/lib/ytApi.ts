import { ApiError } from './api';
import type {
  AudioTrackAsset,
  ProjectSettings,
  ProjectSummary,
  ScriptEditAction,
  SoundEffectCue,
  SubtitleStyle,
  AudioMixSettings,
  VoiceoverSettings,
  VoiceoverStreamProgress,
  YouTubeProject,
} from '../types/youtube';

async function ytJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (res.ok) {
        throw new ApiError(`Unexpected non-JSON response (${res.status}).`, res.status);
      }
    }
  }
  if (!res.ok) {
    const msg =
      typeof data.error === 'string' && data.error
        ? data.error
        : text.slice(0, 200) || `Request failed (${res.status})`;
    const code = typeof data.code === 'string' ? data.code : undefined;
    throw new ApiError(msg, res.status, code);
  }
  return data as T;
}

function uploadBinaryWithProgress<T>(
  url: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as Record<string, unknown>;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as T);
        } else {
          reject(
            new ApiError(
              typeof parsed.error === 'string' ? parsed.error : `Upload failed (${xhr.status})`,
              xhr.status
            )
          );
        }
      } catch {
        reject(new ApiError(`Upload failed (${xhr.status})`, xhr.status));
      }
    };

    xhr.onerror = () => reject(new ApiError('Network error during file upload.', 500));
    xhr.send(file);
  });
}

export const ytApi = {
  generateIdeas: (payload: {
    seedTopic?: string;
    category: string;
    language: string;
    targetAudience?: string;
  }) =>
    ytJson<{
      ideas: Array<{
        title: string;
        topicPremise: string;
        description: string;
        hookPreview: string;
      }>;
      provider: string;
      model: string;
      tokensUsed: number;
    }>('/api/yt/ideas/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listProjects: () => ytJson<{ items: ProjectSummary[] }>('/api/yt/projects'),

  createProject: (payload: {
    settings: Partial<ProjectSettings>;
    voiceoverSettings?: Partial<VoiceoverSettings>;
    subtitles?: Partial<SubtitleStyle>;
    audioMix?: Partial<AudioMixSettings>;
  }) =>
    ytJson<{ project: YouTubeProject }>('/api/yt/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProject: (id: string) =>
    ytJson<{ project: YouTubeProject; storageBytes: number; renderActive: boolean }>(
      `/api/yt/projects/${encodeURIComponent(id)}`
    ),

  patchProject: (id: string, patch: Partial<YouTubeProject>) =>
    ytJson<{ project: YouTubeProject; storageBytes: number }>(
      `/api/yt/projects/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),

  duplicateProject: (id: string, name?: string) =>
    ytJson<{ project: YouTubeProject }>(`/api/yt/projects/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deleteProject: (id: string) =>
    ytJson<{ ok: boolean }>(`/api/yt/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  generateScript: (id: string) =>
    ytJson<{ project: YouTubeProject }>(`/api/yt/projects/${encodeURIComponent(id)}/script/generate`, {
      method: 'POST',
    }),

  transformScript: (
    id: string,
    payload: {
      action: ScriptEditAction;
      targetText: string;
      surroundingContext?: string;
      customInstruction?: string;
    }
  ) =>
    ytJson<{ text: string; project: YouTubeProject }>(
      `/api/yt/projects/${encodeURIComponent(id)}/script/transform`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  approveScript: (id: string, approved = true) =>
    ytJson<{ project: YouTubeProject }>(`/api/yt/projects/${encodeURIComponent(id)}/script/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved }),
    }),

  generateVoiceoverStream: async (
    id: string,
    payload: {
      chapterId?: string;
      voiceoverSettings?: VoiceoverSettings;
      force?: boolean;
    },
    options?: {
      signal?: AbortSignal;
      onProgress?: (progress: VoiceoverStreamProgress) => void;
    }
  ): Promise<{ project: YouTubeProject }> => {
    const res = await fetch(`/api/yt/projects/${encodeURIComponent(id)}/voiceover/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options?.signal,
    });

    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('text/event-stream')) {
      const txt = await res.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(txt) as Record<string, unknown>;
      } catch {
        // Not JSON
      }
      throw new ApiError(
        typeof parsed.error === 'string' ? parsed.error : 'Unable to start voiceover stream.',
        res.status,
        typeof parsed.code === 'string' ? parsed.code : undefined
      );
    }

    if (!res.body) throw new ApiError('Stream body unavailable.', 500);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishedProject: YouTubeProject | null = null;

    const handleBlock = (block: string) => {
      let evName = 'message';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) evName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
      } catch {
        return;
      }
      if (evName === 'progress') {
        options?.onProgress?.(parsed as unknown as VoiceoverStreamProgress);
      } else if (evName === 'complete') {
        finishedProject = (parsed.project as YouTubeProject) ?? null;
      } else if (evName === 'error') {
        throw new ApiError(
          typeof parsed.error === 'string' ? parsed.error : 'Voiceover synthesis failed.',
          typeof parsed.status === 'number' ? parsed.status : 500
        );
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const b of blocks) {
        if (b.trim()) handleBlock(b);
      }
    }
    if (buffer.trim()) handleBlock(buffer);
    if (!finishedProject) {
      throw new ApiError('Voiceover generation stream ended unexpectedly.', 500);
    }
    return { project: finishedProject };
  },

  analyzeVoiceover: (id: string, mode: 'auto' | 'acoustic' | 'fish-asr' | 'gemini' = 'auto') =>
    ytJson<{ project: YouTubeProject; pauseIntervalsCount: number }>(
      `/api/yt/projects/${encodeURIComponent(id)}/voiceover/analyze`,
      {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }
    ),

  planSmartScenes: (id: string) =>
    ytJson<{ project: YouTubeProject }>(`/api/yt/projects/${encodeURIComponent(id)}/scenes/plan`, {
      method: 'POST',
    }),

  generateImagePrompts: (id: string, sceneIds?: string[]) =>
    ytJson<{ project: YouTubeProject; updatedCount: number }>(
      `/api/yt/projects/${encodeURIComponent(id)}/scenes/prompts`,
      {
        method: 'POST',
        body: JSON.stringify(sceneIds ? { sceneIds } : {}),
      }
    ),

  autoAssignMotion: (id: string) =>
    ytJson<{ project: YouTubeProject }>(
      `/api/yt/projects/${encodeURIComponent(id)}/scenes/auto-motion`,
      { method: 'POST' }
    ),

  uploadSceneImage: (
    projectId: string,
    file: File,
    options?: { sceneId?: string; onProgress?: (percent: number) => void }
  ) => {
    const q = new URLSearchParams();
    q.set('filename', file.name);
    if (options?.sceneId) q.set('sceneId', options.sceneId);
    return uploadBinaryWithProgress<{
      project: YouTubeProject;
      matchedSceneId: string | null;
      matchedSceneNumber?: number;
      duplicateOfSceneNumber?: number | null;
    }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/images/upload?${q.toString()}`,
      file,
      options?.onProgress
    );
  },

  assignUnassignedImage: (projectId: string, imageId: string, sceneId: string) =>
    ytJson<{ project: YouTubeProject }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/images/assign`,
      {
        method: 'POST',
        body: JSON.stringify({ imageId, sceneId }),
      }
    ),

  deleteUnassignedImage: (projectId: string, imageId: string) =>
    ytJson<{ project: YouTubeProject }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/images/unassigned/${encodeURIComponent(imageId)}`,
      { method: 'DELETE' }
    ),

  deleteSceneImage: (projectId: string, sceneId: string) =>
    ytJson<{ project: YouTubeProject }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/image`,
      { method: 'DELETE' }
    ),

  createBuiltinMusic: (
    projectId: string,
    preset: 'documentary-pad' | 'dark-tension' | 'warm-piano-drone'
  ) =>
    ytJson<{ project: YouTubeProject; track: AudioTrackAsset }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/music/builtin`,
      {
        method: 'POST',
        body: JSON.stringify({ preset }),
      }
    ),

  uploadMusicTrack: (
    projectId: string,
    file: File,
    onProgress?: (percent: number) => void
  ) =>
    uploadBinaryWithProgress<{ project: YouTubeProject; track: AudioTrackAsset }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/music/upload?filename=${encodeURIComponent(file.name)}`,
      file,
      onProgress
    ),

  uploadSfxCue: (
    projectId: string,
    file: File,
    startMs: number,
    onProgress?: (percent: number) => void
  ) =>
    uploadBinaryWithProgress<{ project: YouTubeProject; sfxCue: SoundEffectCue }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/sfx/upload?filename=${encodeURIComponent(file.name)}&startMs=${Math.round(startMs)}`,
      file,
      onProgress
    ),

  startRender: (
    projectId: string,
    options?: {
      resolution?: string;
      fps?: number;
      qualityPreset?: string;
      embeddedSubtitles?: boolean;
    }
  ) =>
    ytJson<{ jobId: string; status: string }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/render/start`,
      {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }
    ),

  cancelRender: (projectId: string) =>
    ytJson<{ cancelled: boolean }>(
      `/api/yt/projects/${encodeURIComponent(projectId)}/render/cancel`,
      { method: 'POST' }
    ),
};
