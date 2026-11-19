import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Captions,
  Film,
  Loader2,
  Music,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Zap,
} from 'lucide-react';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { ytApi } from '../../lib/ytApi';
import { formatShortClock } from '../../lib/ytExport';
import type {
  AudioMixSettings,
  MotionEffect,
  TransitionType,
  YouTubeProject,
} from '../../types/youtube';

interface AutoVideoEditorViewProps {
  project: YouTubeProject;
  onProjectChange: (next: YouTubeProject) => void;
  onSavePatch: (patch: Partial<YouTubeProject>) => Promise<void>;
  onGoToSubtitles: () => void;
  onGoToExport: () => void;
  yt: YouTubeTranslations;
}

export function AutoVideoEditorView({
  project,
  onProjectChange,
  onSavePatch,
  onGoToSubtitles,
  onGoToExport,
  yt,
}: AutoVideoEditorViewProps) {
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(
    project.scenes[0]?.id || null
  );
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [uploadingSfx, setUploadingSfx] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicFileRef = useRef<HTMLInputElement | null>(null);
  const sfxFileRef = useRef<HTMLInputElement | null>(null);

  const scenes = project.scenes || [];
  const cues = project.voiceover.cues || [];
  const mix = project.audioMix;
  const totalDurationMs =
    project.voiceover.durationMs ||
    (scenes.length > 0 ? scenes[scenes.length - 1].endMs : 0);

  const activeScene = useMemo(
    () =>
      scenes.find((s) => playheadMs >= s.startMs && playheadMs <= s.endMs) ||
      scenes.find((s) => s.id === selectedSceneId) ||
      scenes[0] ||
      null,
    [scenes, playheadMs, selectedSceneId]
  );

  const activeCue = useMemo(
    () => cues.find((c) => playheadMs >= c.startMs && playheadMs <= c.endMs) || null,
    [cues, playheadMs]
  );

  // Synchronize voiceover + background music with live ducking simulation in preview player
  useEffect(() => {
    const voEl = voiceAudioRef.current;
    const bgEl = musicAudioRef.current;
    if (!voEl) return;

    const onTimeUpdate = () => {
      const ms = Math.round(voEl.currentTime * 1000);
      setPlayheadMs(ms);
      if (bgEl && mix.musicEnabled) {
        const speaking = cues.some((c) => ms >= c.startMs && ms <= c.endMs);
        const targetVol = mix.duckingEnabled && speaking
          ? Math.max(0.03, mix.musicVolume * (1 - mix.duckingAmount))
          : mix.musicVolume;
        bgEl.volume = Math.min(1, Math.max(0, targetVol));
      }
    };

    const onEnded = () => {
      setPlaying(false);
      bgEl?.pause();
    };

    voEl.addEventListener('timeupdate', onTimeUpdate);
    voEl.addEventListener('ended', onEnded);
    return () => {
      voEl.removeEventListener('timeupdate', onTimeUpdate);
      voEl.removeEventListener('ended', onEnded);
    };
  }, [cues, mix.duckingAmount, mix.duckingEnabled, mix.musicEnabled, mix.musicVolume]);

  const togglePlayback = async () => {
    const voEl = voiceAudioRef.current;
    const bgEl = musicAudioRef.current;
    if (!voEl || !project.voiceover.audioUrl) return;

    if (playing) {
      voEl.pause();
      bgEl?.pause();
      setPlaying(false);
    } else {
      voEl.volume = Math.min(1, Math.max(0, mix.voiceoverVolume));
      await voEl.play().catch(() => undefined);
      if (bgEl && mix.musicEnabled && mix.musicTrack?.audioUrl) {
        bgEl.loop = true;
        bgEl.volume = mix.musicVolume;
        bgEl.play().catch(() => undefined);
      }
      setPlaying(true);
    }
  };

  const seekToMs = (ms: number) => {
    const clamped = Math.max(0, Math.min(totalDurationMs, ms));
    setPlayheadMs(clamped);
    if (voiceAudioRef.current) {
      voiceAudioRef.current.currentTime = clamped / 1000;
    }
  };

  const updateMix = async (patch: Partial<AudioMixSettings>) => {
    const next = { ...mix, ...patch };
    onProjectChange({ ...project, audioMix: next });
    await onSavePatch({ audioMix: next });
  };

  const updateSceneAt = async (idx: number, patch: Partial<(typeof scenes)[number]>) => {
    const next = scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onProjectChange({ ...project, scenes: next });
    await onSavePatch({ scenes: next });
  };

  const swapScenes = async (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= scenes.length || j >= scenes.length) return;
    const next = [...scenes];
    const a = next[i];
    const b = next[j];
    next[i] = {
      ...a,
      visualDescription: b.visualDescription,
      imagePrompt: b.imagePrompt,
      image: b.image,
      uploadStatus: b.uploadStatus,
      motionEffect: b.motionEffect,
      transitionType: b.transitionType,
    };
    next[j] = {
      ...b,
      visualDescription: a.visualDescription,
      imagePrompt: a.imagePrompt,
      image: a.image,
      uploadStatus: a.uploadStatus,
      motionEffect: a.motionEffect,
      transitionType: a.transitionType,
    };
    onProjectChange({ ...project, scenes: next });
    await onSavePatch({ scenes: next });
  };

  const selectedSceneIdx = scenes.findIndex((s) => s.id === (selectedSceneId || activeScene?.id));
  const selectedScene = selectedSceneIdx >= 0 ? scenes[selectedSceneIdx] : activeScene;

  // Compute live CSS transform reflecting selected motion effect during preview
  const getPreviewTransform = () => {
    if (!activeScene || activeScene.motionDisabled) return 'scale(1)';
    const progress =
      activeScene.durationMs > 0
        ? Math.min(1, Math.max(0, (playheadMs - activeScene.startMs) / activeScene.durationMs))
        : 0;
    switch (activeScene.motionEffect) {
      case 'slow-zoom-out':
        return `scale(${(1.14 - progress * 0.14).toFixed(3)})`;
      case 'pan-left':
        return `scale(1.12) translateX(${(4 - progress * 8).toFixed(2)}%)`;
      case 'pan-right':
        return `scale(1.12) translateX(${(-4 + progress * 8).toFixed(2)}%)`;
      case 'pan-up':
        return `scale(1.12) translateY(${(4 - progress * 8).toFixed(2)}%)`;
      case 'pan-down':
        return `scale(1.12) translateY(${(-4 + progress * 8).toFixed(2)}%)`;
      case 'static':
        return 'scale(1)';
      default:
        return `scale(${(1 + progress * 0.14).toFixed(3)})`;
    }
  };

  return (
    <div className="space-y-6">
      <input
        ref={musicFileRef}
        type="file"
        accept="audio/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setUploadingMusic(true);
          setError(null);
          try {
            const res = await ytApi.uploadMusicTrack(project.id, file);
            onProjectChange(res.project);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Music upload failed.');
          } finally {
            setUploadingMusic(false);
          }
        }}
        className="hidden"
      />
      <input
        ref={sfxFileRef}
        type="file"
        accept="audio/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setUploadingSfx(true);
          setError(null);
          try {
            const res = await ytApi.uploadSfxCue(project.id, file, playheadMs);
            onProjectChange(res.project);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'SFX upload failed.');
          } finally {
            setUploadingSfx(false);
          }
        }}
        className="hidden"
      />

      {project.voiceover.audioUrl && (
        <audio ref={voiceAudioRef} src={project.voiceover.audioUrl} preload="metadata" />
      )}
      {mix.musicTrack?.audioUrl && (
        <audio ref={musicAudioRef} src={mix.musicTrack.audioUrl} preload="metadata" />
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-editor']}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Non-destructive multi-track timeline preview with real voiceover, auto-ducked background music, transitions, and synchronized subtitles.
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToExport}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white whitespace-nowrap"
        >
          <span>Render & Export MP4</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Top Row: Live Preview Monitor + Selected Scene Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-xl border border-white/[0.08] bg-[#0c101b] p-4 space-y-3">
          <div className="aspect-video rounded-lg overflow-hidden bg-black border border-white/10 relative flex items-center justify-center">
            {activeScene?.image ? (
              <img
                src={activeScene.image.imageUrl}
                alt={`Scene ${activeScene.sceneNumber}`}
                style={{ transform: getPreviewTransform() }}
                className="w-full h-full object-cover transition-transform duration-150 ease-linear"
              />
            ) : (
              <div className="text-xs text-slate-400">
                {scenes.length === 0
                  ? 'Plan scenes first to preview timeline.'
                  : `Scene #${activeScene?.sceneNumber || 1} missing uploaded image`}
              </div>
            )}

            {project.subtitles.enabled && activeCue && (
              <div className="absolute inset-x-0 bottom-5 px-6 flex justify-center pointer-events-none">
                <div
                  dir="auto"
                  style={{
                    color: project.subtitles.textColor,
                    backgroundColor: `rgba(7, 9, 16, ${project.subtitles.backgroundOpacity})`,
                  }}
                  className="px-3.5 py-1.5 rounded-md text-sm font-semibold text-center max-w-[85%]"
                >
                  {activeCue.text}
                </div>
              </div>
            )}
          </div>

          {/* Transport Scrubber */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlayback}
              disabled={!project.voiceover.audioUrl}
              className="w-9 h-9 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white flex items-center justify-center shrink-0"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <span className="text-xs font-mono tabular-nums text-slate-300 shrink-0">
              {formatShortClock(playheadMs)} / {formatShortClock(totalDurationMs)}
            </span>

            <input
              type="range"
              min={0}
              max={Math.max(1000, totalDurationMs)}
              step={100}
              value={playheadMs}
              onChange={(e) => seekToMs(Number(e.target.value))}
              className="studio-range flex-1"
            />
          </div>
        </div>

        {/* Selected Clip & Audio Mix Inspector */}
        <div className="lg:col-span-4 rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4">
          <div className="text-sm font-semibold text-white">
            {selectedScene
              ? `Clip Inspector · Scene #${selectedScene.sceneNumber}`
              : 'Timeline Inspector'}
          </div>

          {selectedScene && selectedSceneIdx >= 0 && (
            <div className="space-y-3 pb-4 border-b border-white/[0.06] text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Reorder Clip</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={selectedSceneIdx === 0}
                    onClick={() => swapScenes(selectedSceneIdx, selectedSceneIdx - 1)}
                    className="p-1.5 rounded border border-white/10 bg-[#070910] disabled:opacity-30 text-slate-200"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={selectedSceneIdx === scenes.length - 1}
                    onClick={() => swapScenes(selectedSceneIdx, selectedSceneIdx + 1)}
                    className="p-1.5 rounded border border-white/10 bg-[#070910] disabled:opacity-30 text-slate-200"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Motion Effect</label>
                <select
                  value={selectedScene.motionEffect}
                  onChange={(e) =>
                    updateSceneAt(selectedSceneIdx, {
                      motionEffect: e.target.value as MotionEffect,
                      motionDisabled: e.target.value === 'static',
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-white"
                >
                  {(Object.keys(yt.motions) as MotionEffect[]).map((m) => (
                    <option key={m} value={m}>
                      {yt.motions[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Outgoing Transition</label>
                  <select
                    value={selectedScene.transitionType}
                    onChange={(e) =>
                      updateSceneAt(selectedSceneIdx, {
                        transitionType: e.target.value as TransitionType,
                      })
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#070910] px-2 py-1.5 text-white"
                  >
                    {(Object.keys(yt.transitions) as TransitionType[]).map((tr) => (
                      <option key={tr} value={tr}>
                        {yt.transitions[tr]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Trans. ms</label>
                  <input
                    type="number"
                    step={50}
                    min={0}
                    max={2000}
                    value={selectedScene.transitionDurationMs}
                    onChange={(e) =>
                      updateSceneAt(selectedSceneIdx, {
                        transitionDurationMs: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#070910] px-2 py-1.5 font-mono text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Background Music & Mixing Controls */}
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                <Music className="w-3.5 h-3.5 text-indigo-400" />
                <span>Background Music & Ducking</span>
              </span>
              <input
                type="checkbox"
                checked={mix.musicEnabled}
                onChange={(e) => updateMix({ musicEnabled: e.target.checked })}
                className="accent-indigo-500 h-4 w-4"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['documentary-pad', 'Documentary Pad'],
                  ['dark-tension', 'Dark Tension'],
                  ['warm-piano-drone', 'Narrative Ambient'],
                ] as const
              ).map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  disabled={generatingMusic}
                  onClick={async () => {
                    setGeneratingMusic(true);
                    setError(null);
                    try {
                      const res = await ytApi.createBuiltinMusic(project.id, preset);
                      onProjectChange(res.project);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Music generation failed.');
                    } finally {
                      setGeneratingMusic(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 bg-[#070910] hover:border-indigo-400/50 text-[11px] text-slate-200"
                >
                  {generatingMusic ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                  )}
                  <span>{label}</span>
                </button>
              ))}

              <button
                type="button"
                disabled={uploadingMusic}
                onClick={() => musicFileRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-indigo-400/35 bg-indigo-500/15 text-[11px] text-indigo-100"
              >
                <Upload className="w-3 h-3" />
                <span>{uploadingMusic ? 'Uploading...' : 'Upload Music'}</span>
              </button>
            </div>

            {mix.musicTrack && (
              <div className="text-[11px] font-mono text-emerald-300 truncate">
                Active track: {mix.musicTrack.name}
              </div>
            )}

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Music Volume</span>
                <span className="font-mono text-white">{Math.round(mix.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={0.8}
                step={0.02}
                value={mix.musicVolume}
                onChange={(e) => updateMix({ musicVolume: Number(e.target.value) })}
                className="studio-range w-full"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mix.duckingEnabled}
                  onChange={(e) => updateMix({ duckingEnabled: e.target.checked })}
                  className="accent-indigo-500"
                />
                <span>Auto-Ducking</span>
              </label>
              <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mix.loudnessNormalization}
                  onChange={(e) => updateMix({ loudnessNormalization: e.target.checked })}
                  className="accent-indigo-500"
                />
                <span>-14 LUFS Norm</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Track Visual Timeline */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3 overflow-x-auto">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Multi-Track Production Timeline</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploadingSfx}
              onClick={() => sfxFileRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/10 bg-[#070910] hover:bg-white/[0.06] text-xs text-slate-200"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>{uploadingSfx ? 'Uploading...' : `Add SFX at ${formatShortClock(playheadMs)}`}</span>
            </button>
            <button
              type="button"
              onClick={onGoToSubtitles}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/10 bg-[#070910] hover:bg-white/[0.06] text-xs text-slate-200"
            >
              <Captions className="w-3 h-3 text-indigo-400" />
              <span>Style Subtitles</span>
            </button>
          </div>
        </div>

        {/* Track 1: Video / Image Clips */}
        <div className="space-y-1.5 min-w-[680px]">
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-indigo-400" />
            <span>VIDEO / IMAGE TRACK ({scenes.length} clips)</span>
          </div>
          <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
            {scenes.map((sc) => {
              const widthPx = Math.max(72, Math.round((sc.durationMs / 1000) * 14));
              const isActive = activeScene?.id === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    setSelectedSceneId(sc.id);
                    seekToMs(sc.startMs);
                  }}
                  style={{ width: `${widthPx}px` }}
                  className={`shrink-0 h-16 rounded-lg border overflow-hidden relative text-start transition-colors ${
                    isActive
                      ? 'border-indigo-400 ring-1 ring-indigo-400/50'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  {sc.image ? (
                    <img
                      src={sc.image.imageUrl}
                      alt={`#${sc.sceneNumber}`}
                      className="w-full h-full object-cover opacity-70"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#070910]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-1.5 flex flex-col justify-between">
                    <span className="text-[10px] font-mono font-bold text-white">
                      #{sc.sceneNumber}
                    </span>
                    <span className="text-[10px] font-mono text-slate-300 truncate">
                      {(sc.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Track 2: Voiceover Track */}
        <div className="space-y-1 min-w-[680px]">
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>VOICEOVER TRACK ({formatShortClock(project.voiceover.durationMs)})</span>
          </div>
          <div className="h-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 flex items-center justify-between text-xs text-emerald-200 font-mono">
            <span>
              {project.voiceoverSettings.voiceName} · {cues.length} cues synchronized
            </span>
            <span>Vol {Math.round(mix.voiceoverVolume * 100)}%</span>
          </div>
        </div>

        {/* Track 3: Music & SFX Tracks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-[680px]">
          <div className="rounded-lg border border-indigo-500/25 bg-indigo-500/[0.08] px-3 py-2 text-xs text-indigo-200 flex items-center justify-between">
            <span className="truncate">
              Music: {mix.musicEnabled ? mix.musicTrack?.name || 'Enabled (Select track above)' : 'Disabled'}
            </span>
            <span className="font-mono shrink-0">
              {mix.duckingEnabled ? 'Auto-Ducked' : 'Flat'}
            </span>
          </div>

          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span className="truncate">
              SFX Cues: {mix.soundEffects.length === 0 ? 'None' : `${mix.soundEffects.length} cue(s)`}
            </span>
            {mix.soundEffects.length > 0 && (
              <button
                type="button"
                onClick={() => updateMix({ soundEffects: [] })}
                className="text-rose-300 hover:text-rose-200 shrink-0"
                title="Clear SFX cues"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
