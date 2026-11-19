import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Square,
  XCircle,
} from 'lucide-react';
import type { YouTubeNavSection } from '../../types';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { formatFileSize } from '../../lib/formatters';
import { ytApi } from '../../lib/ytApi';
import { formatShortClock } from '../../lib/ytExport';
import type { ProductionStageKey, QualityPreset, YouTubeProject } from '../../types/youtube';

interface ProductionManagerViewProps {
  project: YouTubeProject;
  storageBytes: number;
  renderActive: boolean;
  onProjectChange: (next: YouTubeProject) => void;
  onSavePatch: (patch: Partial<YouTubeProject>) => Promise<void>;
  onNavigateSection: (section: YouTubeNavSection) => void;
  onRefreshProject: () => Promise<void>;
  yt: YouTubeTranslations;
}

const STAGE_ORDER: ProductionStageKey[] = [
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

const STAGE_ROUTE_MAP: Record<ProductionStageKey, YouTubeNavSection> = {
  project_creation: 'yt-dashboard',
  script_generation: 'yt-script',
  script_approval: 'yt-script',
  voice_generation: 'yt-voiceover',
  audio_analysis: 'yt-voiceover',
  scene_planning: 'yt-scenes',
  prompt_generation: 'yt-prompts',
  image_upload: 'yt-uploads',
  scene_approval: 'yt-scenes',
  video_assembly: 'yt-editor',
  subtitle_processing: 'yt-subtitles',
  audio_mixing: 'yt-editor',
  final_rendering: 'yt-export',
  export: 'yt-export',
};

export function ProductionManagerView({
  project,
  storageBytes,
  renderActive,
  onProjectChange,
  onSavePatch,
  onNavigateSection,
  onRefreshProject,
  yt,
}: ProductionManagerViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stages = STAGE_ORDER.map((k) => project.stages[k] || { key: k, status: 'pending' as const });
  const completedCount = stages.filter((s) => s.status === 'completed').length;
  const overallPercent = Math.round((completedCount / stages.length) * 100);
  const readyForRender =
    Boolean(project.voiceover.audioFileName) &&
    project.scenes.length > 0 &&
    project.scenes.every((s) => s.uploadStatus === 'uploaded');

  const estimatedFishCredits = Math.round((project.usage.fishAudioCharacters / 1000) * 1);

  const handleStartOrResumeRender = async () => {
    setError(null);
    setBusy(true);
    try {
      await ytApi.startRender(project.id);
      await onRefreshProject();
      onNavigateSection('yt-export');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start render.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelRender = async () => {
    setBusy(true);
    try {
      await ytApi.cancelRender(project.id);
      await onRefreshProject();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-production']}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time 14-stage production pipeline monitor, cost & resource tracking, and resilient resume controls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRefreshProject}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-[#0c101b] hover:bg-white/[0.06] text-xs text-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh State</span>
          </button>

          {renderActive ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleCancelRender}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Cancel Render Safely</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !readyForRender}
              onClick={handleStartOrResumeRender}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>
                {project.activeRenderJob?.status === 'failed' ||
                project.activeRenderJob?.status === 'cancelled'
                  ? 'Resume Production Render'
                  : 'Start Video Assembly Render'}
              </span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cost, Usage, Storage & Quality Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <div className="text-xs text-slate-400">Pipeline Progress</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
            {completedCount}/14 ({overallPercent}%)
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <div className="text-xs text-slate-400">Fish Audio Usage</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
            {project.usage.fishAudioCharacters.toLocaleString()} chars
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            ~{estimatedFishCredits} credit units · {project.usage.fishAudioRequests} reqs
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <div className="text-xs text-slate-400">Gemini AI Calls</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
            {project.usage.geminiCalls}
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            ~{project.usage.geminiTokensApprox.toLocaleString()} tokens (Images: $0 external)
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <div className="text-xs text-slate-400">Project Disk Storage</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-white">
            {formatFileSize(storageBytes)}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <label className="block text-xs text-slate-400 mb-1">Quality Preset</label>
          <select
            value={project.settings.qualityPreset}
            onChange={async (e) => {
              const nextSettings = {
                ...project.settings,
                qualityPreset: e.target.value as QualityPreset,
              };
              onProjectChange({ ...project, settings: nextSettings });
              await onSavePatch({ settings: nextSettings });
            }}
            className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-xs text-white"
          >
            <option value="high">High Quality (CRF 18)</option>
            <option value="balanced">Balanced (CRF 21)</option>
            <option value="economy">Economy Fast (CRF 24)</option>
          </select>
        </div>
      </div>

      {/* 14-Stage Truthful Pipeline Table */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">14-Stage Production Pipeline</h2>
          <span className="text-xs font-mono text-slate-400">
            Project ID: {project.id.slice(0, 14)}
          </span>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {stages.map((st) => (
            <div
              key={st.key}
              className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3 min-w-0">
                {st.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : st.status === 'in_progress' ? (
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                ) : st.status === 'failed' ? (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                )}

                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">{yt.stages[st.key]}</div>
                  {(st.detail || st.error) && (
                    <div
                      className={`text-[11px] truncate ${
                        st.error ? 'text-rose-300' : 'text-slate-400'
                      }`}
                    >
                      {st.error || st.detail}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-xs font-medium ${
                    st.status === 'completed'
                      ? 'text-emerald-300'
                      : st.status === 'in_progress'
                        ? 'text-indigo-300'
                        : st.status === 'failed'
                          ? 'text-rose-300'
                          : 'text-slate-500'
                  }`}
                >
                  {st.status === 'completed'
                    ? 'Completed'
                    : st.status === 'in_progress'
                      ? 'In Progress'
                      : st.status === 'failed'
                        ? 'Failed'
                        : 'Pending'}
                </span>

                <button
                  type="button"
                  onClick={() => onNavigateSection(STAGE_ROUTE_MAP[st.key])}
                  className="px-2.5 py-1 rounded border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-200"
                >
                  Open Stage
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Scene Readiness Overview */}
      {project.scenes.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Individual Scene Status ({project.scenes.length} scenes)
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              Total Timeline: {formatShortClock(project.voiceover.durationMs)}
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-white/[0.06] text-xs">
            {project.scenes.map((sc) => (
              <div key={sc.id} className="py-2 flex items-center justify-between gap-3">
                <span className="font-mono text-white shrink-0">
                  #{String(sc.sceneNumber).padStart(3, '0')}
                </span>
                <span className="font-mono tabular-nums text-slate-400 shrink-0">
                  {formatShortClock(sc.startMs)}–{formatShortClock(sc.endMs)}
                </span>
                <span className="flex-1 text-slate-300 truncate">{sc.chapterTitle}</span>
                <span className={sc.imagePrompt ? 'text-emerald-300' : 'text-amber-300'}>
                  {sc.imagePrompt ? 'Prompt OK' : 'No Prompt'}
                </span>
                <span className={sc.uploadStatus === 'uploaded' ? 'text-emerald-300' : 'text-rose-300'}>
                  {sc.uploadStatus === 'uploaded' ? 'Image OK' : 'Image Missing'}
                </span>
                <span className={sc.approved ? 'text-emerald-300' : 'text-slate-400'}>
                  {sc.approved ? 'Approved' : 'Unapproved'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
