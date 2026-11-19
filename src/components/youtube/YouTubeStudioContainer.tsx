import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  Loader2,
  Plus,
} from 'lucide-react';
import { YT_TRANSLATIONS } from '../../i18n/ytTranslations';
import { ytApi } from '../../lib/ytApi';
import type {
  ApiConfigStatus,
  GenerationParams,
  NavSection,
  UILanguage,
  VoiceModel,
  YouTubeNavSection,
} from '../../types';
import type { ProjectSummary, YouTubeProject } from '../../types/youtube';
import { AiScriptStudioView } from './AiScriptStudioView';
import { AutoVideoEditorView } from './AutoVideoEditorView';
import { CreateProjectWizard } from './CreateProjectWizard';
import { ExportCenterView } from './ExportCenterView';
import { ImagePromptManagerView } from './ImagePromptManagerView';
import { ImageUploadManagerView } from './ImageUploadManagerView';
import { ProductionManagerView } from './ProductionManagerView';
import { ProjectDashboardView } from './ProjectDashboardView';
import { SmartSceneDirectorView } from './SmartSceneDirectorView';
import { SubtitleStudioView } from './SubtitleStudioView';
import { VoiceoverStudioView } from './VoiceoverStudioView';

const ACTIVE_YT_PROJECT_KEY = 'vs_active_yt_project_id';

interface YouTubeStudioContainerProps {
  activeSection: YouTubeNavSection;
  onSelectSection: (section: NavSection) => void;
  selectedVoice: VoiceModel | null;
  favorites: VoiceModel[];
  defaultParams: GenerationParams;
  configStatus: ApiConfigStatus | null;
  uiLanguage: UILanguage;
}

const PIPELINE_SHORTCUTS: { section: YouTubeNavSection; labelKey: keyof (typeof YT_TRANSLATIONS)['en']['nav'] }[] = [
  { section: 'yt-script', labelKey: 'yt-script' },
  { section: 'yt-voiceover', labelKey: 'yt-voiceover' },
  { section: 'yt-scenes', labelKey: 'yt-scenes' },
  { section: 'yt-prompts', labelKey: 'yt-prompts' },
  { section: 'yt-uploads', labelKey: 'yt-uploads' },
  { section: 'yt-subtitles', labelKey: 'yt-subtitles' },
  { section: 'yt-editor', labelKey: 'yt-editor' },
  { section: 'yt-production', labelKey: 'yt-production' },
  { section: 'yt-export', labelKey: 'yt-export' },
];

export function YouTubeStudioContainer({
  activeSection,
  onSelectSection,
  selectedVoice,
  favorites,
  defaultParams,
  configStatus,
  uiLanguage,
}: YouTubeStudioContainerProps) {
  const yt = YT_TRANSLATIONS[uiLanguage];

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<YouTubeProject | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [storageBytes, setStorageBytes] = useState(0);
  const [renderActive, setRenderActive] = useState(false);
  const [savingPatch, setSavingPatch] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pendingPatchRef = useRef<{ projectId: string; patch: Partial<YouTubeProject> } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshProjectsList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await ytApi.listProjects();
      const items = Array.isArray(res?.items) ? res.items : [];
      setProjects(items);
      return items;
    } catch {
      return [];
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadProjectById = useCallback(async (id: string, silent?: boolean) => {
    const isSilent = silent ?? (activeProject !== null);
    if (!isSilent) setProjectLoading(true);
    setSaveError(null);
    try {
      const res = await ytApi.getProject(id);
      setActiveProject(res.project);
      setStorageBytes(res.storageBytes || 0);
      setRenderActive(Boolean(res.renderActive));
      localStorage.setItem(ACTIVE_YT_PROJECT_KEY, res.project.id);
      return res.project;
    } catch {
      return null;
    } finally {
      if (!isSilent) setProjectLoading(false);
    }
  }, [activeProject]);

  // Hydrate list & last active project on mount once
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const items = await refreshProjectsList();
      if (cancelled || items.length === 0) return;

      const savedId = localStorage.getItem(ACTIVE_YT_PROJECT_KEY);
      const targetId = items.some((p) => p.id === savedId) ? savedId! : items[0].id;
      await loadProjectById(targetId);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep project list summary metrics synchronized cleanly whenever activeProject updates
  const syncSummaryFromProject = useCallback((proj: YouTubeProject, bytes?: number) => {
    setActiveProject(proj);
    if (typeof bytes === 'number') setStorageBytes(bytes);
    localStorage.setItem(ACTIVE_YT_PROJECT_KEY, proj.id);

    setProjects((prev) => {
      const summary: ProjectSummary = {
        id: proj.id,
        name: proj.settings.name,
        topic: proj.settings.topic,
        category: proj.settings.category,
        language: proj.settings.language,
        targetDurationMinutes: proj.settings.targetDurationMinutes,
        updatedAt: proj.updatedAt,
        createdAt: proj.createdAt,
        sceneCount: proj.scenes.length,
        uploadedImagesCount: proj.scenes.filter((s) => s.uploadStatus === 'uploaded').length,
        approvedScenesCount: proj.scenes.filter((s) => s.approved).length,
        voiceoverDurationMs: proj.voiceover.durationMs,
        exportsCount: proj.exports.length,
        storageBytes:
          typeof bytes === 'number'
            ? bytes
            : prev.find((x) => x.id === proj.id)?.storageBytes || 0,
        renderStatus: proj.activeRenderJob?.status || 'idle',
      };
      const exists = prev.some((x) => x.id === proj.id);
      if (exists) {
        return prev.map((x) => (x.id === proj.id ? summary : x));
      }
      return [summary, ...prev];
    });
  }, []);

  const flushPendingPatch = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const pending = pendingPatchRef.current;
    if (!pending) return;
    pendingPatchRef.current = null;

    setSavingPatch(true);
    setSaveError(null);
    try {
      const res = await ytApi.patchProject(pending.projectId, pending.patch);
      syncSummaryFromProject(res.project, res.storageBytes);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Auto-save failed.');
    } finally {
      setSavingPatch(false);
    }
  }, [syncSummaryFromProject]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleSavePatch = useCallback(
    async (patch: Partial<YouTubeProject>) => {
      if (!activeProject) return;
      const projectId = activeProject.id;

      if (pendingPatchRef.current && pendingPatchRef.current.projectId !== projectId) {
        await flushPendingPatch();
      }

      pendingPatchRef.current = {
        projectId,
        patch: {
          ...(pendingPatchRef.current?.patch || {}),
          ...patch,
        },
      };

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        flushPendingPatch();
      }, 450);
    },
    [activeProject, flushPendingPatch]
  );

  const handleOpenProject = async (id: string, targetSection?: YouTubeNavSection) => {
    await flushPendingPatch();
    const loaded = await loadProjectById(id);
    if (loaded && targetSection) {
      onSelectSection(targetSection);
    }
  };

  const handleCreateProject = async (
    payload: Parameters<typeof ytApi.createProject>[0]
  ) => {
    await flushPendingPatch();
    const res = await ytApi.createProject(payload);
    syncSummaryFromProject(res.project, 0);
    onSelectSection('yt-script');
  };

  const handleRenameProject = async (id: string, nextName: string) => {
    const targetSummary = projects.find((p) => p.id === id);
    const full = activeProject?.id === id ? activeProject : await loadProjectById(id, true);
    if (!full) return;

    const nextSettings = { ...full.settings, name: nextName };
    const res = await ytApi.patchProject(id, { settings: nextSettings });
    if (activeProject?.id === id) {
      syncSummaryFromProject(res.project, res.storageBytes);
    } else if (targetSummary) {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: nextName, updatedAt: res.project.updatedAt } : p))
      );
    }
  };

  const handleDuplicateProject = async (id: string) => {
    await flushPendingPatch();
    const res = await ytApi.duplicateProject(id);
    syncSummaryFromProject(res.project);
    await refreshProjectsList();
  };

  const handleDeleteProject = async (id: string) => {
    await ytApi.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProject?.id === id) {
      pendingPatchRef.current = null;
      setActiveProject(null);
      localStorage.removeItem(ACTIVE_YT_PROJECT_KEY);
    }
  };

  const handleRefreshActive = useCallback(async () => {
    if (!activeProject) return;
    await loadProjectById(activeProject.id, true);
  }, [activeProject, loadProjectById]);

  const isStageCompleted = (section: YouTubeNavSection): boolean => {
    if (!activeProject) return false;
    const st = activeProject.stages;
    switch (section) {
      case 'yt-script':
        return st.script_approval?.status === 'completed';
      case 'yt-voiceover':
        return st.audio_analysis?.status === 'completed';
      case 'yt-scenes':
        return st.scene_approval?.status === 'completed';
      case 'yt-prompts':
        return st.prompt_generation?.status === 'completed';
      case 'yt-uploads':
        return st.image_upload?.status === 'completed';
      case 'yt-subtitles':
        return st.subtitle_processing?.status === 'completed';
      case 'yt-editor':
        return st.video_assembly?.status === 'completed';
      case 'yt-production':
        return st.final_rendering?.status === 'completed';
      case 'yt-export':
        return st.export?.status === 'completed';
      default:
        return false;
    }
  };

  if (activeSection === 'yt-dashboard') {
    return (
      <ProjectDashboardView
        projects={projects}
        activeProjectId={activeProject?.id || null}
        loading={listLoading}
        onRefresh={() => refreshProjectsList()}
        onCreateNew={() => onSelectSection('yt-create')}
        onOpenProject={handleOpenProject}
        onRenameProject={handleRenameProject}
        onDuplicateProject={handleDuplicateProject}
        onDeleteProject={handleDeleteProject}
        onOpenAiProviders={() => onSelectSection('ai-providers')}
        yt={yt}
      />
    );
  }

  if (activeSection === 'yt-create') {
    return (
      <CreateProjectWizard
        selectedVoice={selectedVoice}
        favorites={favorites}
        defaultParams={defaultParams}
        onBrowseVoices={() => onSelectSection('library')}
        onCreateProject={handleCreateProject}
        yt={yt}
      />
    );
  }

  if (projectLoading && !activeProject) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-16 flex flex-col items-center justify-center gap-3 text-sm text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
        <span>Loading production workspace...</span>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center space-y-4 max-w-xl mx-auto mt-8">
        <FolderKanban className="w-10 h-10 text-indigo-400 mx-auto" />
        <div>
          <h2 className="text-lg font-semibold text-white">{yt.noProjectTitle}</h2>
          <p className="text-sm text-slate-400 mt-1.5">{yt.noProjectDesc}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onSelectSection('yt-create')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-xs font-semibold text-white"
          >
            <Plus className="w-4 h-4" />
            <span>{yt.createProjectBtn}</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectSection('yt-dashboard')}
            className="px-4 py-2.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200"
          >
            {yt.openDashboardBtn}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Project Workspace Strip & Stage Jumper */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <span className="text-xs font-medium text-slate-400 shrink-0">Active Project:</span>
            {projects.length > 1 ? (
              <select
                value={activeProject.id}
                onChange={(e) => handleOpenProject(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-indigo-400 max-w-xs"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-semibold text-white truncate">
                {activeProject.settings.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs shrink-0">
            {saveError ? (
              <span className="inline-flex items-center gap-1 text-rose-300">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{saveError}</span>
              </span>
            ) : savingPatch ? (
              <span className="inline-flex items-center gap-1.5 text-indigo-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{yt.saving}</span>
              </span>
            ) : (
              <span className="text-slate-500">{yt.saved}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 border-t border-white/[0.06] pt-2.5">
          {PIPELINE_SHORTCUTS.map((step, idx) => {
            const isCurrent = activeSection === step.section;
            const completed = isStageCompleted(step.section);
            return (
              <button
                key={step.section}
                type="button"
                onClick={() => onSelectSection(step.section)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors shrink-0 ${
                  isCurrent
                    ? 'bg-indigo-500/20 text-white border border-indigo-400/40'
                    : completed
                      ? 'text-emerald-300 hover:bg-white/[0.04] border border-transparent'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">{idx + 1}.</span>
                {completed && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                <span>{yt.nav[step.labelKey]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage Views */}
      {activeSection === 'yt-script' && (
        <AiScriptStudioView
          project={activeProject}
          aiConfigured={
            configStatus
              ? Boolean(configStatus.aiProvidersConfigured || configStatus.geminiConfigured)
              : undefined
          }
          onOpenAiSettings={() => onSelectSection('ai-providers')}
          onProjectChange={(p) => syncSummaryFromProject(p)}
          onSavePatch={handleSavePatch}
          onGoToVoiceover={() => onSelectSection('yt-voiceover')}
          yt={yt}
        />
      )}

      {activeSection === 'yt-voiceover' && (
        <VoiceoverStudioView
          project={activeProject}
          selectedVoice={selectedVoice}
          favorites={favorites}
          configStatus={configStatus}
          onProjectChange={(p) => syncSummaryFromProject(p)}
          onSavePatch={handleSavePatch}
          onOpenApiConfig={() => onSelectSection('api-config')}
          onBrowseVoices={() => onSelectSection('library')}
          onGoToScenes={() => onSelectSection('yt-scenes')}
          yt={yt}
        />
      )}

      {activeSection === 'yt-scenes' && (
        <SmartSceneDirectorView
          project={activeProject}
          onProjectChange={(p) => syncSummaryFromProject(p)}
          onSavePatch={handleSavePatch}
          yt={yt}
        />
      )}

      {activeSection === 'yt-prompts' && (
        <ImagePromptManagerView
          project={activeProject}
          onProjectChange={(p) => syncSummaryFromProject(p)}
          onSavePatch={handleSavePatch}
          yt={yt}
        />
      )}

      {activeSection === 'yt-uploads' && (
        <ImageUploadManagerView
          project={activeProject}
          onProjectChange={(p) => syncSummaryFromProject(p)}
          yt={yt}
        />
      )}

      {activeSection === 'yt-subtitles' && (
        <SubtitleStudioView
          project={activeProject}
          onProjectChange={(p) => syncSummaryFromProject(p)}
          onSavePatch={handleSavePatch}
          yt={yt}
        />
      )}

      {activeSection === 'yt-editor' && (
        <AutoVideoEditorView
          project={activeProject}
          onProjectChange={(p) => syncSummaryFromProject(p)}
          onSavePatch={handleSavePatch}
          onGoToSubtitles={() => onSelectSection('yt-subtitles')}
          onGoToExport={() => onSelectSection('yt-export')}
          yt={yt}
        />
      )}

      {activeSection === 'yt-production' && (
        <ProductionManagerView
          project={activeProject}
          storageBytes={storageBytes}
          renderActive={renderActive}
          onProjectChange={(p) => syncSummaryFromProject(p)}
          onSavePatch={handleSavePatch}
          onNavigateSection={(sec) => onSelectSection(sec)}
          onRefreshProject={handleRefreshActive}
          yt={yt}
        />
      )}

      {activeSection === 'yt-export' && (
        <ExportCenterView
          project={activeProject}
          renderActive={renderActive}
          onRefreshProject={handleRefreshActive}
          yt={yt}
        />
      )}
    </div>
  );
}
