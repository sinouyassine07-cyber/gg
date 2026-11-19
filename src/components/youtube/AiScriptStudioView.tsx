import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
  Unlock,
  Wand2,
} from 'lucide-react';
import type { YouTubeTranslations } from '../../i18n/ytTranslations';
import { ytApi } from '../../lib/ytApi';
import type { ScriptEditAction, ScriptChapter, YouTubeProject } from '../../types/youtube';

interface AiScriptStudioViewProps {
  project: YouTubeProject;
  aiConfigured?: boolean;
  onOpenAiSettings?: () => void;
  onProjectChange: (next: YouTubeProject) => void;
  onSavePatch: (patch: Partial<YouTubeProject>) => Promise<void>;
  onGoToVoiceover: () => void;
  yt: YouTubeTranslations;
}

export function AiScriptStudioView({
  project,
  aiConfigured,
  onOpenAiSettings,
  onProjectChange,
  onSavePatch,
  onGoToVoiceover,
  yt,
}: AiScriptStudioViewProps) {
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [transformingKey, setTransformingKey] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [viewMode, setViewMode] = useState<'chapters' | 'full'>('chapters');
  const [error, setError] = useState<string | null>(null);

  const script = project.script;

  const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

  const totalWords = script
    ? countWords(script.hook) +
      countWords(script.introduction) +
      countWords(script.conclusion) +
      script.chapters.reduce((s, c) => s + countWords(c.content), 0)
    : 0;

  const handleGenerateFull = async () => {
    setError(null);
    setGenerating(true);
    try {
      const res = await ytApi.generateScript(project.id);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate script.');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateScript = async (nextScript: NonNullable<YouTubeProject['script']>) => {
    const updated = {
      ...nextScript,
      approved: false,
      updatedAt: new Date().toISOString(),
    };
    onProjectChange({ ...project, script: updated });
    await onSavePatch({ script: updated });
  };

  const handleTransformSection = async (params: {
    key: string;
    action: ScriptEditAction;
    text: string;
    surroundingContext?: string;
    applyResult: (revised: string) => Promise<void>;
  }) => {
    setError(null);
    setTransformingKey(params.key);
    try {
      const res = await ytApi.transformScript(project.id, {
        action: params.action,
        targetText: params.text,
        surroundingContext: params.surroundingContext,
        customInstruction: params.action === 'rewrite' ? customPrompt : undefined,
      });
      await params.applyResult(res.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Script rewrite failed.');
    } finally {
      setTransformingKey(null);
    }
  };

  const handleApproveToggle = async (approve: boolean) => {
    setError(null);
    setApproving(true);
    try {
      const res = await ytApi.approveScript(project.id, approve);
      onProjectChange(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update script approval.');
    } finally {
      setApproving(false);
    }
  };

  const handleToggleChapterLock = async (chId: string) => {
    if (!script) return;
    const nextChapters = script.chapters.map((c) =>
      c.id === chId ? { ...c, locked: !c.locked } : c
    );
    const nextScript = { ...script, chapters: nextChapters };
    onProjectChange({ ...project, script: nextScript });
    await onSavePatch({ script: nextScript });
  };

  const handleToggleChapterApprove = async (chId: string) => {
    if (!script) return;
    const nextChapters = script.chapters.map((c) =>
      c.id === chId ? { ...c, approved: !c.approved } : c
    );
    const nextScript = { ...script, chapters: nextChapters };
    onProjectChange({ ...project, script: nextScript });
    await onSavePatch({ script: nextScript });
  };

  const handleRegenerateSelectedParagraph = async (ch: ScriptChapter, textareaEl: HTMLTextAreaElement | null) => {
    if (!script || ch.locked) return;
    const start = textareaEl?.selectionStart ?? 0;
    const end = textareaEl?.selectionEnd ?? 0;
    const selected = start !== end ? ch.content.slice(start, end).trim() : '';
    const paragraphs = ch.content.split(/\n{2,}/);
    const targetText = selected || paragraphs[0] || ch.content;

    await handleTransformSection({
      key: `para-${ch.id}`,
      action: 'regenerate_paragraph',
      text: targetText,
      surroundingContext: ch.content,
      applyResult: async (revised) => {
        const nextContent = selected
          ? `${ch.content.slice(0, start)}${revised}${ch.content.slice(end)}`
          : paragraphs.length > 1
            ? [revised, ...paragraphs.slice(1)].join('\n\n')
            : revised;
        const nextChapters = script.chapters.map((item) =>
          item.id === ch.id
            ? { ...item, content: nextContent, wordCount: countWords(nextContent) }
            : item
        );
        await handleUpdateScript({ ...script, chapters: nextChapters });
      },
    });
  };

  const handleAddBlankChapter = async () => {
    if (!script) return;
    const newCh: ScriptChapter = {
      id: `ch_${Math.random().toString(36).slice(2, 10)}`,
      index: script.chapters.length + 1,
      title: `Chapter ${script.chapters.length + 1}`,
      content: '',
      summary: '',
      estimatedMinutes: 2,
      locked: false,
      approved: false,
      wordCount: 0,
    };
    await handleUpdateScript({ ...script, chapters: [...script.chapters, newCh] });
  };

  const fullCombinedScript = script
    ? [
        script.hook,
        script.introduction,
        ...script.chapters.map((c) => `## ${c.title}\n${c.content}`),
        script.conclusion,
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';

  const applyFullScriptText = async (raw: string) => {
    if (!script) return;
    const blocks = raw.split(/\n{2,}/).filter((b) => b.trim());
    if (blocks.length === 0) return;
    // Update intro/hook/conclusion or keep chapter structure if markers exist
    const parsedChapters: ScriptChapter[] = [];
    const headerRegex = /^##\s+(.+)\n([\s\S]*)$/;
    const remaining: string[] = [];

    for (const part of raw.split(/(?=^##\s+)/m)) {
      const m = part.trim().match(headerRegex);
      if (m) {
        const idx = parsedChapters.length;
        const orig = script.chapters[idx];
        const body = m[2].trim();
        parsedChapters.push({
          id: orig?.id || `ch_${idx}_${Date.now()}`,
          index: idx + 1,
          title: m[1].trim(),
          content: body,
          summary: orig?.summary || '',
          estimatedMinutes: orig?.estimatedMinutes || 2,
          locked: orig?.locked || false,
          approved: false,
          wordCount: countWords(body),
        });
      } else if (part.trim()) {
        remaining.push(part.trim());
      }
    }

    if (parsedChapters.length > 0) {
      await handleUpdateScript({
        ...script,
        chapters: parsedChapters,
      });
    } else {
      const updated = script.chapters.map((c, idx) =>
        idx === 0 ? { ...c, content: raw.trim(), wordCount: countWords(raw) } : c
      );
      await handleUpdateScript({ ...script, chapters: updated });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {yt.nav['yt-script']}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span className="text-slate-200 font-sans font-medium">{project.settings.name}</span>
            <span aria-hidden="true">·</span>
            <span>{project.settings.targetDurationMinutes}m target</span>
            <span aria-hidden="true">·</span>
            <span>{totalWords.toLocaleString()} words</span>
            <span aria-hidden="true">·</span>
            <span>{script?.chapters.length || 0} chapters</span>
            {script?.approved && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300 font-semibold">Approved for Voiceover</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {script && (
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0c101b] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setViewMode('chapters')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'chapters' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Chapter Studio
              </button>
              <button
                type="button"
                onClick={() => setViewMode('full')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'full' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Full Script Editor
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateFull}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-400/35 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-60 text-xs font-semibold text-indigo-100 transition-colors whitespace-nowrap"
          >
            {generating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Writing Long-Form Script...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{script ? 'Regenerate Full Script' : 'Generate Complete Script'}</span>
              </>
            )}
          </button>

          {script && (
            <button
              type="button"
              onClick={() => handleApproveToggle(!script.approved)}
              disabled={approving}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                script.approved
                  ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                  : 'bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{script.approved ? 'Script Approved' : 'Approve Script'}</span>
            </button>
          )}

          {script?.approved && (
            <button
              type="button"
              onClick={onGoToVoiceover}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              <span>Voiceover Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {aiConfigured === false && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              No AI Text Provider API key is configured yet. Add Gemini, OpenAI, Claude, or a custom endpoint in <strong>Settings &gt; AI Providers &amp; API Keys</strong>.
            </span>
          </div>
          {onOpenAiSettings && (
            <button
              type="button"
              onClick={onOpenAiSettings}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/35 text-xs font-semibold text-amber-100 whitespace-nowrap"
            >
              Open AI Provider Settings
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!script ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center space-y-4">
          <BookOpen className="w-10 h-10 text-indigo-400 mx-auto" />
          <div>
            <h2 className="text-lg font-semibold text-white">Ready to Write Your Script</h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto mt-1.5">
              Your configured AI provider will structure an engaging opening hook, introduction, {project.settings.targetDurationMinutes}-minute chaptered narration in {project.settings.language}, transitions, and conclusion for: <strong className="text-slate-200">{project.settings.topic}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateFull}
            disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:opacity-60 text-xs font-semibold text-white"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{generating ? 'Writing Chapters...' : 'Generate Complete Script'}</span>
          </button>
        </div>
      ) : viewMode === 'full' ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-slate-400">
              Complete Script View (keep <code className="font-mono text-indigo-300">## Chapter Title</code> headings to preserve chapter splits)
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {totalWords.toLocaleString()} words
            </span>
          </div>
          <textarea
            rows={24}
            dir="auto"
            value={fullCombinedScript}
            onChange={(e) => applyFullScriptText(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#070910] p-4 text-sm leading-relaxed text-slate-100 focus:outline-none focus:border-indigo-400"
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Custom Rewrite Instruction Bar */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4 flex flex-wrap items-center gap-3">
            <Wand2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Optional custom rewrite instruction (e.g. 'Make tone more suspenseful', 'Simplify technical terms')..."
              className="flex-1 min-w-[240px] rounded-lg border border-white/10 bg-[#070910] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Hook & Introduction */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">Opening Hook</h2>
                <button
                  type="button"
                  disabled={transformingKey === 'hook'}
                  onClick={() =>
                    handleTransformSection({
                      key: 'hook',
                      action: 'improve',
                      text: script.hook,
                      applyResult: async (rev) => handleUpdateScript({ ...script, hook: rev }),
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-200"
                >
                  {transformingKey === 'hook' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3 text-indigo-400" />
                  )}
                  <span>Improve Hook</span>
                </button>
              </div>
              <textarea
                rows={4}
                dir="auto"
                value={script.hook}
                onChange={(e) => handleUpdateScript({ ...script, hook: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-[#070910] p-3 text-sm leading-relaxed text-slate-100 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">Introduction</h2>
                <button
                  type="button"
                  disabled={transformingKey === 'intro'}
                  onClick={() =>
                    handleTransformSection({
                      key: 'intro',
                      action: 'improve',
                      text: script.introduction,
                      applyResult: async (rev) =>
                        handleUpdateScript({ ...script, introduction: rev }),
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-200"
                >
                  {transformingKey === 'intro' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3 text-indigo-400" />
                  )}
                  <span>Improve Intro</span>
                </button>
              </div>
              <textarea
                rows={4}
                dir="auto"
                value={script.introduction}
                onChange={(e) => handleUpdateScript({ ...script, introduction: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-[#070910] p-3 text-sm leading-relaxed text-slate-100 focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Chapters */}
          <div className="space-y-4">
            {script.chapters.map((ch) => {
              const textareaId = `chapter-ta-${ch.id}`;
              const isBusy =
                transformingKey === ch.id || transformingKey === `para-${ch.id}`;

              return (
                <div
                  key={ch.id}
                  className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-1 min-w-[220px]">
                      <span className="text-xs font-mono tabular-nums text-indigo-300 font-semibold shrink-0">
                        Ch. {ch.index}
                      </span>
                      <input
                        type="text"
                        dir="auto"
                        disabled={ch.locked}
                        value={ch.title}
                        onChange={(e) => {
                          const next = script.chapters.map((item) =>
                            item.id === ch.id ? { ...item, title: e.target.value } : item
                          );
                          handleUpdateScript({ ...script, chapters: next });
                        }}
                        className="flex-1 bg-transparent border-b border-transparent focus:border-indigo-400 text-sm font-semibold text-white focus:outline-none py-0.5 disabled:opacity-70"
                      />
                      <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                        {countWords(ch.content)} words
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={ch.locked || isBusy}
                        onClick={() =>
                          handleRegenerateSelectedParagraph(
                            ch,
                            document.getElementById(textareaId) as HTMLTextAreaElement | null
                          )
                        }
                        className="px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-45 text-xs text-slate-200 whitespace-nowrap"
                      >
                        Regenerate Paragraph
                      </button>

                      {(
                        [
                          ['expand', 'Expand', Plus],
                          ['shorten', 'Shorten', Scissors],
                          ['improve', 'Improve', Wand2],
                          ['rewrite', 'Rewrite', RefreshCw],
                        ] as const
                      ).map(([action, label, Icon]) => (
                        <button
                          key={action}
                          type="button"
                          disabled={ch.locked || isBusy}
                          onClick={() =>
                            handleTransformSection({
                              key: ch.id,
                              action,
                              text: ch.content,
                              surroundingContext: ch.summary,
                              applyResult: async (rev) => {
                                const next = script.chapters.map((item) =>
                                  item.id === ch.id
                                    ? { ...item, content: rev, wordCount: countWords(rev) }
                                    : item
                                );
                                await handleUpdateScript({ ...script, chapters: next });
                              },
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-45 text-xs text-slate-200 whitespace-nowrap"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Icon className="w-3 h-3 text-indigo-400" />
                          )}
                          <span>{label}</span>
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleToggleChapterApprove(ch.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
                          ch.approved
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                            : 'border-white/10 bg-white/[0.04] text-slate-300 hover:text-white'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{ch.approved ? 'Approved' : 'Approve'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleChapterLock(ch.id)}
                        title={ch.locked ? 'Unlock chapter' : 'Lock chapter'}
                        className={`p-1.5 rounded-md border transition-colors ${
                          ch.locked
                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                            : 'border-white/10 bg-white/[0.04] text-slate-400 hover:text-white'
                        }`}
                      >
                        {ch.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                      </button>

                      {script.chapters.length > 1 && !ch.locked && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = script.chapters
                              .filter((item) => item.id !== ch.id)
                              .map((item, idx) => ({ ...item, index: idx + 1 }));
                            handleUpdateScript({ ...script, chapters: next });
                          }}
                          className="p-1.5 rounded-md border border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                          title="Delete chapter"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    id={textareaId}
                    rows={7}
                    dir="auto"
                    disabled={ch.locked}
                    value={ch.content}
                    onChange={(e) => {
                      const val = e.target.value;
                      const next = script.chapters.map((item) =>
                        item.id === ch.id
                          ? { ...item, content: val, wordCount: countWords(val) }
                          : item
                      );
                      handleUpdateScript({ ...script, chapters: next });
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#070910] p-3.5 text-sm leading-relaxed text-slate-100 focus:outline-none focus:border-indigo-400 disabled:opacity-70"
                  />
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleAddBlankChapter}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/10 bg-[#0c101b] hover:bg-white/[0.05] text-xs font-medium text-slate-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Chapter</span>
            </button>
          </div>

          {/* Conclusion & Research Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Conclusion</h2>
                <button
                  type="button"
                  disabled={transformingKey === 'conclusion'}
                  onClick={() =>
                    handleTransformSection({
                      key: 'conclusion',
                      action: 'improve',
                      text: script.conclusion,
                      applyResult: async (rev) =>
                        handleUpdateScript({ ...script, conclusion: rev }),
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-200"
                >
                  {transformingKey === 'conclusion' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Wand2 className="w-3 h-3 text-indigo-400" />
                  )}
                  <span>Improve Conclusion</span>
                </button>
              </div>
              <textarea
                rows={4}
                dir="auto"
                value={script.conclusion}
                onChange={(e) => handleUpdateScript({ ...script, conclusion: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-[#070910] p-3 text-sm leading-relaxed text-slate-100 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">
                Factual Context & Continuity Notes
              </h2>
              {script.researchNotes.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No additional research notes included for this script.
                </p>
              ) : (
                <ul className="space-y-2 text-xs text-slate-300 leading-relaxed list-disc ps-4">
                  {script.researchNotes.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {!script.approved && (
            <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-indigo-100">
                Approve your script when ready to unlock Fish Audio voiceover generation.
              </div>
              <button
                type="button"
                onClick={() => handleApproveToggle(true)}
                disabled={approving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Approve & Proceed to Voiceover</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
