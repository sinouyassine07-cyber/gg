import { useState } from 'react';
import {
  ArrowRight,
  CopyPlus,
  Film,
  FolderOpen,
  HardDrive,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import type { YouTubeNavSection } from '../../types';
import { formatFileSize } from '../../lib/formatters';
import { formatShortClock } from '../../lib/ytExport';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import type { ProjectSummary } from '../../types/youtube';

interface ProjectDashboardViewProps {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  loading: boolean;
  onRefresh: () => void;
  onCreateNew: () => void;
  onOpenProject: (id: string, targetSection?: YouTubeNavSection) => void;
  onRenameProject: (id: string, nextName: string) => Promise<void>;
  onDuplicateProject: (id: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onOpenAiProviders?: () => void;
  yt: YouTubeTranslations;
}

export function ProjectDashboardView({
  projects,
  activeProjectId,
  loading,
  onRefresh,
  onCreateNew,
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onOpenAiProviders,
  yt,
}: ProjectDashboardViewProps) {
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = projects.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.topic.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  });

  const totalStorage = projects.reduce((sum, p) => sum + (p.storageBytes || 0), 0);
  const totalScenes = projects.reduce((sum, p) => sum + p.sceneCount, 0);
  const totalExports = projects.reduce((sum, p) => sum + p.exportsCount, 0);

  const getNextSection = (p: ProjectSummary): YouTubeNavSection => {
    if (p.exportsCount > 0) return 'yt-export';
    if (p.sceneCount > 0 && p.uploadedImagesCount === p.sceneCount && p.approvedScenesCount === p.sceneCount) {
      return 'yt-editor';
    }
    if (p.sceneCount > 0 && p.uploadedImagesCount < p.sceneCount) return 'yt-uploads';
    if (p.sceneCount > 0) return 'yt-scenes';
    if (p.voiceoverDurationMs > 0) return 'yt-scenes';
    return 'yt-script';
  };

  const handleRenameSubmit = async (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setBusyId(id);
    try {
      await onRenameProject(id, trimmed);
      setRenamingId(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-dashboard']}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Persistent long-form YouTube production workspace. Resume any project seamlessly across sessions.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-white/10 bg-[#0c101b] hover:bg-white/[0.05] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{yt.common.refresh}</span>
          </button>

          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{yt.createProjectBtn}</span>
          </button>
        </div>
      </div>

      {/* Prominent AI API Key Setup Banner */}
      {(() => {
        const isArabic = yt.moduleTitle.includes('استوديو');
        return (
          <div className="rounded-xl border border-indigo-500/35 bg-gradient-to-r from-indigo-500/15 via-blue-500/10 to-indigo-500/15 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center shrink-0">
                🔑
              </span>
              <div>
                <div className="text-sm font-semibold text-white">
                  {isArabic ? 'أين تضع مفاتيح الذكاء الاصطناعي؟ (Gemini, OpenAI, Anthropic)' : 'Where to put your AI API keys (Gemini, OpenAI, Anthropic)'}
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  {isArabic
                    ? 'انقر هنا لإدخال مفاتيح API الخاصة بك لتوليد السكريبتات وتخطيط المشاهد الذكية تلقائياً.'
                    : 'Click here to enter your API keys for automated scriptwriting and smart scene planning.'}
                </div>
              </div>
            </div>
            {onOpenAiProviders && (
              <button
                type="button"
                onClick={onOpenAiProviders}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white transition-colors whitespace-nowrap shadow-lg shadow-indigo-500/20"
              >
                <span>{isArabic ? '⚙️ إعداد مفاتيح AI Providers' : '⚙️ Configure AI Provider Keys'}</span>
              </button>
            )}
          </div>
        );
      })()}

      {/* Summary Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <div className="text-xs text-slate-400">Saved Projects</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
            {projects.length}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <div className="text-xs text-slate-400">Planned Scenes</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
            {totalScenes}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <div className="text-xs text-slate-400">Rendered MP4 Exports</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
            {totalExports}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4">
          <div className="text-xs text-slate-400">Disk Storage Used</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
            {formatFileSize(totalStorage)}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects by title, topic, or category..."
          className="w-full rounded-xl border border-white/10 bg-[#0c101b] ps-10 pe-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
        />
      </div>

      {/* Project List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center">
          <Film className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white">
            {projects.length === 0 ? 'No YouTube Projects Yet' : 'No Matching Projects'}
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-1.5">
            Create your first automated YouTube production project to generate a long-form script, Fish Audio voiceover, smart scenes, external image prompts, and final MP4.
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{yt.createProjectBtn}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((proj) => {
            const isSelected = proj.id === activeProjectId;
            const isRenaming = renamingId === proj.id;
            const isConfirmDelete = confirmDeleteId === proj.id;
            const isBusy = busyId === proj.id;

            return (
              <div
                key={proj.id}
                className={`rounded-xl border p-5 transition-colors bg-[#0c101b] ${
                  isSelected ? 'border-indigo-400/50' : 'border-white/[0.08] hover:border-white/15'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameSubmit(proj.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          autoFocus
                          className="rounded-lg border border-indigo-400 bg-[#070910] px-3 py-1.5 text-sm font-semibold text-white focus:outline-none min-w-[240px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameSubmit(proj.id)}
                          disabled={isBusy}
                          className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white"
                        >
                          {yt.common.save}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white"
                        >
                          {yt.common.cancel}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProject(proj.id, 'yt-production')}
                          className="text-start text-base font-semibold text-white hover:text-indigo-300 transition-colors truncate"
                        >
                          {proj.name}
                        </button>
                        {isSelected && (
                          <span className="text-xs font-medium text-indigo-300">
                            · Active Workspace
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-slate-400 mt-1 line-clamp-2" dir="auto">
                      {proj.topic}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
                      <span>{yt.categories[proj.category] || proj.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.language}</span>
                      <span aria-hidden="true">·</span>
                      <span>Target {proj.targetDurationMinutes}m</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Voiceover{' '}
                        {proj.voiceoverDurationMs > 0
                          ? formatShortClock(proj.voiceoverDurationMs)
                          : '—'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Scenes {proj.uploadedImagesCount}/{proj.sceneCount} images
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Approved {proj.approvedScenesCount}/{proj.sceneCount}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-slate-500" />
                        {formatFileSize(proj.storageBytes)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj.id, getNextSection(proj))}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                    >
                      <span>{yt.common.continueProduction}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenProject(proj.id, 'yt-production')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{yt.common.open}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(proj.id);
                        setRenameValue(proj.name);
                      }}
                      title={yt.common.rename}
                      className="p-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setBusyId(proj.id);
                        try {
                          await onDuplicateProject(proj.id);
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      title={yt.common.duplicate}
                      className="p-2 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors"
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                    </button>

                    {isConfirmDelete ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={async () => {
                            setBusyId(proj.id);
                            try {
                              await onDeleteProject(proj.id);
                              setConfirmDeleteId(null);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white whitespace-nowrap"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-2 rounded-lg border border-white/10 text-xs text-slate-300"
                        >
                          {yt.common.cancel}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(proj.id)}
                        title={yt.common.delete}
                        className="p-2 rounded-lg border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
