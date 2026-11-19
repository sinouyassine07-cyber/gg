import { useState } from 'react';
import {
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { api } from '../lib/api';
import {
  downloadTranscriptFile,
  formatInlineShortTimestamp,
  formatTranscriptString,
} from '../lib/transcriptExport';
import type { GenerationRecord, TranscriptFormat, TranscriptSource } from '../types';

interface TranscriptPanelProps {
  record: GenerationRecord;
  currentTimeMs: number;
  onSeekToSeconds: (seconds: number) => void;
  onRecordUpdated?: (updated: GenerationRecord) => void;
  t: TranslationDictionary;
}

export function TranscriptPanel({
  record,
  currentTimeMs,
  onSeekToSeconds,
  onRecordUpdated,
  t,
}: TranscriptPanelProps) {
  const [expanded, setExpanded] = useState(Boolean(record.transcript?.length));
  const [viewMode, setViewMode] = useState<'timeline' | 'inline'>('timeline');
  const [mode, setMode] = useState<'auto' | 'acoustic' | 'fish-asr' | 'gemini'>('auto');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [includeTimestampsInTxt, setIncludeTimestampsInTxt] = useState(true);
  const [copied, setCopied] = useState(false);

  const cues = Array.isArray(record.transcript) ? record.transcript : [];
  const hasCues = cues.length > 0;

  const sourceLabel = (source?: TranscriptSource): string | null => {
    switch (source) {
      case 'segment-exact':
        return t.player.sourceSegmentExact;
      case 'fish-asr':
        return t.player.sourceFishAsr;
      case 'gemini-ai':
        return t.player.sourceGemini;
      case 'acoustic-align':
        return t.player.sourceAcoustic;
      default:
        return null;
    }
  };

  const handleExtract = async () => {
    if (extracting) return;
    setExtractError(null);
    setExtracting(true);
    setExpanded(true);
    try {
      const res = await api.transcribeHistoryItem(record.id, mode);
      if (res?.record) {
        onRecordUpdated?.(res.record);
      }
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : 'Unable to extract transcript with timestamps.'
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleExport = (format: TranscriptFormat) => {
    if (!hasCues) return;
    downloadTranscriptFile(record, cues, format, includeTimestampsInTxt);
  };

  const inlineTxtContent = hasCues
    ? formatTranscriptString(record, cues, 'txt', includeTimestampsInTxt).trim()
    : '';

  const handleCopy = async () => {
    if (!hasCues) return;
    try {
      await navigator.clipboard.writeText(inlineTxtContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const sourceText = sourceLabel(record.transcriptSource);

  return (
    <div className="mt-4 pt-3 border-t border-white/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 hover:text-white transition-colors"
        >
          <Captions className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{t.player.transcriptTitle}</span>
          {hasCues && (
            <span className="text-slate-400 font-mono tabular-nums">
              · {cues.length}
              {sourceText ? ` · ${sourceText}` : ''}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {!hasCues && (
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50 text-xs font-semibold text-indigo-200 transition-colors whitespace-nowrap"
          >
            {extracting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t.player.extractingTranscript}</span>
              </>
            ) : (
              <>
                <Captions className="w-3.5 h-3.5" />
                <span>{t.player.extractTranscript}</span>
              </>
            )}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Controls & Export Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Transcription engine"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as 'auto' | 'acoustic' | 'fish-asr' | 'gemini')
                }
                className="rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-400"
              >
                <option value="auto">{t.player.modeAuto}</option>
                <option value="acoustic">{t.player.modeAcoustic}</option>
                <option value="fish-asr">{t.player.modeFishAsr}</option>
                <option value="gemini">{t.player.modeGemini}</option>
              </select>

              <button
                type="button"
                onClick={handleExtract}
                disabled={extracting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
              >
                {extracting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>{t.player.extractingTranscript}</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>
                      {hasCues ? t.player.reExtractTranscript : t.player.extractTranscript}
                    </span>
                  </>
                )}
              </button>
            </div>

            {hasCues && (
              <div className="flex flex-wrap items-center gap-1.5">
                {(['srt', 'vtt', 'txt', 'json'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => handleExport(fmt)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-indigo-500/20 hover:border-indigo-400/35 text-xs font-mono font-semibold text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3 h-3 text-indigo-300" />
                    <span>{fmt.toUpperCase()}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-300">{t.player.copiedNotice}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>{t.player.copyTranscript}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {hasCues && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTimestampsInTxt}
                  onChange={(e) => setIncludeTimestampsInTxt(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-white/20 bg-[#070910] accent-indigo-500"
                />
                <span>{t.player.txtTimestampsToggle}</span>
              </label>

              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#070910] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setViewMode('timeline')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'timeline'
                      ? 'bg-indigo-500 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.player.viewTimeline}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('inline')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                    viewMode === 'inline'
                      ? 'bg-indigo-500 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.player.viewInlineTxt}
                </button>
              </div>
            </div>
          )}

          {extractError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {extractError}
            </div>
          )}

          {hasCues ? (
            viewMode === 'inline' ? (
              <div
                dir="auto"
                className="rounded-lg border border-white/[0.07] bg-[#070910] p-3.5 text-xs leading-relaxed text-slate-200 max-h-60 overflow-y-auto select-all"
              >
                {inlineTxtContent}
              </div>
            ) : (
              <div className="rounded-lg border border-white/[0.07] bg-[#070910] max-h-60 overflow-y-auto divide-y divide-white/[0.06]">
                {cues.map((cue) => {
                  const isActive =
                    currentTimeMs >= cue.startMs && currentTimeMs <= cue.endMs;
                  return (
                    <button
                      key={cue.index}
                      type="button"
                      onClick={() => onSeekToSeconds(cue.startMs / 1000)}
                      className={`w-full text-start px-3 py-2 flex items-baseline gap-2.5 transition-colors hover:bg-white/[0.04] ${
                        isActive ? 'bg-indigo-500/[0.12]' : ''
                      }`}
                    >
                      <span
                        dir="ltr"
                        className={`text-xs font-mono tabular-nums shrink-0 ${
                          isActive ? 'text-indigo-300 font-semibold' : 'text-indigo-400/90'
                        }`}
                      >
                        ({formatInlineShortTimestamp(cue.startMs)})
                      </span>
                      <span
                        dir="auto"
                        className={`text-xs leading-relaxed ${
                          isActive ? 'text-white font-medium' : 'text-slate-200'
                        }`}
                      >
                        {cue.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <p className="text-xs text-slate-400">{t.player.transcriptEmpty}</p>
          )}
        </div>
      )}
    </div>
  );
}
