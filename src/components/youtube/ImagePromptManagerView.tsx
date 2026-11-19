import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { ytApi } from '../../lib/ytApi';
import {
  buildAllPromptsText,
  downloadAllPromptsTxt,
  downloadStoryboardCsv,
  downloadStoryboardJson,
  formatShortClock,
} from '../../lib/ytExport';
import type { YouTubeProject } from '../../types/youtube';

interface ImagePromptManagerViewProps {
  project: YouTubeProject;
  onProjectChange: (next: YouTubeProject) => void;
  onSavePatch: (patch: Partial<YouTubeProject>) => Promise<void>;
  yt: YouTubeTranslations;
}

export function ImagePromptManagerView({
  project,
  onProjectChange,
  onSavePatch,
  yt,
}: ImagePromptManagerViewProps) {
  const [generating, setGenerating] = useState(false);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenes = project.scenes || [];
  const missingPrompts = scenes.filter((s) => !s.imagePrompt.trim());

  const handleGeneratePrompts = async (sceneIds?: string[]) => {
    setError(null);
    setGenerating(true);
    try {
      const res = await ytApi.generateImagePrompts(project.id, sceneIds);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate image prompts.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenSingle = async (sceneId: string) => {
    setError(null);
    setRegenId(sceneId);
    try {
      const res = await ytApi.generateImagePrompts(project.id, [sceneId]);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to regenerate prompt.');
    } finally {
      setRegenId(null);
    }
  };

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(buildAllPromptsText(project));
    setCopiedKey('all');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleEditPrompt = async (sceneId: string, imagePrompt: string) => {
    const next = scenes.map((s) => (s.id === sceneId ? { ...s, imagePrompt } : s));
    onProjectChange({ ...project, scenes: next });
    await onSavePatch({ scenes: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-prompts']}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Generate, customize, copy, and export detailed visual prompts for external image generators (zero embedded text or watermarks).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {missingPrompts.length > 0 && missingPrompts.length < scenes.length && (
            <button
              type="button"
              disabled={generating}
              onClick={() => handleGeneratePrompts(missingPrompts.map((s) => s.id))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-400/35 bg-indigo-500/15 hover:bg-indigo-500/25 text-xs font-semibold text-indigo-100 whitespace-nowrap"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Fill Missing ({missingPrompts.length})</span>
            </button>
          )}

          <button
            type="button"
            disabled={generating || scenes.length === 0}
            onClick={() => handleGeneratePrompts()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            <span>{generating ? 'Generating Prompts...' : 'Generate All Scene Prompts'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Bulk Copy & Export Bar */}
      {scenes.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            Style: {yt.visualStyles[project.settings.visualStyle]} · Aspect: {project.settings.aspectRatio} ·{' '}
            {scenes.length - missingPrompts.length}/{scenes.length} prompts ready
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              {copiedKey === 'all' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span>{copiedKey === 'all' ? 'All Prompts Copied' : 'Copy All Prompts'}</span>
            </button>

            <button
              type="button"
              onClick={() => downloadAllPromptsTxt(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>Download Prompts TXT</span>
            </button>

            <button
              type="button"
              onClick={() => downloadStoryboardCsv(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export Storyboard CSV</span>
            </button>

            <button
              type="button"
              onClick={() => downloadStoryboardJson(project)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export Storyboard JSON</span>
            </button>
          </div>
        </div>
      )}

      {scenes.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center text-sm text-slate-400">
          Plan scenes in the Smart Scene Director first so every scene gets a narration-synchronized image prompt.
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.map((sc) => (
            <div
              key={sc.id}
              className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-white tabular-nums">
                    scene_{String(sc.sceneNumber).padStart(3, '0')}.png
                  </span>
                  <span className="text-indigo-300 font-mono tabular-nums">
                    ({formatShortClock(sc.startMs)} – {formatShortClock(sc.endMs)})
                  </span>
                  <span className="text-slate-400">· {sc.chapterTitle}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(sc.imagePrompt || sc.visualDescription);
                      setCopiedKey(sc.id);
                      setTimeout(() => setCopiedKey(null), 1800);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-200 whitespace-nowrap"
                  >
                    {copiedKey === sc.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedKey === sc.id ? 'Copied' : 'Copy Prompt'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={regenId === sc.id}
                    onClick={() => handleRegenSingle(sc.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 text-xs text-slate-200 whitespace-nowrap"
                  >
                    {regenId === sc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>

              <p dir="auto" className="text-xs text-slate-400">
                Narration: {sc.narrationText}
              </p>

              <textarea
                rows={3}
                value={sc.imagePrompt}
                onChange={(e) => handleEditPrompt(sc.id, e.target.value)}
                placeholder="Click Generate All Scene Prompts or type a custom image prompt..."
                className="w-full rounded-lg border border-white/10 bg-[#070910] p-3 text-xs leading-relaxed text-slate-100 focus:outline-none focus:border-indigo-400"
              />

              {sc.continuityNotes && (
                <div className="text-[11px] text-slate-400">
                  Continuity note: {sc.continuityNotes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
