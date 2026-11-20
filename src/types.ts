export type UILanguage = 'en' | 'ar';

export type NavSection =
  | 'studio'
  | 'library'
  | 'history'
  | 'favorites'
  | 'settings'
  | 'api-config';

export type FishAudioModel = 's2.1-pro' | 's2.1-pro-free' | 's2-pro' | 's1';

export type AudioFormat = 'mp3' | 'wav' | 'opus' | 'pcm';

export type LatencyMode = 'normal' | 'balanced';

export interface GenerationParams {
  model: FishAudioModel;
  format: AudioFormat;
  mp3_bitrate: 64 | 128 | 192;
  opus_bitrate: 24 | 32 | 48 | 64 | -1000;
  sample_rate: number | null;
  speed: number;
  volume: number;
  temperature: number;
  top_p: number;
  repetition_penalty: number;
  chunk_length: number;
  normalize: boolean;
  latency: LatencyMode;
  continuous_narration: boolean;
  segment_pause_ms: 0 | 150 | 350;
  parallel_concurrency: 1 | 2 | 3;
}

export interface GenerationProgress {
  phase: 'splitting' | 'generating' | 'stitching';
  currentSegment: number;
  completedSegments?: number;
  totalSegments: number;
  segmentText?: string;
}

export interface DirectedSegment {
  id: string;
  text: string;
  emotionTag: string;
  speed: number | null;
  voiceMode: 'global' | 'default' | 'custom';
  voiceId: string | null;
  voiceName?: string;
}

export interface DirectedSegmentPayload {
  text: string;
  emotionTag?: string;
  speed?: number | null;
  voiceId?: string | null;
}

export interface VoiceSample {
  title?: string;
  text?: string;
  task_id?: string;
  audio: string;
}

export interface VoiceAuthor {
  _id?: string;
  nickname?: string;
  avatar?: string;
}

export interface VoiceModel {
  _id: string;
  title: string;
  description?: string;
  cover_image?: string;
  tags?: string[];
  languages?: string[];
  visibility?: string;
  task_count?: number;
  like_count?: number;
  created_at?: string;
  author?: VoiceAuthor;
  samples?: VoiceSample[];
}

export type TranscriptSource = 'segment-exact' | 'fish-asr' | 'gemini-ai' | 'acoustic-align';

export type TranscriptFormat = 'srt' | 'vtt' | 'txt' | 'json';

export interface TranscriptCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface GenerationRecord {
  id: string;
  text: string;
  voiceId: string | null;
  voiceName: string;
  voiceAuthor?: string;
  model: FishAudioModel;
  format: AudioFormat;
  sampleRate: number | null;
  bitrate: number | null;
  speed: number;
  volume: number;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  latency: LatencyMode;
  normalize: boolean;
  chunkLength: number;
  segmentCount?: number;
  durationSeconds?: number;
  transcript?: TranscriptCue[];
  transcriptSource?: TranscriptSource;
  fileSizeBytes: number;
  createdAt: string;
  audioUrl: string;
  downloadUrl: string;
}

export interface ApiConfigStatus {
  configured: boolean;
  source: 'env' | 'user' | 'none';
  maskedKey: string | null;
  credit: number | null;
  updatedAt: string | null;
}

export interface UserPreferences {
  uiLanguage: UILanguage;
  defaultParams: GenerationParams;
  selectedVoice: VoiceModel | null;
}

export const DEFAULT_GENERATION_PARAMS: GenerationParams = {
  model: 's2.1-pro-free',
  format: 'mp3',
  mp3_bitrate: 128,
  opus_bitrate: 32,
  sample_rate: 44100,
  speed: 1.0,
  volume: 0.0,
  temperature: 0.7,
  top_p: 0.7,
  repetition_penalty: 1.2,
  chunk_length: 200,
  normalize: true,
  latency: 'balanced',
  continuous_narration: true,
  segment_pause_ms: 150,
  parallel_concurrency: 3,
};
