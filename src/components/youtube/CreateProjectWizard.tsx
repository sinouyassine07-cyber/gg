import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Captions,
  Film,
  Loader2,
  Mic,
  Music,
  Sparkles,
} from 'lucide-react';
import type { GenerationParams, VoiceModel } from '../../types';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { ytApi } from '../../lib/ytApi';
import type {
  AspectRatio,
  ProjectSettings,
  QualityPreset,
  VideoCategory,
  VideoFps,
  VideoResolution,
  VisualStyle,
  VoiceoverSettings,
} from '../../types/youtube';

interface CreateProjectWizardProps {
  selectedVoice: VoiceModel | null;
  favorites: VoiceModel[];
  defaultParams: GenerationParams;
  onBrowseVoices: () => void;
  onCreateProject: (payload: {
    settings: ProjectSettings;
    voiceoverSettings: Partial<VoiceoverSettings>;
    subtitles: { enabled: boolean; embedded: boolean };
    audioMix: { musicEnabled: boolean };
  }) => Promise<void>;
  yt: YouTubeTranslations;
}

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60];
const SCENE_DURATION_PRESETS = [5, 8, 10, 12, 15, 20];

const CATEGORIES: VideoCategory[] = [
  'documentary',
  'historical-documentary',
  'true-crime',
  'educational',
  'science-tech',
  'mysteries',
  'storytelling',
  'biography',
  'business-finance',
  'news-analysis',
  'entertainment',
];

const VISUAL_STYLES: VisualStyle[] = [
  'cinematic-photorealism',
  'documentary-photography',
  'historical-realism',
  'dark-cinematic',
  '3d-animation',
  'illustration',
  'realistic-photography',
];

export function CreateProjectWizard({
  selectedVoice,
  favorites,
  defaultParams,
  onBrowseVoices,
  onCreateProject,
  yt,
}: CreateProjectWizardProps) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('English');
  const [targetAudience, setTargetAudience] = useState('Curious documentary and storytelling viewers');
  const [category, setCategory] = useState<VideoCategory>('documentary');

  const [durationPreset, setDurationPreset] = useState<number | 'custom'>(15);
  const [customDuration, setCustomDuration] = useState(12);
  const [sceneDurPreset, setSceneDurPreset] = useState<number | 'custom'>(10);
  const [customSceneDur, setCustomSceneDur] = useState(10);

  const [visualStyle, setVisualStyle] = useState<VisualStyle>('cinematic-photorealism');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [fps, setFps] = useState<VideoFps>(30);
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('balanced');
  const [includeResearchNotes, setIncludeResearchNotes] = useState(true);

  const [voiceChoiceId, setVoiceChoiceId] = useState<string>(
    selectedVoice?._id || '__default__'
  );
  const [narrationStyle, setNarrationStyle] = useState(
    'Authoritative, evocative documentary storytelling with crisp pacing'
  );
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitlesEmbedded, setSubtitlesEmbedded] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);

  const [creating, setCreating] = useState(false);
  const [brainstorming, setBrainstorming] = useState(false);
  const [ideas, setIdeas] = useState<
    Array<{ title: string; topicPremise: string; description: string; hookPreview: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  const handleBrainstormIdeas = async () => {
    setError(null);
    setBrainstorming(true);
    try {
      const res = await ytApi.generateIdeas({
        seedTopic: topic.trim() || name.trim() || undefined,
        category,
        language,
        targetAudience,
      });
      setIdeas(res.ideas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to brainstorm video concepts.');
    } finally {
      setBrainstorming(false);
    }
  };

  const targetDurationMinutes = durationPreset === 'custom' ? customDuration : durationPreset;
  const preferredSceneDurationSec = sceneDurPreset === 'custom' ? customSceneDur : sceneDurPreset;
  const approxScenes = Math.max(
    1,
    Math.round((targetDurationMinutes * 60) / Math.max(3, preferredSceneDurationSec))
  );

  // Deduplicate available saved voices (active studio voice + favorites)
  const availableVoices: VoiceModel[] = [];
  const seenIds = new Set<string>();
  if (selectedVoice) {
    availableVoices.push(selectedVoice);
    seenIds.add(selectedVoice._id);
  }
  for (const fav of favorites) {
    if (!seenIds.has(fav._id)) {
      availableVoices.push(fav);
      seenIds.add(fav._id);
    }
  }

  const chosenVoice = availableVoices.find((v) => v._id === voiceChoiceId) || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Please enter your YouTube video topic or idea.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await onCreateProject({
        settings: {
          name: name.trim() || topic.trim().slice(0, 60),
          topic: topic.trim(),
          language: language.trim() || 'English',
          targetAudience: targetAudience.trim() || 'General audience',
          category,
          targetDurationMinutes: Math.max(1, Math.min(90, targetDurationMinutes)),
          preferredSceneDurationSec: Math.max(3, Math.min(45, preferredSceneDurationSec)),
          visualStyle,
          aspectRatio,
          resolution,
          fps,
          qualityPreset,
          includeResearchNotes,
        },
        voiceoverSettings: {
          voiceId: chosenVoice?._id || null,
          voiceName: chosenVoice?.title || 'Fish Audio Default Narrator',
          voiceAuthor: chosenVoice?.author?.nickname,
          model: defaultParams.model,
          format: defaultParams.format === 'pcm' ? 'mp3' : defaultParams.format,
          sampleRate: defaultParams.sample_rate,
          mp3Bitrate: defaultParams.mp3_bitrate,
          speed: defaultParams.speed,
          volume: defaultParams.volume,
          temperature: defaultParams.temperature,
          topP: defaultParams.top_p,
          repetitionPenalty: defaultParams.repetition_penalty,
          chunkLength: defaultParams.chunk_length,
          normalize: defaultParams.normalize,
          latency: defaultParams.latency,
          segmentPauseMs: defaultParams.segment_pause_ms,
          parallelConcurrency: defaultParams.parallel_concurrency,
          narrationStyle: narrationStyle.trim(),
          pronunciationRules: [],
        },
        subtitles: {
          enabled: subtitlesEnabled,
          embedded: subtitlesEmbedded,
        },
        audioMix: {
          musicEnabled,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {yt.nav['yt-create']}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure your long-form YouTube video topic, pacing, Smart Duration target, narrator voice, visual direction, and export format.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Core Topic & Metadata */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>01. Video Concept & Audience</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Lost Expedition of 1924"
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Video Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as VideoCategory)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {yt.categories[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="text-xs text-slate-400">
              Video Topic or Detailed Idea *
            </label>
            <button
              type="button"
              onClick={handleBrainstormIdeas}
              disabled={brainstorming}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-indigo-400/35 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-50 text-xs font-medium text-indigo-100 transition-colors whitespace-nowrap"
            >
              {brainstorming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{brainstorming ? 'Generating Ideas...' : 'AI Ideas, Titles & Descriptions'}</span>
            </button>
          </div>
          <textarea
            rows={3}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            required
            dir="auto"
            placeholder="Describe the story, documentary premise, key angles, or mystery to cover..."
            className="w-full rounded-lg border border-white/10 bg-[#070910] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
          />
        </div>

        {ideas.length > 0 && (
          <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
            <div className="text-xs font-semibold text-indigo-300">
              Select an AI-generated title, premise &amp; description:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ideas.map((idea, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setName(idea.title);
                    setTopic(`${idea.topicPremise}\n\nYouTube Description:\n${idea.description}`);
                  }}
                  className="text-start rounded-lg border border-white/10 bg-[#070910] hover:border-indigo-400/60 p-3.5 space-y-1.5 transition-colors"
                >
                  <div dir="auto" className="text-xs font-semibold text-white">
                    {idea.title}
                  </div>
                  <div dir="auto" className="text-[11px] text-slate-300 line-clamp-2">
                    {idea.topicPremise}
                  </div>
                  <div dir="auto" className="text-[11px] text-slate-500 line-clamp-2">
                    {idea.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Video Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
            >
              <option value="English">English</option>
              <option value="Arabic">Arabic (العربية)</option>
              <option value="Spanish">Spanish (Español)</option>
              <option value="French">French (Français)</option>
              <option value="German">German (Deutsch)</option>
              <option value="Portuguese">Portuguese (Português)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Target Audience</label>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g. History enthusiasts, true crime fans"
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={includeResearchNotes}
            onChange={(e) => setIncludeResearchNotes(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-[#070910] accent-indigo-500"
          />
          <span>
            Include factual research context notes (strictly avoids fabricated citations)
          </span>
        </label>
      </section>

      {/* 2. Duration & Smart Scene Pacing */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Film className="w-4 h-4 text-indigo-400" />
            <span>02. Video Duration & Smart Scene Pacing</span>
          </div>
          <span className="text-xs font-mono tabular-nums text-indigo-300">
            Estimated ~{approxScenes} smart scenes ({targetDurationMinutes}m total · ~{preferredSceneDurationSec}s avg)
          </span>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2">Target Video Duration</label>
          <div className="flex flex-wrap items-center gap-2">
            {DURATION_PRESETS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setDurationPreset(min)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono tabular-nums font-medium border transition-colors whitespace-nowrap ${
                  durationPreset === min
                    ? 'bg-indigo-500 border-indigo-400 text-white'
                    : 'bg-[#070910] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                {min} min
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDurationPreset('custom')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                durationPreset === 'custom'
                  ? 'bg-indigo-500 border-indigo-400 text-white'
                  : 'bg-[#070910] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              Custom
            </button>
            {durationPreset === 'custom' && (
              <input
                type="number"
                min={1}
                max={90}
                value={customDuration}
                onChange={(e) => setCustomDuration(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-lg border border-indigo-400 bg-[#070910] px-3 py-1.5 text-xs font-mono text-white focus:outline-none"
              />
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2">
            Preferred Average Scene Duration (Smart Duration flexes around natural sentences & visual shifts)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {SCENE_DURATION_PRESETS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setSceneDurPreset(sec)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono tabular-nums font-medium border transition-colors whitespace-nowrap ${
                  sceneDurPreset === sec
                    ? 'bg-indigo-500 border-indigo-400 text-white'
                    : 'bg-[#070910] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                {sec}s
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSceneDurPreset('custom')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                sceneDurPreset === 'custom'
                  ? 'bg-indigo-500 border-indigo-400 text-white'
                  : 'bg-[#070910] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              Custom
            </button>
            {sceneDurPreset === 'custom' && (
              <input
                type="number"
                min={3}
                max={45}
                value={customSceneDur}
                onChange={(e) => setCustomSceneDur(Math.max(3, Number(e.target.value) || 3))}
                className="w-24 rounded-lg border border-indigo-400 bg-[#070910] px-3 py-1.5 text-xs font-mono text-white focus:outline-none"
              />
            )}
          </div>
        </div>
      </section>

      {/* 3. Narrator & Visual Direction */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Mic className="w-4 h-4 text-indigo-400" />
          <span>03. Narrator Voice & Visual Style</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-slate-400">Narrator Voice (Fish Audio)</label>
              <button
                type="button"
                onClick={onBrowseVoices}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Browse Voice Library
              </button>
            </div>
            <select
              value={voiceChoiceId}
              onChange={(e) => setVoiceChoiceId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
            >
              <option value="__default__">Fish Audio Default Narrator</option>
              {availableVoices.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.title} {v.author?.nickname ? `(${v.author.nickname})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Narration Style</label>
            <input
              type="text"
              value={narrationStyle}
              onChange={(e) => setNarrationStyle(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Visual Style</label>
            <select
              value={visualStyle}
              onChange={(e) => setVisualStyle(e.target.value as VisualStyle)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
            >
              {VISUAL_STYLES.map((st) => (
                <option key={st} value={st}>
                  {yt.visualStyles[st]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Aspect Ratio</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
            >
              <option value="16:9">16:9 YouTube Standard</option>
              <option value="9:16">9:16 Vertical Shorts</option>
              <option value="1:1">1:1 Square</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Resolution</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as VideoResolution)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
            >
              <option value="1080p">1080p Full HD</option>
              <option value="4k">4K Ultra HD</option>
              <option value="720p">720p HD Fast</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Frame Rate & Quality</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value) as VideoFps)}
                className="rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
              >
                <option value={24}>24 FPS</option>
                <option value={25}>25 FPS</option>
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>
              <select
                value={qualityPreset}
                onChange={(e) => setQualityPreset(e.target.value as QualityPreset)}
                className="rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-400"
              >
                <option value="high">High</option>
                <option value="balanced">Balanced</option>
                <option value="economy">Economy</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <Captions className="w-4 h-4 text-indigo-400" />
              Subtitles:
            </span>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={subtitlesEnabled}
                onChange={(e) => setSubtitlesEnabled(e.target.checked)}
                className="h-4 w-4 accent-indigo-500"
              />
              <span>Generate Synchronized Subtitles</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={subtitlesEmbedded}
                onChange={(e) => setSubtitlesEmbedded(e.target.checked)}
                disabled={!subtitlesEnabled}
                className="h-4 w-4 accent-indigo-500"
              />
              <span>Burn into MP4</span>
            </label>
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <Music className="w-4 h-4 text-indigo-400" />
              Audio Mix:
            </span>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={musicEnabled}
                onChange={(e) => setMusicEnabled(e.target.checked)}
                className="h-4 w-4 accent-indigo-500"
              />
              <span>Enable Background Music with Auto-Ducking</span>
            </label>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-colors"
        >
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Creating Project...</span>
            </>
          ) : (
            <>
              <span>Create Project & Open AI Script Studio</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
