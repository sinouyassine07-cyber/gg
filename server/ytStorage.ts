import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type {
  AudioMixSettings,
  ProductionStageKey,
  ProductionStageState,
  ProjectSettings,
  ProjectSummary,
  SubtitleStyle,
  VoiceoverSettings,
  YouTubeProject,
} from './ytTypes.ts';

export const YT_DATA_DIR = path.resolve(process.cwd(), '.data', 'yt-projects');

export const PRODUCTION_STAGE_KEYS: ProductionStageKey[] = [
  'project_creation',
  'script_generation',
  'script_approval',
  'voice_generation',
  'audio_analysis',
  'scene_planning',
  'prompt_generation',
  'image_upload',
  'scene_approval',
  'video_assembly',
  'subtitle_processing',
  'audio_mixing',
  'final_rendering',
  'export',
];

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  enabled: true,
  embedded: true,
  fontFamily: 'Noto Sans',
  fontSize: 44,
  fontWeight: 'bold',
  textColor: '#FFFFFF',
  outlineColor: '#000000',
  outlineWidth: 3,
  shadowDepth: 2,
  backgroundColor: '#070910',
  backgroundOpacity: 0.45,
  position: 'bottom',
  animation: 'fade',
  highlightKeywords: true,
  highlightColor: '#FACC15',
  maxCharsPerLine: 44,
};

export const DEFAULT_AUDIO_MIX: AudioMixSettings = {
  musicEnabled: false,
  musicTrack: null,
  musicVolume: 0.22,
  voiceoverVolume: 1.0,
  duckingEnabled: true,
  duckingAmount: 0.72,
  fadeInMs: 1500,
  fadeOutMs: 2500,
  loudnessNormalization: true,
  soundEffects: [],
};

export function getProjectDir(projectId: string): string {
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('Invalid project ID.');
  return path.join(YT_DATA_DIR, safeId);
}

export function getProjectSubdir(
  projectId: string,
  sub: 'audio' | 'images' | 'music' | 'sfx' | 'exports' | 'cache'
): string {
  return path.join(getProjectDir(projectId), sub);
}

export async function ensureProjectDirs(projectId: string): Promise<void> {
  const base = getProjectDir(projectId);
  await Promise.all([
    fsp.mkdir(path.join(base, 'audio'), { recursive: true }),
    fsp.mkdir(path.join(base, 'images'), { recursive: true }),
    fsp.mkdir(path.join(base, 'music'), { recursive: true }),
    fsp.mkdir(path.join(base, 'sfx'), { recursive: true }),
    fsp.mkdir(path.join(base, 'exports'), { recursive: true }),
    fsp.mkdir(path.join(base, 'cache'), { recursive: true }),
  ]);
}

export function createInitialStages(): Record<ProductionStageKey, ProductionStageState> {
  const now = new Date().toISOString();
  const stages = {} as Record<ProductionStageKey, ProductionStageState>;
  for (const key of PRODUCTION_STAGE_KEYS) {
    stages[key] = {
      key,
      status: key === 'project_creation' ? 'completed' : 'pending',
      updatedAt: key === 'project_creation' ? now : undefined,
    };
  }
  return stages;
}

/**
 * Recomputes stage completion from actual persisted project artifacts so status is always truthful.
 */
export function recomputeProjectStages(project: YouTubeProject): YouTubeProject {
  const now = new Date().toISOString();
  const prev = project.stages || createInitialStages();
  const stages: Record<ProductionStageKey, ProductionStageState> = { ...prev };

  const setStage = (
    key: ProductionStageKey,
    status: ProductionStageState['status'],
    detail?: string,
    error?: string
  ) => {
    stages[key] = {
      key,
      status,
      detail,
      error,
      updatedAt: prev[key]?.status === status ? prev[key]?.updatedAt || now : now,
    };
  };

  setStage('project_creation', 'completed', project.settings.name);

  if (project.script && project.script.chapters.length > 0) {
    setStage(
      'script_generation',
      'completed',
      `${project.script.chapters.length} chapters`
    );
    setStage(
      'script_approval',
      project.script.approved ? 'completed' : 'pending',
      project.script.approved ? 'Approved' : 'Awaiting approval'
    );
  } else {
    setStage('script_generation', 'pending');
    setStage('script_approval', 'pending');
  }

  if (project.voiceover.status === 'failed') {
    setStage('voice_generation', 'failed', undefined, project.voiceover.error);
  } else if (project.voiceover.status === 'generating') {
    setStage('voice_generation', 'in_progress', 'Synthesizing voiceover...');
  } else if (project.voiceover.audioFileName && project.voiceover.durationMs > 0) {
    setStage(
      'voice_generation',
      'completed',
      `${(project.voiceover.durationMs / 1000).toFixed(1)}s`
    );
  } else {
    setStage('voice_generation', 'pending');
  }

  if (project.voiceover.cues.length > 0 && project.voiceover.durationMs > 0) {
    setStage(
      'audio_analysis',
      'completed',
      `${project.voiceover.cues.length} cues (${project.voiceover.transcriptSource || 'analyzed'})`
    );
  } else {
    setStage('audio_analysis', 'pending');
  }

  if (project.scenes.length > 0) {
    setStage('scene_planning', 'completed', `${project.scenes.length} scenes`);
    const withPrompts = project.scenes.filter((s) => s.imagePrompt.trim().length > 0).length;
    setStage(
      'prompt_generation',
      withPrompts === project.scenes.length
        ? 'completed'
        : withPrompts > 0
          ? 'in_progress'
          : 'pending',
      `${withPrompts}/${project.scenes.length} prompts`
    );

    const withImages = project.scenes.filter((s) => s.uploadStatus === 'uploaded').length;
    setStage(
      'image_upload',
      withImages === project.scenes.length
        ? 'completed'
        : withImages > 0
          ? 'in_progress'
          : 'pending',
      `${withImages}/${project.scenes.length} images`
    );

    const approvedScenes = project.scenes.filter((s) => s.approved).length;
    setStage(
      'scene_approval',
      approvedScenes === project.scenes.length
        ? 'completed'
        : approvedScenes > 0
          ? 'in_progress'
          : 'pending',
      `${approvedScenes}/${project.scenes.length} approved`
    );
  } else {
    setStage('scene_planning', 'pending');
    setStage('prompt_generation', 'pending');
    setStage('image_upload', 'pending');
    setStage('scene_approval', 'pending');
  }

  const job = project.activeRenderJob;
  if (job && (job.status === 'running' || job.status === 'queued')) {
    const order: ProductionStageKey[] = [
      'video_assembly',
      'subtitle_processing',
      'audio_mixing',
      'final_rendering',
      'export',
    ];
    const activeIdx = order.indexOf(job.phase);
    order.forEach((stageKey, idx) => {
      if (idx < activeIdx) {
        setStage(stageKey, 'completed');
      } else if (idx === activeIdx) {
        setStage(stageKey, 'in_progress', job.message);
      } else {
        setStage(stageKey, 'pending');
      }
    });
  } else if (job && job.status === 'failed') {
    setStage(job.phase, 'failed', job.message, job.error);
  } else if (project.exports.length > 0) {
    const latest = project.exports[0];
    setStage('video_assembly', 'completed', `${project.scenes.length} clips`);
    setStage(
      'subtitle_processing',
      'completed',
      project.subtitles.enabled ? 'Synchronized' : 'Skipped'
    );
    setStage(
      'audio_mixing',
      'completed',
      project.audioMix.musicEnabled ? 'Voice + Ducking Music' : 'Normalized Voiceover'
    );
    setStage('final_rendering', 'completed', `${latest.resolution} ${latest.fps}fps`);
    setStage('export', 'completed', `${latest.fileName}`);
  } else {
    setStage('video_assembly', 'pending');
    setStage('subtitle_processing', 'pending');
    setStage('audio_mixing', 'pending');
    setStage('final_rendering', 'pending');
    setStage('export', 'pending');
  }

  project.stages = stages;
  return project;
}

export async function createProject(params: {
  settings: ProjectSettings;
  voiceoverSettings: VoiceoverSettings;
  subtitles?: Partial<SubtitleStyle>;
  audioMix?: Partial<AudioMixSettings>;
}): Promise<YouTubeProject> {
  await fsp.mkdir(YT_DATA_DIR, { recursive: true });
  const id = `yt_${crypto.randomUUID()}`;
  await ensureProjectDirs(id);
  const now = new Date().toISOString();

  const project: YouTubeProject = {
    id,
    createdAt: now,
    updatedAt: now,
    settings: params.settings,
    script: null,
    voiceoverSettings: params.voiceoverSettings,
    voiceover: {
      status: 'idle',
      format: params.voiceoverSettings.format || 'mp3',
      durationMs: 0,
      fileSizeBytes: 0,
      cues: [],
      chapterAudios: [],
    },
    scenes: [],
    unassignedImages: [],
    subtitles: { ...DEFAULT_SUBTITLE_STYLE, ...(params.subtitles || {}) },
    audioMix: { ...DEFAULT_AUDIO_MIX, ...(params.audioMix || {}) },
    stages: createInitialStages(),
    activeRenderJob: null,
    exports: [],
    usage: {
      geminiCalls: 0,
      geminiTokensApprox: 0,
      fishAudioCharacters: 0,
      fishAudioRequests: 0,
      renderTimeSeconds: 0,
    },
  };

  recomputeProjectStages(project);
  await saveProject(project);
  return project;
}

export async function saveProject(project: YouTubeProject): Promise<YouTubeProject> {
  await ensureProjectDirs(project.id);
  project.updatedAt = new Date().toISOString();
  recomputeProjectStages(project);
  const filePath = path.join(getProjectDir(project.id), 'project.json');
  const tmpPath = `${filePath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(project, null, 2));
  await fsp.rename(tmpPath, filePath);
  return project;
}

export async function getProject(projectId: string): Promise<YouTubeProject | null> {
  try {
    const filePath = path.join(getProjectDir(projectId), 'project.json');
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as YouTubeProject;
    // If server crashed/restarted mid-render, recover cleanly so job isn't permanently stuck
    if (
      parsed.activeRenderJob &&
      (parsed.activeRenderJob.status === 'running' || parsed.activeRenderJob.status === 'queued')
    ) {
      // Caller in ytVideoEngine can check live activeJobs Map; leave helper for startup cleanup
    }
    return parsed;
  } catch {
    return null;
  }
}

async function computeDirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await computeDirSize(full);
      } else if (entry.isFile()) {
        const st = await fsp.stat(full).catch(() => null);
        if (st) total += st.size;
      }
    }
  } catch {
    // Ignore missing dir
  }
  return total;
}

export async function getProjectStorageBytes(projectId: string): Promise<number> {
  return computeDirSize(getProjectDir(projectId));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await fsp.mkdir(YT_DATA_DIR, { recursive: true });
  const entries = await fsp.readdir(YT_DATA_DIR, { withFileTypes: true });
  const summaries: ProjectSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const proj = await getProject(entry.name);
    if (!proj) continue;
    const storageBytes = await getProjectStorageBytes(proj.id);
    summaries.push({
      id: proj.id,
      name: proj.settings.name,
      topic: proj.settings.topic,
      category: proj.settings.category,
      language: proj.settings.language,
      targetDurationMinutes: proj.settings.targetDurationMinutes,
      sceneCount: proj.scenes.length,
      uploadedImagesCount: proj.scenes.filter((s) => s.uploadStatus === 'uploaded').length,
      approvedScenesCount: proj.scenes.filter((s) => s.approved).length,
      voiceoverDurationMs: proj.voiceover.durationMs || 0,
      exportsCount: proj.exports.length,
      renderStatus: proj.activeRenderJob?.status || 'idle',
      createdAt: proj.createdAt,
      updatedAt: proj.updatedAt,
      storageBytes,
    });
  }

  summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return summaries;
}

export async function duplicateProject(projectId: string, newName?: string): Promise<YouTubeProject | null> {
  const source = await getProject(projectId);
  if (!source) return null;

  const copyId = `yt_${crypto.randomUUID()}`;
  const srcDir = getProjectDir(projectId);
  const dstDir = getProjectDir(copyId);
  await fsp.cp(srcDir, dstDir, { recursive: true });

  const now = new Date().toISOString();
  const cloned: YouTubeProject = structuredClone(source);
  cloned.id = copyId;
  cloned.createdAt = now;
  cloned.updatedAt = now;
  cloned.settings.name = newName?.trim() || `${source.settings.name} (Copy)`;
  cloned.activeRenderJob = null;

  const rewriteUrl = (url?: string) =>
    url ? url.replace(`/api/yt/projects/${projectId}/`, `/api/yt/projects/${copyId}/`) : url;

  if (cloned.voiceover.audioUrl) cloned.voiceover.audioUrl = rewriteUrl(cloned.voiceover.audioUrl);
  if (cloned.voiceover.downloadUrl) cloned.voiceover.downloadUrl = rewriteUrl(cloned.voiceover.downloadUrl);
  cloned.voiceover.chapterAudios = cloned.voiceover.chapterAudios.map((c) => ({
    ...c,
    audioUrl: rewriteUrl(c.audioUrl) || c.audioUrl,
  }));
  cloned.scenes = cloned.scenes.map((s) => ({
    ...s,
    image: s.image
      ? { ...s.image, imageUrl: rewriteUrl(s.image.imageUrl) || s.image.imageUrl }
      : undefined,
  }));
  cloned.unassignedImages = cloned.unassignedImages.map((u) => ({
    ...u,
    imageUrl: rewriteUrl(u.imageUrl) || u.imageUrl,
  }));
  if (cloned.audioMix.musicTrack) {
    cloned.audioMix.musicTrack = {
      ...cloned.audioMix.musicTrack,
      audioUrl: rewriteUrl(cloned.audioMix.musicTrack.audioUrl) || cloned.audioMix.musicTrack.audioUrl,
    };
  }
  cloned.audioMix.soundEffects = cloned.audioMix.soundEffects.map((sfx) => ({
    ...sfx,
    audioUrl: rewriteUrl(sfx.audioUrl) || sfx.audioUrl,
  }));
  cloned.exports = cloned.exports.map((ex) => ({
    ...ex,
    videoUrl: rewriteUrl(ex.videoUrl) || ex.videoUrl,
    downloadUrl: rewriteUrl(ex.downloadUrl) || ex.downloadUrl,
    srtUrl: rewriteUrl(ex.srtUrl),
    vttUrl: rewriteUrl(ex.vttUrl),
  }));

  await saveProject(cloned);
  return cloned;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const dir = getProjectDir(projectId);
  try {
    await fsp.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Matches uploaded image filenames like:
 * - scene_001.png, scene-1.jpg, scene12.webp, sc_005.png, 001.png, 04_anything.jpg
 * Returns the matched 1-based sceneNumber if confident, or null when ambiguous.
 */
export function matchSceneNumberFromFilename(
  originalFilename: string,
  totalScenes: number
): { sceneNumber: number | null; reason: string } {
  if (totalScenes <= 0) {
    return { sceneNumber: null, reason: 'Project has no planned scenes yet.' };
  }
  const base = path.basename(originalFilename, path.extname(originalFilename)).trim();

  // Priority 1: explicit scene prefix (scene_001, scene-12, scene 3, sc_04)
  const explicitMatch = base.match(/^(?:scene|sc|shot|frame)[_\-\s]*0*(\d+)$/i);
  if (explicitMatch) {
    const num = Number(explicitMatch[1]);
    if (num >= 1 && num <= totalScenes) {
      return { sceneNumber: num, reason: 'Matched explicit scene filename' };
    }
    return {
      sceneNumber: null,
      reason: `Scene number ${num} is outside planned range (1–${totalScenes}).`,
    };
  }

  // Priority 2: scene prefix with trailing title (scene_001_forest, scene-02-intro)
  const prefixTitleMatch = base.match(/^(?:scene|sc|shot|frame)[_\-\s]*0*(\d+)(?:[_\-\s]+.*)?$/i);
  if (prefixTitleMatch) {
    const num = Number(prefixTitleMatch[1]);
    if (num >= 1 && num <= totalScenes) {
      return { sceneNumber: num, reason: 'Matched scene prefix' };
    }
    return {
      sceneNumber: null,
      reason: `Scene number ${num} is outside planned range (1–${totalScenes}).`,
    };
  }

  // Priority 3: pure number or leading zero-padded number (001.png, 002_hero.jpg)
  const leadingNumMatch = base.match(/^0*(\d+)(?:[_\-\s].*)?$/);
  if (leadingNumMatch) {
    const num = Number(leadingNumMatch[1]);
    // Guard against timestamps / huge numbers like 1763551234.png or IMG_20261119
    if (num >= 1 && num <= totalScenes && num <= 999) {
      return { sceneNumber: num, reason: 'Matched leading sequence number' };
    }
  }

  return {
    sceneNumber: null,
    reason: 'Filename does not contain a clear scene number (e.g. scene_001.png).',
  };
}

export async function resetStuckRenderJobsOnStartup(): Promise<void> {
  await fsp.mkdir(YT_DATA_DIR, { recursive: true });
  const entries = await fsp.readdir(YT_DATA_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const proj = await getProject(entry.name);
    if (
      proj?.activeRenderJob &&
      (proj.activeRenderJob.status === 'running' || proj.activeRenderJob.status === 'queued')
    ) {
      proj.activeRenderJob = {
        ...proj.activeRenderJob,
        status: 'failed',
        message: 'Server restarted while rendering. Click Resume Render to continue from cached clips.',
        error: 'Interrupted by server restart',
        updatedAt: new Date().toISOString(),
      };
      await saveProject(proj);
    }
  }
}
