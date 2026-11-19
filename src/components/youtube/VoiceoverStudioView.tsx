import { useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Download,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { ApiConfigStatus, FishAudioModel, VoiceModel } from '../../types';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { formatFileSize } from '../../lib/formatters';
import { ytApi } from '../../lib/ytApi';
import { downloadRemoteBinaryFile, formatShortClock } from '../../lib/ytExport';
import type {
  PronunciationRule,
  VoiceoverSettings,
  VoiceoverStreamProgress,
  YouTubeProject,
} from '../../types/youtube';

interface VoiceoverStudioViewProps {
  project: YouTubeProject;
  selectedVoice: VoiceModel | null;
  favorites: VoiceModel[];
  configStatus: ApiConfigStatus | null;
  onProjectChange: (next: YouTubeProject) => void;
  onSavePatch: (patch: Partial<YouTubeProject>) => Promise<void>;
  onOpenApiConfig: () => void;
  onBrowseVoices: () => void;
  onGoToScenes: () => void;
  yt: YouTubeTranslations;
}

export function VoiceoverStudioView({
  project,
  selectedVoice,
  favorites,
  configStatus,
  onProjectChange,
  onSavePatch,
  onOpenApiConfig,
  onBrowseVoices,
  onGoToScenes,
  yt,
}: VoiceoverStudioViewProps) {
  const [generating, setGenerating] = useState(false);
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState<'auto' | 'acoustic' | 'fish-asr' | 'gemini'>('auto');
  const [progress, setProgress] = useState<VoiceoverStreamProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ruleFrom, setRuleFrom] = useState('');
  const [ruleTo, setRuleTo] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voSettings = project.voiceoverSettings;
  const vo = project.voiceover;

  const voiceChoices: VoiceModel[] = [];
  const seen = new Set<string>();
  if (selectedVoice) {
    voiceChoices.push(selectedVoice);
    seen.add(selectedVoice._id);
  }
  for (const fav of favorites) {
    if (!seen.has(fav._id)) {
      voiceChoices.push(fav);
      seen.add(fav._id);
    }
  }

  const updateVoSettings = async (patch: Partial<VoiceoverSettings>) => {
    const next = { ...voSettings, ...patch };
    onProjectChange({ ...project, voiceoverSettings: next });
    await onSavePatch({ voiceoverSettings: next });
  };

  const handleGenerate = async (chapterId?: string) => {
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setGenerating(true);
    setGeneratingChapterId(chapterId || null);
    setProgress(null);

    try {
      const res = await ytApi.generateVoiceoverStream(
        project.id,
        {
          chapterId,
          voiceoverSettings: voSettings,
        },
        {
          signal: ctrl.signal,
          onProgress: (p) => setProgress(p),
        }
      );
      onProjectChange(res.project);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Voiceover synthesis failed.');
      }
    } finally {
      abortRef.current = null;
      setGenerating(false);
      setGeneratingChapterId(null);
      setProgress(null);
    }
  };

  const handleAnalyzeAudio = async () => {
    setError(null);
    setAnalyzing(true);
    try {
      const res = await ytApi.analyzeVoiceover(project.id, analyzeMode);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to analyze voiceover timing.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddPronunciationRule = async () => {
    if (!ruleFrom.trim() || !ruleTo.trim()) return;
    const rule: PronunciationRule = {
      id: `pr_${Date.now()}`,
      from: ruleFrom.trim(),
      to: ruleTo.trim(),
      caseSensitive: false,
    };
    await updateVoSettings({
      pronunciationRules: [...(voSettings.pronunciationRules || []), rule],
    });
    setRuleFrom('');
    setRuleTo('');
  };

  const scriptApproved = Boolean(project.script?.approved);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-voiceover']}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Synthesize long-form narration via Fish Audio, refine chapter audio, and analyze real speech timestamps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {generating ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-500/40 bg-rose-500/15 text-xs font-semibold text-rose-200"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel Synthesis</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleGenerate()}
              disabled={!scriptApproved || !configStatus?.configured}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>
                {vo.audioFileName ? 'Regenerate Complete Voiceover' : 'Generate Complete Voiceover'}
              </span>
            </button>
          )}

          {vo.cues.length > 0 && vo.durationMs > 0 && (
            <button
              type="button"
              onClick={onGoToScenes}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white whitespace-nowrap"
            >
              <span>Smart Scene Director</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!configStatus?.configured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Fish Audio API key is required to generate voiceovers.</span>
          </div>
          <button
            type="button"
            onClick={onOpenApiConfig}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold"
          >
            Configure API Key
          </button>
        </div>
      )}

      {!scriptApproved && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Please approve your script in AI Script Studio before generating the complete voiceover.</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {generating && progress && (
        <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-indigo-100">
            <span className="inline-flex items-center gap-2 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {progress.phase === 'stitching'
                ? 'Stitching chapters seamlessly with FFmpeg...'
                : progress.phase === 'analyzing'
                  ? 'Measuring exact audio duration and timestamps...'
                  : `Synthesizing ${progress.chapterTitle || 'narration'} (${progress.completedSegments}/${progress.totalSegments})`}
            </span>
            <span className="font-mono tabular-nums">
              {progress.totalSegments > 0
                ? Math.round((progress.completedSegments / progress.totalSegments) * 100)
                : 0}
              %
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-indigo-400 transition-all duration-300"
              style={{
                width: `${
                  progress.totalSegments > 0
                    ? Math.round((progress.completedSegments / progress.totalSegments) * 100)
                    : 10
                }%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Voice & Prosody Configuration */}
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Fish Audio Narrator Settings</h2>
            <button
              type="button"
              onClick={onBrowseVoices}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Browse Library
            </button>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Narrator Voice</label>
            <select
              value={voSettings.voiceId || '__default__'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__default__') {
                  updateVoSettings({
                    voiceId: null,
                    voiceName: 'Fish Audio Default Narrator',
                    voiceAuthor: undefined,
                  });
                } else {
                  const found = voiceChoices.find((v) => v._id === val);
                  updateVoSettings({
                    voiceId: val,
                    voiceName: found?.title || 'Saved Voice',
                    voiceAuthor: found?.author?.nickname,
                  });
                }
              }}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
            >
              <option value="__default__">Fish Audio Default Narrator</option>
              {voSettings.voiceId && !voiceChoices.some((v) => v._id === voSettings.voiceId) && (
                <option value={voSettings.voiceId}>{voSettings.voiceName}</option>
              )}
              {voiceChoices.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Model</label>
              <select
                value={voSettings.model}
                onChange={(e) => updateVoSettings({ model: e.target.value as FishAudioModel })}
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-xs text-white focus:outline-none"
              >
                <option value="s2.1-pro-free">S2.1 Pro Free</option>
                <option value="s2.1-pro">S2.1 Pro</option>
                <option value="s2-pro">S2 Pro</option>
                <option value="s1">S1 Legacy</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Concurrency</label>
              <select
                value={voSettings.parallelConcurrency}
                onChange={(e) =>
                  updateVoSettings({ parallelConcurrency: Number(e.target.value) as 1 | 2 | 3 })
                }
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-xs text-white focus:outline-none"
              >
                <option value={1}>Sequential (1x)</option>
                <option value={2}>Fast (2x)</option>
                <option value={3}>Turbo (3x)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Speed</span>
                <span className="font-mono tabular-nums text-white">{voSettings.speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.5}
                step={0.05}
                value={voSettings.speed}
                onChange={(e) => updateVoSettings({ speed: Number(e.target.value) })}
                className="studio-range w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Temperature</span>
                <span className="font-mono tabular-nums text-white">{voSettings.temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={voSettings.temperature}
                onChange={(e) => updateVoSettings({ temperature: Number(e.target.value) })}
                className="studio-range w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Pause Between Segments</label>
              <select
                value={voSettings.segmentPauseMs}
                onChange={(e) =>
                  updateVoSettings({ segmentPauseMs: Number(e.target.value) as 0 | 150 | 350 })
                }
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-2 text-xs text-white focus:outline-none"
              >
                <option value={0}>Seamless (0 ms)</option>
                <option value={150}>Natural (150 ms)</option>
                <option value={350}>Deliberate (350 ms)</option>
              </select>
            </div>
          </div>

          {/* Pronunciation Corrections */}
          <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
            <div className="text-xs font-semibold text-white">Pronunciation Corrections</div>
            <div className="grid grid-cols-5 gap-1.5">
              <input
                type="text"
                value={ruleFrom}
                onChange={(e) => setRuleFrom(e.target.value)}
                placeholder="Word"
                className="col-span-2 rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-xs text-white focus:outline-none"
              />
              <input
                type="text"
                value={ruleTo}
                onChange={(e) => setRuleTo(e.target.value)}
                placeholder="Phonetic"
                className="col-span-2 rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-xs text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddPronunciationRule}
                className="rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {(voSettings.pronunciationRules || []).length > 0 && (
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {voSettings.pronunciationRules.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-xs px-2.5 py-1 rounded bg-[#070910] border border-white/[0.06]"
                  >
                    <span className="text-slate-300 truncate">
                      {r.from} → <strong className="text-indigo-300">{r.to}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateVoSettings({
                          pronunciationRules: voSettings.pronunciationRules.filter((x) => x.id !== r.id),
                        })
                      }
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Master Audio Preview, Chapters & Real Timing Analysis */}
        <div className="lg:col-span-2 space-y-5">
          {/* Master Player & Analysis Controls */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-white">Master Voiceover Track</h2>
              </div>
              {vo.audioFileName && (
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-400">
                  <span>Real Duration: {formatShortClock(vo.durationMs)}</span>
                  <span>·</span>
                  <span>{formatFileSize(vo.fileSizeBytes)}</span>
                  <span>·</span>
                  <span>{vo.cues.length} cues</span>
                  {vo.words && vo.words.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{vo.words.length} words</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {vo.audioUrl ? (
              <div className="space-y-4">
                <audio
                  ref={audioRef}
                  controls
                  src={vo.audioUrl}
                  className="w-full h-10"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={analyzeMode}
                      onChange={(e) =>
                        setAnalyzeMode(e.target.value as 'auto' | 'acoustic' | 'fish-asr' | 'gemini')
                      }
                      className="rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                    >
                      <option value="auto">Auto Alignment (Best Available)</option>
                      <option value="acoustic">FFmpeg Acoustic Silence Alignment</option>
                      <option value="fish-asr">Fish Audio ASR</option>
                      <option value="gemini">Gemini Audio AI</option>
                    </select>

                    <button
                      type="button"
                      onClick={handleAnalyzeAudio}
                      disabled={analyzing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-400/35 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-50 text-xs font-semibold text-indigo-100"
                    >
                      {analyzing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Activity className="w-3.5 h-3.5" />
                      )}
                      <span>{analyzing ? 'Analyzing Audio...' : 'Analyze Real Audio Timing'}</span>
                    </button>
                  </div>

                  {vo.downloadUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        downloadRemoteBinaryFile(
                          vo.downloadUrl!,
                          `${project.settings.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-voiceover.${vo.format}`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200"
                    >
                      <Download className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Download {vo.format.toUpperCase()}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                No master voiceover has been generated yet. Click <strong>Generate Complete Voiceover</strong> above to synthesize and measure the actual narration audio.
              </p>
            )}
          </div>

          {/* Chapter-by-Chapter Audio Breakdown */}
          {vo.chapterAudios.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">
                Chapter Audio Modules (Regenerate Any Section Independently)
              </h2>
              <div className="divide-y divide-white/[0.06]">
                {vo.chapterAudios.map((ch) => (
                  <div
                    key={ch.chapterId}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-white truncate">
                        {ch.chapterTitle}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-400">
                        {formatShortClock(ch.durationMs)} · {formatFileSize(ch.fileSizeBytes)} ·{' '}
                        {ch.cues.length} cues
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <audio controls src={ch.audioUrl} className="h-8 w-44" />
                      <button
                        type="button"
                        disabled={generating}
                        onClick={() => handleGenerate(ch.chapterId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 text-xs text-slate-200 whitespace-nowrap"
                      >
                        {generating && generatingChapterId === ch.chapterId ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3 text-indigo-400" />
                        )}
                        <span>Regenerate</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analyzed Timestamps Preview */}
          {vo.cues.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  Analyzed Speech Cues ({vo.transcriptSource || 'segment-exact'})
                </h2>
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  Click any timestamp to seek
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#070910] divide-y divide-white/[0.06]">
                {vo.cues.map((cue) => (
                  <button
                    key={cue.index}
                    type="button"
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = cue.startMs / 1000;
                        audioRef.current.play().catch(() => undefined);
                      }
                    }}
                    className="w-full text-start px-3 py-2 flex items-baseline gap-2.5 hover:bg-white/[0.04] transition-colors"
                  >
                    <span dir="ltr" className="text-xs font-mono tabular-nums text-indigo-400 shrink-0">
                      ({formatShortClock(cue.startMs)})
                    </span>
                    <span dir="auto" className="text-xs text-slate-200 leading-relaxed">
                      {cue.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
