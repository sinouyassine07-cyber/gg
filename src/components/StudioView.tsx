import { useRef, useState } from 'react';
import {
  AlertCircle,
  ClipboardPaste,
  Eraser,
  FileText,
  Layers,
  Library,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { countWords, estimateSpeechSeconds, formatTime } from '../lib/formatters';
import {
  buildDirectedSegmentsFromScript,
  getExpressionTagsForModel,
  normalizeTagSyntax,
  serializeDirectedSegmentsToScript,
  splitScriptIntoSegments,
} from '../lib/s2Tags';
import {
  DEFAULT_GENERATION_PARAMS,
  type ApiConfigStatus,
  type AudioFormat,
  type DirectedSegment,
  type FishAudioModel,
  type GenerationParams,
  type GenerationProgress,
  type GenerationRecord,
  type LatencyMode,
  type UILanguage,
  type VoiceModel,
} from '../types';
import { AudioPlayer } from './AudioPlayer';
import { SegmentDirector } from './SegmentDirector';
import { VoiceAvatar } from './VoiceAvatar';

interface StudioViewProps {
  text: string;
  onTextChange: (next: string) => void;
  directorMode: boolean;
  onDirectorModeChange: (next: boolean) => void;
  directedSegments: DirectedSegment[];
  onDirectedSegmentsChange: (next: DirectedSegment[]) => void;
  selectedVoice: VoiceModel | null;
  favorites: VoiceModel[];
  onClearVoice: () => void;
  onBrowseVoices: () => void;
  params: GenerationParams;
  onParamsChange: (next: GenerationParams) => void;
  onGenerate: () => Promise<void>;
  onCancelGenerate: () => void;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  error: string | null;
  onDismissError: () => void;
  currentRecord: GenerationRecord | null;
  onRecordUpdated?: (updated: GenerationRecord) => void;
  autoPlaySignal: number;
  configStatus: ApiConfigStatus | null;
  onOpenApiConfig: () => void;
  uiLanguage: UILanguage;
  t: TranslationDictionary;
}

const SAMPLE_RATES = [44100, 32000, 24000, 16000, 8000];

export function StudioView({
  text,
  onTextChange,
  directorMode,
  onDirectorModeChange,
  directedSegments,
  onDirectedSegmentsChange,
  selectedVoice,
  favorites,
  onClearVoice,
  onBrowseVoices,
  params,
  onParamsChange,
  onGenerate,
  onCancelGenerate,
  isGenerating,
  progress,
  error,
  onDismissError,
  currentRecord,
  onRecordUpdated,
  autoPlaySignal,
  configStatus,
  onOpenApiConfig,
  uiLanguage,
  t,
}: StudioViewProps) {
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);
  const [customTagInput, setCustomTagInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const expressionTags = getExpressionTagsForModel(params.model);

  const effectiveScriptText = directorMode
    ? serializeDirectedSegmentsToScript(directedSegments)
    : text;

  const charCount = effectiveScriptText.length;
  const wordCount = countWords(effectiveScriptText);
  const estSeconds = estimateSpeechSeconds(effectiveScriptText, params.speed);

  const computedSegmentsCount = directorMode
    ? directedSegments.filter((s) => s.text.trim() || s.emotionTag.trim()).length
    : params.continuous_narration
      ? splitScriptIntoSegments(text, 480).length
      : text.trim()
        ? 1
        : 0;

  const handlePaste = async () => {
    setClipboardMessage(null);
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        const nextText = text ? `${text}\n${clip}` : clip;
        onTextChange(nextText);
        if (directorMode) {
          onDirectedSegmentsChange(buildDirectedSegmentsFromScript(nextText, directedSegments));
        }
      }
    } catch {
      setClipboardMessage(t.studio.clipboardError);
    }
  };

  const handleClearScript = () => {
    onTextChange('');
    onDirectedSegmentsChange([]);
  };

  const insertExpressionTag = (rawTag: string) => {
    const tag = normalizeTagSyntax(rawTag, params.model);
    if (!tag) return;

    const el = textareaRef.current;
    if (!el) {
      const prefix = text && !text.endsWith(' ') && !text.endsWith('\n') ? ' ' : '';
      onTextChange(`${text}${prefix}${tag} `);
      return;
    }

    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const needsLeadingSpace =
      before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
    const insertion = `${needsLeadingSpace ? ' ' : ''}${tag} `;
    const nextValue = `${before}${insertion}${after.replace(/^\s+/, '')}`;
    const nextCaret = before.length + insertion.length;

    onTextChange(nextValue);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleInsertCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTagInput.trim()) return;
    insertExpressionTag(customTagInput);
    setCustomTagInput('');
  };

  const handleSwitchWorkspaceMode = (enableDirector: boolean) => {
    if (enableDirector === directorMode) return;
    if (enableDirector) {
      const nextSegs = buildDirectedSegmentsFromScript(text, directedSegments);
      onDirectedSegmentsChange(nextSegs);
      onDirectorModeChange(true);
    } else {
      const synced = serializeDirectedSegmentsToScript(directedSegments);
      if (synced || directedSegments.length === 0) {
        onTextChange(synced);
      }
      onDirectorModeChange(false);
    }
  };

  const handleDirectedChange = (nextSegments: DirectedSegment[]) => {
    onDirectedSegmentsChange(nextSegments);
    onTextChange(serializeDirectedSegmentsToScript(nextSegments));
  };

  const handleResplitFromScript = () => {
    onDirectedSegmentsChange(buildDirectedSegmentsFromScript(text));
  };

  const updateParam = <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) => {
    onParamsChange({ ...params, [key]: value });
  };

  const handleFormatChange = (nextFormat: AudioFormat) => {
    const next: GenerationParams = { ...params, format: nextFormat };
    if (nextFormat === 'opus') {
      next.sample_rate = 48000;
    } else if (next.sample_rate === 48000) {
      next.sample_rate = 44100;
    }
    onParamsChange(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.studio.title}</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">{t.studio.subtitle}</p>
        </div>
      </div>

      {configStatus && !configStatus.configured && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
          <div className="flex items-center gap-3 text-sm text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{t.studio.apiMissingBanner}</span>
          </div>
          <button
            type="button"
            onClick={onOpenApiConfig}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            {t.studio.apiMissingAction}
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3.5 text-sm text-rose-200"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p>{error}</p>
              {error.includes('s2.1-pro-free') && params.model !== 's2.1-pro-free' && (
                <button
                  type="button"
                  onClick={() => {
                    updateParam('model', 's2.1-pro-free');
                    onDismissError();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white transition-colors"
                >
                  Switch to s2.1-pro-free
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            aria-label={t.common.dismiss}
            className="text-rose-300 hover:text-white p-1 rounded shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {clipboardMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0c101b] px-4 py-2.5 text-xs text-slate-300">
          <span>{clipboardMessage}</span>
          <button
            type="button"
            onClick={() => setClipboardMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Main Script Workspace + Player */}
        <div className="xl:col-span-8 space-y-5">
          {/* Active Voice Bar */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <VoiceAvatar
                src={selectedVoice?.cover_image}
                name={selectedVoice?.title || t.studio.defaultVoiceTitle}
                size="md"
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-400">{t.studio.selectedVoice}</div>
                <div className="text-sm font-semibold text-white truncate">
                  {selectedVoice ? selectedVoice.title : t.studio.defaultVoiceTitle}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {selectedVoice
                    ? [
                        selectedVoice.author?.nickname,
                        selectedVoice.languages?.slice(0, 3).join(', ').toUpperCase(),
                      ]
                        .filter(Boolean)
                        .join(' · ') || selectedVoice._id
                    : t.studio.defaultVoiceDesc}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {selectedVoice && (
                <button
                  type="button"
                  onClick={onClearVoice}
                  className="px-3 py-2 rounded-lg border border-white/10 hover:bg-white/[0.06] text-xs font-medium text-slate-300 transition-colors whitespace-nowrap"
                >
                  {t.studio.clearVoice}
                </button>
              )}
              <button
                type="button"
                onClick={onBrowseVoices}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-200 transition-colors whitespace-nowrap"
              >
                <Library className="w-3.5 h-3.5" />
                <span>{t.studio.changeVoice}</span>
              </button>
            </div>
          </div>

          {/* Script Editor & Segment Director */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.08]">
              {/* Workspace Mode Segmented Switcher */}
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#070910] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspaceMode(false)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    !directorMode
                      ? 'bg-indigo-500 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t.studio.editorTab}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchWorkspaceMode(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    directorMode
                      ? 'bg-indigo-500 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    {t.studio.directorTab}
                    {computedSegmentsCount > 0 ? ` (${computedSegmentsCount})` : ''}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePaste}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>{t.studio.pasteText}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearScript}
                  disabled={!effectiveScriptText}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-40 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>{t.studio.clearText}</span>
                </button>
              </div>
            </div>

            {directorMode ? (
              <SegmentDirector
                segments={directedSegments}
                onSegmentsChange={handleDirectedChange}
                onResplitFromScript={handleResplitFromScript}
                selectedVoice={selectedVoice}
                favorites={favorites}
                params={params}
                uiLanguage={uiLanguage}
                t={t}
              />
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  id="studio-script-editor"
                  aria-label={t.studio.scriptLabel}
                  dir="auto"
                  value={text}
                  onChange={(e) => onTextChange(e.target.value)}
                  placeholder={t.studio.scriptPlaceholder}
                  rows={10}
                  className="w-full bg-transparent px-4 py-4 text-[15px] leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none resize-y min-h-[240px]"
                />

                {/* S2 Bracket Expression Tags Bar */}
                <div className="px-4 py-3 border-t border-white/[0.06] bg-[#090d16] space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-400 mr-1">
                      {params.model === 's1' ? t.studio.s1LegacyNotice : t.studio.emotionTip}
                    </span>
                    {expressionTags.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => insertExpressionTag(item.tag)}
                        title={uiLanguage === 'ar' ? item.labelAr : item.labelEn}
                        className="px-2 py-1 rounded text-xs font-mono text-indigo-300 hover:text-white hover:bg-indigo-500/20 border border-white/[0.08] transition-colors whitespace-nowrap"
                      >
                        {item.tag}
                      </button>
                    ))}
                  </div>

                  {params.model !== 's1' && (
                    <form
                      onSubmit={handleInsertCustomTag}
                      className="flex items-center gap-2 max-w-md"
                    >
                      <input
                        type="text"
                        dir="auto"
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        placeholder={t.studio.customTagPlaceholder}
                        className="flex-1 min-w-0 rounded-lg border border-white/10 bg-[#070910] px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                      />
                      <button
                        type="submit"
                        disabled={!customTagInput.trim()}
                        className="px-3 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40 text-xs font-medium text-indigo-200 transition-colors whitespace-nowrap shrink-0"
                      >
                        {t.studio.addCustomTag}
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}

            {/* Footer Stats + Primary Generate Action */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 border-t border-white/[0.08] bg-[#0b0f1a]">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
                <span>
                  {charCount.toLocaleString()} {t.studio.characters}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {wordCount.toLocaleString()} {t.studio.words}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  ~{formatTime(estSeconds)} {t.studio.estimatedDuration}
                </span>
                {computedSegmentsCount > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-indigo-300">
                      {computedSegmentsCount} {t.studio.segmentsEstimate}
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-600 hover:from-indigo-400 hover:via-violet-400 hover:to-blue-500 disabled:opacity-60 text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t.studio.generatingButton}</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span>{t.studio.generateButton}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isGenerating && (
            <div className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs font-medium text-indigo-200">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                  <span>
                    {progress && progress.phase === 'stitching'
                      ? t.studio.stitchingAudio.replace('{total}', String(progress.totalSegments))
                      : progress && progress.totalSegments > 1
                        ? t.studio.segmentProgress
                            .replace(
                              '{current}',
                              String(progress.completedSegments ?? progress.currentSegment)
                            )
                            .replace('{total}', String(progress.totalSegments))
                        : t.studio.generationProgress}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {progress && progress.totalSegments > 1 && (
                    <span className="text-xs font-mono tabular-nums text-indigo-300">
                      {progress.phase === 'stitching'
                        ? '95%'
                        : `${Math.round(
                            ((progress.completedSegments ?? progress.currentSegment) /
                              progress.totalSegments) *
                              90
                          )}%`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onCancelGenerate}
                    className="px-2.5 py-1 rounded-md border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-200 transition-colors"
                  >
                    {t.studio.cancelGeneration}
                  </button>
                </div>
              </div>

              {progress && progress.totalSegments > 1 && (
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-400 to-blue-400 transition-all duration-300"
                    style={{
                      width: `${
                        progress.phase === 'stitching'
                          ? 95
                          : Math.max(
                              8,
                              Math.round(
                                ((progress.completedSegments ?? progress.currentSegment) /
                                  progress.totalSegments) *
                                  90
                              )
                            )
                      }%`,
                    }}
                  />
                </div>
              )}

              {progress?.segmentText && (
                <p dir="auto" className="text-xs text-slate-300/90 truncate">
                  {progress.segmentText}
                </p>
              )}
            </div>
          )}

          {currentRecord && (
            <AudioPlayer
              record={currentRecord}
              t={t}
              autoPlaySignal={autoPlaySignal}
              onRecordUpdated={onRecordUpdated}
            />
          )}
        </div>

        {/* Right Column: Documented Fish Audio Parameters */}
        <aside className="xl:col-span-4 rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">{t.studio.paramsTitle}</h2>
            </div>
            <button
              type="button"
              onClick={() => onParamsChange({ ...DEFAULT_GENERATION_PARAMS })}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.studio.resetParams}</span>
            </button>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label htmlFor="param-model" className="block text-xs font-medium text-slate-300">
              {t.studio.modelLabel}
            </label>
            <select
              id="param-model"
              value={params.model}
              onChange={(e) => updateParam('model', e.target.value as FishAudioModel)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              <option value="s2.1-pro">s2.1-pro</option>
              <option value="s2.1-pro-free">s2.1-pro-free</option>
              <option value="s2-pro">s2-pro</option>
              <option value="s1">s1 (Legacy)</option>
            </select>
          </div>

          {/* Format + Sample Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="param-format" className="block text-xs font-medium text-slate-300">
                {t.studio.formatLabel}
              </label>
              <select
                id="param-format"
                value={params.format}
                onChange={(e) => handleFormatChange(e.target.value as AudioFormat)}
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="opus">Opus</option>
                <option value="pcm">PCM</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="param-sample-rate" className="block text-xs font-medium text-slate-300">
                {t.studio.sampleRateLabel}
              </label>
              <select
                id="param-sample-rate"
                value={params.sample_rate === null ? 'auto' : String(params.sample_rate)}
                onChange={(e) =>
                  updateParam(
                    'sample_rate',
                    e.target.value === 'auto' ? null : Number(e.target.value)
                  )
                }
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 font-mono tabular-nums focus:outline-none focus:border-indigo-400"
              >
                <option value="auto">{t.studio.autoSampleRate}</option>
                {params.format === 'opus' ? (
                  <>
                    <option value="48000">48,000 Hz</option>
                    <option value="24000">24,000 Hz</option>
                    <option value="16000">16,000 Hz</option>
                  </>
                ) : (
                  SAMPLE_RATES.map((sr) => (
                    <option key={sr} value={sr}>
                      {sr.toLocaleString()} Hz
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {params.format === 'mp3' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {t.studio.bitrateLabel} (MP3)
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#070910] border border-white/[0.08]">
                {([64, 128, 192] as const).map((br) => (
                  <button
                    key={br}
                    type="button"
                    onClick={() => updateParam('mp3_bitrate', br)}
                    className={`py-1.5 rounded-md text-xs font-mono tabular-nums transition-colors ${
                      params.mp3_bitrate === br
                        ? 'bg-indigo-500 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {br} kbps
                  </button>
                ))}
              </div>
            </div>
          )}

          {params.format === 'opus' && (
            <div className="space-y-1.5">
              <label htmlFor="param-opus-bitrate" className="block text-xs font-medium text-slate-300">
                {t.studio.bitrateLabel} (Opus)
              </label>
              <select
                id="param-opus-bitrate"
                value={params.opus_bitrate}
                onChange={(e) =>
                  updateParam('opus_bitrate', Number(e.target.value) as GenerationParams['opus_bitrate'])
                }
                className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 font-mono tabular-nums focus:outline-none focus:border-indigo-400"
              >
                <option value={24}>24 kbps</option>
                <option value={32}>32 kbps</option>
                <option value={48}>48 kbps</option>
                <option value={64}>64 kbps</option>
                <option value={-1000}>Auto (-1000)</option>
              </select>
            </div>
          )}

          {/* Speed Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="param-speed" className="font-medium text-slate-300">
                {t.studio.speedLabel}
              </label>
              <span className="font-mono tabular-nums text-indigo-300">{params.speed.toFixed(2)}x</span>
            </div>
            <input
              id="param-speed"
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={params.speed}
              onChange={(e) => updateParam('speed', Number(e.target.value))}
              dir="ltr"
              className="studio-range w-full"
            />
          </div>

          {/* Volume / Gain Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="param-volume" className="font-medium text-slate-300">
                {t.studio.volumeLabel}
              </label>
              <span className="font-mono tabular-nums text-indigo-300">
                {params.volume > 0 ? `+${params.volume.toFixed(1)}` : params.volume.toFixed(1)} dB
              </span>
            </div>
            <input
              id="param-volume"
              type="range"
              min={-20}
              max={20}
              step={0.5}
              value={params.volume}
              onChange={(e) => updateParam('volume', Number(e.target.value))}
              dir="ltr"
              className="studio-range w-full"
            />
          </div>

          {/* Temperature Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="param-temperature" className="font-medium text-slate-300">
                {t.studio.temperatureLabel}
              </label>
              <span className="font-mono tabular-nums text-indigo-300">
                {params.temperature.toFixed(2)}
              </span>
            </div>
            <input
              id="param-temperature"
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={params.temperature}
              onChange={(e) => updateParam('temperature', Number(e.target.value))}
              dir="ltr"
              className="studio-range w-full"
            />
          </div>

          {/* Top P Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="param-top-p" className="font-medium text-slate-300">
                {t.studio.topPLabel}
              </label>
              <span className="font-mono tabular-nums text-indigo-300">{params.top_p.toFixed(2)}</span>
            </div>
            <input
              id="param-top-p"
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={params.top_p}
              onChange={(e) => updateParam('top_p', Number(e.target.value))}
              dir="ltr"
              className="studio-range w-full"
            />
          </div>

          {/* Repetition Penalty */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="param-rep-penalty" className="font-medium text-slate-300">
                {t.studio.repetitionPenaltyLabel}
              </label>
              <span className="font-mono tabular-nums text-indigo-300">
                {params.repetition_penalty.toFixed(2)}
              </span>
            </div>
            <input
              id="param-rep-penalty"
              type="range"
              min={0.9}
              max={2.0}
              step={0.05}
              value={params.repetition_penalty}
              onChange={(e) => updateParam('repetition_penalty', Number(e.target.value))}
              dir="ltr"
              className="studio-range w-full"
            />
          </div>

          {/* Chunk Length */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="param-chunk-length" className="font-medium text-slate-300">
                {t.studio.chunkLengthLabel}
              </label>
              <span className="font-mono tabular-nums text-indigo-300">{params.chunk_length}</span>
            </div>
            <input
              id="param-chunk-length"
              type="range"
              min={100}
              max={300}
              step={10}
              value={params.chunk_length}
              onChange={(e) => updateParam('chunk_length', Number(e.target.value))}
              dir="ltr"
              className="studio-range w-full"
            />
          </div>

          {/* Latency Mode */}
          <div className="space-y-1.5">
            <label htmlFor="param-latency" className="block text-xs font-medium text-slate-300">
              {t.studio.latencyLabel}
            </label>
            <select
              id="param-latency"
              value={params.latency}
              onChange={(e) => updateParam('latency', e.target.value as LatencyMode)}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              <option value="normal">{t.studio.latencyNormal}</option>
              <option value="balanced">{t.studio.latencyBalanced}</option>
            </select>
          </div>

          {/* Normalize Toggle */}
          <label className="flex items-start justify-between gap-3 pt-2 border-t border-white/[0.08] cursor-pointer">
            <div>
              <div className="text-xs font-medium text-slate-200">{t.studio.normalizeLabel}</div>
              <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {t.studio.normalizeDesc}
              </div>
            </div>
            <input
              type="checkbox"
              checked={params.normalize}
              onChange={(e) => updateParam('normalize', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#070910] accent-indigo-500 shrink-0"
            />
          </label>

          {/* Continuous Narration Toggle & Pause */}
          <div className="pt-3 border-t border-white/[0.08] space-y-3">
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-slate-200">{t.studio.continuousLabel}</div>
                <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {t.studio.continuousDesc}
                </div>
              </div>
              <input
                type="checkbox"
                checked={params.continuous_narration}
                onChange={(e) => updateParam('continuous_narration', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-[#070910] accent-indigo-500 shrink-0"
              />
            </label>

            {params.continuous_narration && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="param-segment-pause" className="block text-xs font-medium text-slate-300">
                    {t.studio.segmentPauseLabel}
                  </label>
                  <select
                    id="param-segment-pause"
                    value={params.segment_pause_ms}
                    onChange={(e) =>
                      updateParam('segment_pause_ms', Number(e.target.value) as 0 | 150 | 350)
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
                  >
                    <option value={0}>{t.studio.pauseNone}</option>
                    <option value={150}>{t.studio.pauseShort}</option>
                    <option value={350}>{t.studio.pauseMedium}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="param-concurrency" className="block text-xs font-medium text-slate-300">
                    {t.studio.concurrencyLabel}
                  </label>
                  <select
                    id="param-concurrency"
                    value={params.parallel_concurrency}
                    onChange={(e) =>
                      updateParam('parallel_concurrency', Number(e.target.value) as 1 | 2 | 3)
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
                  >
                    <option value={3}>{t.studio.concurrency3}</option>
                    <option value={2}>{t.studio.concurrency2}</option>
                    <option value={1}>{t.studio.concurrency1}</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
