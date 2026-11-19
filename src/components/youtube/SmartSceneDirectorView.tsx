import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  ImagePlus,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { ytApi } from '../../lib/ytApi';
import { formatShortClock } from '../../lib/ytExport';
import type {
  MotionEffect,
  MotionIntensity,
  TransitionType,
  YouTubeProject,
  YouTubeScene,
} from '../../types/youtube';

interface SmartSceneDirectorViewProps {
  project: YouTubeProject;
  onProjectChange: (next: YouTubeProject) => void;
  onSavePatch: (patch: Partial<YouTubeProject>) => Promise<void>;
  yt: YouTubeTranslations;
}

const MOTION_OPTIONS: MotionEffect[] = [
  'slow-zoom-in',
  'slow-zoom-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'ken-burns',
  'diagonal-drift',
  'cinematic-drift',
  'static',
];

const TRANSITION_OPTIONS: TransitionType[] = [
  'crossfade',
  'dissolve',
  'fade-black',
  'smooth-cut',
  'cinematic-fade',
];

export function SmartSceneDirectorView({
  project,
  onProjectChange,
  onSavePatch,
  yt,
}: SmartSceneDirectorViewProps) {
  const [planning, setPlanning] = useState(false);
  const [generatingPrompts, setGeneratingPrompts] = useState(false);
  const [regenSceneId, setRegenSceneId] = useState<string | null>(null);
  const [uploadingSceneId, setUploadingSceneId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'missing' | 'approved' | 'unapproved'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMotion, setBulkMotion] = useState<MotionEffect>('ken-burns');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingTimingId, setEditingTimingId] = useState<string | null>(null);
  const [previewScene, setPreviewScene] = useState<YouTubeScene | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadSceneRef = useRef<string | null>(null);

  const scenes = project.scenes || [];
  const filteredScenes = scenes.filter((sc) => {
    if (filter === 'missing') return sc.uploadStatus === 'missing';
    if (filter === 'approved') return sc.approved;
    if (filter === 'unapproved') return !sc.approved;
    return true;
  });

  // Preview audio slice playback for Preview Scene modal
  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!previewScene || !audio || !project.voiceover.audioUrl) return;
    audio.currentTime = previewScene.startMs / 1000;
    audio.play().catch(() => undefined);

    const onTime = () => {
      if (audio.currentTime * 1000 >= previewScene.endMs) {
        audio.pause();
      }
    };
    audio.addEventListener('timeupdate', onTime);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.pause();
    };
  }, [previewScene, project.voiceover.audioUrl]);

  const handlePlanScenes = async () => {
    setError(null);
    setPlanning(true);
    try {
      const res = await ytApi.planSmartScenes(project.id);
      onProjectChange(res.project);
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to plan smart scenes.');
    } finally {
      setPlanning(false);
    }
  };

  const handleGenerateAllPrompts = async (targetIds?: string[]) => {
    setError(null);
    setGeneratingPrompts(true);
    try {
      const res = await ytApi.generateImagePrompts(project.id, targetIds);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prompt generation failed.');
    } finally {
      setGeneratingPrompts(false);
    }
  };

  const handleRegenerateSinglePrompt = async (sceneId: string) => {
    setError(null);
    setRegenSceneId(sceneId);
    try {
      const res = await ytApi.generateImagePrompts(project.id, [sceneId]);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate prompt.');
    } finally {
      setRegenSceneId(null);
    }
  };

  const handleAutoMotion = async () => {
    setError(null);
    try {
      const res = await ytApi.autoAssignMotion(project.id);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to auto-assign motion.');
    }
  };

  const updateScenesList = async (nextScenes: YouTubeScene[]) => {
    const normalized = nextScenes.map((s, idx) => ({
      ...s,
      sceneNumber: idx + 1,
      durationMs: Math.max(400, s.endMs - s.startMs),
    }));
    onProjectChange({ ...project, scenes: normalized });
    await onSavePatch({ scenes: normalized });
  };

  const handleUpdateSingleScene = async (sceneId: string, patch: Partial<YouTubeScene>) => {
    const next = scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...patch } : sc));
    await updateScenesList(next);
  };

  const handleReorderScene = async (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= scenes.length) return;
    const copy = [...scenes];
    // Swap visual assets/descriptions/prompts/motions while keeping continuous audio timestamps aligned
    const a = copy[idx];
    const b = copy[targetIdx];
    copy[idx] = {
      ...a,
      visualDescription: b.visualDescription,
      imagePrompt: b.imagePrompt,
      continuityNotes: b.continuityNotes,
      image: b.image,
      uploadStatus: b.uploadStatus,
      motionEffect: b.motionEffect,
      motionIntensity: b.motionIntensity,
      motionDisabled: b.motionDisabled,
      transitionType: b.transitionType,
    };
    copy[targetIdx] = {
      ...b,
      visualDescription: a.visualDescription,
      imagePrompt: a.imagePrompt,
      continuityNotes: a.continuityNotes,
      image: a.image,
      uploadStatus: a.uploadStatus,
      motionEffect: a.motionEffect,
      motionIntensity: a.motionIntensity,
      motionDisabled: a.motionDisabled,
      transitionType: a.transitionType,
    };
    await updateScenesList(copy);
  };

  const handleTriggerImageUpload = (sceneId: string) => {
    pendingUploadSceneRef.current = sceneId;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetSceneId = pendingUploadSceneRef.current;
    e.target.value = '';
    if (!file || !targetSceneId) return;

    setUploadingSceneId(targetSceneId);
    setError(null);
    try {
      const res = await ytApi.uploadSceneImage(project.id, file, { sceneId: targetSceneId });
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingSceneId(null);
      pendingUploadSceneRef.current = null;
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChosen}
        className="hidden"
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-scenes']}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>Target avg ~{project.settings.preferredSceneDurationSec}s</span>
            <span aria-hidden="true">·</span>
            <span>{scenes.length} scenes</span>
            <span aria-hidden="true">·</span>
            <span>
              {scenes.filter((s) => s.uploadStatus === 'uploaded').length}/{scenes.length} images
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {scenes.filter((s) => s.approved).length}/{scenes.length} approved
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePlanScenes}
            disabled={planning || !project.voiceover.cues.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
          >
            {planning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>
              {scenes.length > 0 ? 'Re-Plan Smart Scenes' : 'Run Smart Scene Segmentation'}
            </span>
          </button>

          {scenes.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => handleGenerateAllPrompts()}
                disabled={generatingPrompts}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-400/35 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-50 text-xs font-semibold text-indigo-100 whitespace-nowrap"
              >
                {generatingPrompts ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>Generate All Prompts</span>
              </button>

              <button
                type="button"
                onClick={handleAutoMotion}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 bg-[#0c101b] hover:bg-white/[0.06] text-xs font-medium text-slate-200 whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                <span>Auto-Vary Motion</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {scenes.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center space-y-3">
          <Layers className="w-10 h-10 text-indigo-400 mx-auto" />
          <h2 className="text-lg font-semibold text-white">No Scenes Planned Yet</h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            {project.voiceover.cues.length > 0
              ? `Your ${formatShortClock(project.voiceover.durationMs)} voiceover is analyzed (${project.voiceover.cues.length} cues). Run Smart Scene Segmentation to divide it by meaning and pauses around ~${project.settings.preferredSceneDurationSec}s per scene.`
              : 'Generate and analyze your Fish Audio voiceover first so Smart Duration splits scenes using real audio timestamps.'}
          </p>
          {project.voiceover.cues.length > 0 && (
            <button
              type="button"
              onClick={handlePlanScenes}
              disabled={planning}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white"
            >
              {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Plan Smart Scenes Now</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Filter & Bulk Action Toolbar */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#070910] border border-white/[0.06]">
              {(
                [
                  ['all', `All (${scenes.length})`],
                  ['missing', `Missing Image (${scenes.filter((s) => s.uploadStatus === 'missing').length})`],
                  ['approved', `Approved (${scenes.filter((s) => s.approved).length})`],
                  ['unapproved', `Pending Approval (${scenes.filter((s) => !s.approved).length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    filter === key ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.length === filteredScenes.length
                      ? []
                      : filteredScenes.map((s) => s.id)
                  )
                }
                className="px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white"
              >
                {selectedIds.length === filteredScenes.length && filteredScenes.length > 0
                  ? 'Clear Selection'
                  : 'Select Visible'}
              </button>

              {selectedIds.length > 0 && (
                <>
                  <button
                    type="button"
                    disabled={generatingPrompts}
                    onClick={() => handleGenerateAllPrompts(selectedIds)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-400/35 text-xs font-medium text-indigo-100 hover:bg-indigo-500/30 whitespace-nowrap"
                  >
                    Regenerate {selectedIds.length} Prompts
                  </button>

                  <div className="flex items-center gap-1">
                    <select
                      value={bulkMotion}
                      onChange={(e) => setBulkMotion(e.target.value as MotionEffect)}
                      className="rounded-lg border border-white/10 bg-[#070910] px-2 py-1.5 text-xs text-slate-200"
                    >
                      {MOTION_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {yt.motions[m]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const set = new Set(selectedIds);
                        updateScenesList(
                          scenes.map((sc) =>
                            set.has(sc.id)
                              ? { ...sc, motionEffect: bulkMotion, motionDisabled: bulkMotion === 'static' }
                              : sc
                          )
                        );
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.05] text-xs text-slate-200 hover:bg-white/[0.1]"
                    >
                      Apply Motion
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const set = new Set(selectedIds);
                      updateScenesList(
                        scenes.map((sc) => (set.has(sc.id) ? { ...sc, approved: true } : sc))
                      );
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white whitespace-nowrap"
                  >
                    Approve Selected
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Scene Cards */}
          <div className="space-y-4">
            {filteredScenes.map((sc) => {
              const globalIdx = scenes.findIndex((x) => x.id === sc.id);
              const isSelected = selectedIds.includes(sc.id);
              const isTimingOpen = editingTimingId === sc.id;

              return (
                <article
                  key={sc.id}
                  className={`rounded-xl border bg-[#0c101b] p-5 transition-colors ${
                    sc.approved
                      ? 'border-emerald-500/30'
                      : isSelected
                        ? 'border-indigo-400/50'
                        : 'border-white/[0.08]'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row gap-5">
                    {/* Left Image Thumbnail + Upload Controls */}
                    <div className="w-full lg:w-64 shrink-0 space-y-2.5">
                      <div className="aspect-video rounded-lg border border-white/[0.08] bg-[#070910] overflow-hidden flex items-center justify-center relative">
                        {sc.image ? (
                          <img
                            src={sc.image.imageUrl}
                            alt={`Scene ${sc.sceneNumber}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center p-4">
                            <ImagePlus className="w-7 h-7 text-slate-600 mx-auto mb-1" />
                            <div className="text-[11px] text-slate-500 font-mono">
                              scene_{String(sc.sceneNumber).padStart(3, '0')}.png
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleTriggerImageUpload(sc.id)}
                          disabled={uploadingSceneId === sc.id}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 whitespace-nowrap"
                        >
                          {uploadingSceneId === sc.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ImagePlus className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                          <span>{sc.image ? 'Replace' : 'Upload'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewScene(sc)}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>

                    {/* Right Metadata, Narration, Prompt, Motion & Actions */}
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2.5 text-xs">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(sc.id)}
                            aria-label={`Select Scene ${sc.sceneNumber}`}
                            className="h-4 w-4 accent-indigo-500"
                          />
                          <span className="font-bold text-sm text-white font-mono tabular-nums">
                            Scene #{String(sc.sceneNumber).padStart(3, '0')}
                          </span>
                          <span className="text-indigo-300 font-mono tabular-nums">
                            {formatShortClock(sc.startMs)} → {formatShortClock(sc.endMs)} (
                            {(sc.durationMs / 1000).toFixed(1)}s)
                          </span>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="text-slate-300">{sc.chapterTitle}</span>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span
                            className={
                              sc.uploadStatus === 'uploaded'
                                ? 'text-emerald-300 font-medium'
                                : 'text-amber-300 font-medium'
                            }
                          >
                            {sc.uploadStatus === 'uploaded' ? 'Image Uploaded' : 'Image Missing'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={globalIdx === 0}
                            onClick={() => handleReorderScene(globalIdx, -1)}
                            title="Move Earlier"
                            className="p-1.5 rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-30 text-slate-300"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={globalIdx === scenes.length - 1}
                            onClick={() => handleReorderScene(globalIdx, 1)}
                            title="Move Later"
                            className="p-1.5 rounded border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-30 text-slate-300"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setEditingTimingId(isTimingOpen ? null : sc.id)
                            }
                            className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-200 whitespace-nowrap"
                          >
                            Edit Timing
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUpdateSingleScene(sc.id, { approved: !sc.approved })}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                              sc.approved
                                ? 'bg-emerald-600 text-white'
                                : 'border border-white/15 bg-white/[0.05] text-slate-200 hover:border-emerald-400/50'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{sc.approved ? 'Approved' : 'Approve Scene'}</span>
                          </button>
                        </div>
                      </div>

                      {isTimingOpen && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-[#070910] border border-indigo-400/30 text-xs">
                          <div>
                            <label className="block text-slate-400 mb-1">Start (sec)</label>
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              value={(sc.startMs / 1000).toFixed(1)}
                              onChange={(e) => {
                                const ms = Math.max(0, Math.round(Number(e.target.value) * 1000));
                                handleUpdateSingleScene(sc.id, {
                                  startMs: ms,
                                  endMs: Math.max(ms + 500, sc.endMs),
                                });
                              }}
                              className="w-full rounded border border-white/10 bg-[#0c101b] px-2 py-1 font-mono text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 mb-1">End (sec)</label>
                            <input
                              type="number"
                              step="0.1"
                              min={0.5}
                              value={(sc.endMs / 1000).toFixed(1)}
                              onChange={(e) => {
                                const ms = Math.max(
                                  sc.startMs + 500,
                                  Math.round(Number(e.target.value) * 1000)
                                );
                                handleUpdateSingleScene(sc.id, { endMs: ms });
                              }}
                              className="w-full rounded border border-white/10 bg-[#0c101b] px-2 py-1 font-mono text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-400 mb-1">Transition</label>
                            <select
                              value={sc.transitionType}
                              onChange={(e) =>
                                handleUpdateSingleScene(sc.id, {
                                  transitionType: e.target.value as TransitionType,
                                })
                              }
                              className="w-full rounded border border-white/10 bg-[#0c101b] px-2 py-1 text-white"
                            >
                              {TRANSITION_OPTIONS.map((tr) => (
                                <option key={tr} value={tr}>
                                  {yt.transitions[tr]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-slate-400 mb-1">Trans. Dur (ms)</label>
                            <input
                              type="number"
                              step={50}
                              min={0}
                              max={2000}
                              value={sc.transitionDurationMs}
                              onChange={(e) =>
                                handleUpdateSingleScene(sc.id, {
                                  transitionDurationMs: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-full rounded border border-white/10 bg-[#0c101b] px-2 py-1 font-mono text-white"
                            />
                          </div>
                        </div>
                      )}

                      <p dir="auto" className="text-xs text-slate-200 leading-relaxed">
                        <span className="text-slate-400 font-medium">Narration: </span>
                        {sc.narrationText}
                      </p>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        <span className="text-slate-400 font-medium">Visual Concept: </span>
                        {sc.visualDescription}
                      </p>

                      {/* Prompt Block */}
                      <div className="rounded-lg border border-white/[0.06] bg-[#070910] p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-indigo-300">
                            External Image Prompt
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  sc.imagePrompt || sc.visualDescription
                                );
                                setCopiedId(sc.id);
                                setTimeout(() => setCopiedId(null), 1800);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white"
                            >
                              {copiedId === sc.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedId === sc.id ? 'Copied' : 'Copy Prompt'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={regenSceneId === sc.id}
                              onClick={() => handleRegenerateSinglePrompt(sc.id)}
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 disabled:opacity-50"
                            >
                              {regenSceneId === sc.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              <span>Regenerate Prompt</span>
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">
                          {sc.imagePrompt || 'Prompt not generated yet — click Regenerate Prompt or Generate All Prompts.'}
                        </p>
                      </div>

                      {/* Motion Controls */}
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                        <label className="text-slate-400">Motion Effect:</label>
                        <select
                          value={sc.motionEffect}
                          disabled={sc.motionDisabled}
                          onChange={(e) =>
                            handleUpdateSingleScene(sc.id, {
                              motionEffect: e.target.value as MotionEffect,
                            })
                          }
                          className="rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1 text-xs text-white"
                        >
                          {MOTION_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {yt.motions[m]}
                            </option>
                          ))}
                        </select>

                        <select
                          value={sc.motionIntensity}
                          disabled={sc.motionDisabled}
                          onChange={(e) =>
                            handleUpdateSingleScene(sc.id, {
                              motionIntensity: e.target.value as MotionIntensity,
                            })
                          }
                          className="rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1 text-xs text-white"
                        >
                          <option value="subtle">Subtle Intensity</option>
                          <option value="balanced">Balanced Intensity</option>
                          <option value="cinematic">Cinematic Intensity</option>
                        </select>

                        <label className="inline-flex items-center gap-1.5 text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sc.motionDisabled}
                            onChange={(e) =>
                              handleUpdateSingleScene(sc.id, {
                                motionDisabled: e.target.checked,
                              })
                            }
                            className="accent-indigo-500"
                          />
                          <span>Disable Motion</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* Live Single-Scene Audio + Motion Preview Modal */}
      {previewScene && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-white/15 bg-[#0c101b] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">
                Scene #{previewScene.sceneNumber} Preview ({formatShortClock(previewScene.startMs)} →{' '}
                {formatShortClock(previewScene.endMs)}) · {yt.motions[previewScene.motionEffect]}
              </div>
              <button
                type="button"
                onClick={() => setPreviewScene(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-video rounded-lg overflow-hidden bg-black border border-white/10 relative flex items-center justify-center">
              {previewScene.image ? (
                <img
                  src={previewScene.image.imageUrl}
                  alt={`Scene ${previewScene.sceneNumber}`}
                  className={`w-full h-full object-cover transition-transform duration-[4000ms] ease-out ${
                    previewScene.motionDisabled
                      ? ''
                      : previewScene.motionEffect.includes('zoom-out')
                        ? 'scale-100'
                        : 'scale-110'
                  }`}
                />
              ) : (
                <div className="text-xs text-slate-400">
                  No image uploaded for Scene #{previewScene.sceneNumber} yet.
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4">
                <p dir="auto" className="text-xs sm:text-sm text-white text-center">
                  {previewScene.narrationText}
                </p>
              </div>
            </div>

            {project.voiceover.audioUrl && (
              <audio
                ref={previewAudioRef}
                controls
                src={project.voiceover.audioUrl}
                className="w-full h-10"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
