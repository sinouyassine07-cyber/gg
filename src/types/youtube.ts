import type {
  AudioFormat,
  FishAudioModel,
  LatencyMode,
  TranscriptCue,
  TranscriptSource,
} from '../types';

export type VideoCategory =
  | 'documentary'
  | 'historical-documentary'
  | 'true-crime'
  | 'educational'
  | 'science-tech'
  | 'mysteries'
  | 'storytelling'
  | 'biography'
  | 'business-finance'
  | 'news-analysis'
  | 'entertainment';

export type VisualStyle =
  | 'cinematic-photorealism'
  | 'documentary-photography'
  | 'historical-realism'
  | 'dark-cinematic'
  | '3d-animation'
  | 'illustration'
  | 'realistic-photography';

export type AspectRatio = '16:9' | '9:16' | '1:1';
export type VideoResolution = '720p' | '1080p' | '4k';
export type VideoFps = 24 | 25 | 30 | 60;
export type QualityPreset = 'high' | 'balanced' | 'economy';

export type MotionEffect =
  | 'slow-zoom-in'
  | 'slow-zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'ken-burns'
  | 'diagonal-drift'
  | 'cinematic-drift'
  | 'static';

export type MotionIntensity = 'subtle' | 'balanced' | 'cinematic';

export type TransitionType =
  | 'crossfade'
  | 'dissolve'
  | 'fade-black'
  | 'smooth-cut'
  | 'cinematic-fade';

export type SubtitlePosition = 'bottom' | 'middle' | 'top';
export type SubtitleAnimation = 'none' | 'fade' | 'pop' | 'highlight';

export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
}

export interface PronunciationRule {
  id: string;
  from: string;
  to: string;
  caseSensitive: boolean;
}

export interface ScriptChapter {
  id: string;
  index: number;
  title: string;
  content: string;
  summary: string;
  estimatedMinutes: number;
  locked: boolean;
  approved: boolean;
  audioFile?: string;
  audioDurationMs?: number;
  wordCount: number;
}

export interface ProjectScript {
  title: string;
  hook: string;
  introduction: string;
  chapters: ScriptChapter[];
  conclusion: string;
  researchNotes: string[];
  approved: boolean;
  approvedAt?: string;
  updatedAt: string;
}

export interface VoiceoverSettings {
  voiceId: string | null;
  voiceName: string;
  voiceAuthor?: string;
  model: FishAudioModel;
  format: AudioFormat;
  sampleRate: number | null;
  mp3Bitrate: 64 | 128 | 192;
  speed: number;
  volume: number;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  chunkLength: number;
  normalize: boolean;
  latency: LatencyMode;
  segmentPauseMs: 0 | 150 | 350;
  parallelConcurrency: 1 | 2 | 3;
  narrationStyle: string;
  pronunciationRules: PronunciationRule[];
}

export interface VoiceoverChapterAudio {
  chapterId: string;
  chapterTitle: string;
  fileName: string;
  audioUrl: string;
  durationMs: number;
  fileSizeBytes: number;
  generatedAt: string;
  cues: TranscriptCue[];
}

export interface ProjectVoiceover {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  audioFileName?: string;
  audioUrl?: string;
  downloadUrl?: string;
  format: AudioFormat;
  durationMs: number;
  fileSizeBytes: number;
  generatedAt?: string;
  cues: TranscriptCue[];
  words?: WordTimestamp[];
  transcriptSource?: TranscriptSource;
  chapterAudios: VoiceoverChapterAudio[];
  error?: string;
}

export interface SceneImageAsset {
  fileName: string;
  originalName: string;
  imageUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  matchConfidence: 'exact-filename' | 'manual' | 'single-upload';
}

export interface UnassignedImageAsset {
  id: string;
  fileName: string;
  originalName: string;
  imageUrl: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  reason: string;
}

export interface YouTubeScene {
  id: string;
  sceneNumber: number;
  chapterId: string;
  chapterTitle: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  narrationText: string;
  visualDescription: string;
  imagePrompt: string;
  continuityNotes?: string;
  image?: SceneImageAsset;
  uploadStatus: 'missing' | 'uploaded';
  motionEffect: MotionEffect;
  motionIntensity: MotionIntensity;
  motionDisabled: boolean;
  transitionType: TransitionType;
  transitionDurationMs: number;
  approved: boolean;
}

export interface SubtitleStyle {
  enabled: boolean;
  embedded: boolean;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadowDepth: number;
  backgroundColor: string;
  backgroundOpacity: number;
  position: SubtitlePosition;
  animation: SubtitleAnimation;
  highlightKeywords: boolean;
  highlightColor: string;
  maxCharsPerLine: number;
}

export interface AudioTrackAsset {
  id: string;
  name: string;
  fileName: string;
  audioUrl: string;
  durationMs: number;
  sizeBytes: number;
  source: 'upload' | 'builtin-ambient';
}

export interface SoundEffectCue {
  id: string;
  name: string;
  fileName: string;
  audioUrl: string;
  startMs: number;
  volume: number;
  sizeBytes: number;
}

export interface AudioMixSettings {
  musicEnabled: boolean;
  musicTrack: AudioTrackAsset | null;
  musicVolume: number;
  voiceoverVolume: number;
  duckingEnabled: boolean;
  duckingAmount: number;
  fadeInMs: number;
  fadeOutMs: number;
  loudnessNormalization: boolean;
  soundEffects: SoundEffectCue[];
}

export interface ProjectSettings {
  name: string;
  topic: string;
  language: string;
  targetAudience: string;
  category: VideoCategory;
  targetDurationMinutes: number;
  preferredSceneDurationSec: number;
  visualStyle: VisualStyle;
  aspectRatio: AspectRatio;
  resolution: VideoResolution;
  fps: VideoFps;
  qualityPreset: QualityPreset;
  includeResearchNotes: boolean;
}

export type ProductionStageKey =
  | 'project_creation'
  | 'script_generation'
  | 'script_approval'
  | 'voice_generation'
  | 'audio_analysis'
  | 'scene_planning'
  | 'prompt_generation'
  | 'image_upload'
  | 'scene_approval'
  | 'video_assembly'
  | 'subtitle_processing'
  | 'audio_mixing'
  | 'final_rendering'
  | 'export';

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface ProductionStageState {
  key: ProductionStageKey;
  status: StageStatus;
  detail?: string;
  updatedAt?: string;
  error?: string;
}

export interface ExportArtifact {
  id: string;
  fileName: string;
  videoUrl: string;
  downloadUrl: string;
  resolution: VideoResolution;
  aspectRatio: AspectRatio;
  fps: VideoFps;
  qualityPreset: QualityPreset;
  embeddedSubtitles: boolean;
  durationSeconds: number;
  width: number;
  height: number;
  fileSizeBytes: number;
  createdAt: string;
  srtUrl?: string;
  vttUrl?: string;
}

export interface ActiveRenderJob {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase: ProductionStageKey;
  percent: number;
  completedScenes: number;
  totalScenes: number;
  message: string;
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export interface UsageMetrics {
  geminiCalls: number;
  geminiTokensApprox: number;
  fishAudioCharacters: number;
  fishAudioRequests: number;
  renderTimeSeconds: number;
}

export interface YouTubeProject {
  id: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  script: ProjectScript | null;
  voiceoverSettings: VoiceoverSettings;
  voiceover: ProjectVoiceover;
  scenes: YouTubeScene[];
  unassignedImages: UnassignedImageAsset[];
  subtitles: SubtitleStyle;
  audioMix: AudioMixSettings;
  stages: Record<ProductionStageKey, ProductionStageState>;
  activeRenderJob: ActiveRenderJob | null;
  exports: ExportArtifact[];
  usage: UsageMetrics;
}

export interface ProjectSummary {
  id: string;
  name: string;
  topic: string;
  category: VideoCategory;
  language: string;
  targetDurationMinutes: number;
  sceneCount: number;
  uploadedImagesCount: number;
  approvedScenesCount: number;
  voiceoverDurationMs: number;
  exportsCount: number;
  renderStatus: ActiveRenderJob['status'] | 'idle';
  createdAt: string;
  updatedAt: string;
  storageBytes: number;
}

export interface VoiceoverStreamProgress {
  phase: 'synthesizing' | 'stitching' | 'analyzing';
  completedSegments: number;
  totalSegments: number;
  chapterTitle?: string;
}

export type ScriptEditAction =
  | 'regenerate_paragraph'
  | 'expand'
  | 'shorten'
  | 'improve'
  | 'rewrite'
  | 'regenerate_chapter';
