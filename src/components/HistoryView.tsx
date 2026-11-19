import { useState } from 'react';
import {
  ArrowUpRight,
  Download,
  History,
  Loader2,
  Pause,
  Play,
  Search,
  Trash2,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import {
  downloadGenerationAudio,
  getAudioDownloadFilename,
  getAudioDownloadHref,
} from '../lib/download';
import { formatBytes, formatDate } from '../lib/formatters';
import type { GenerationRecord, UILanguage } from '../types';
import { AudioPlayer } from './AudioPlayer';

interface HistoryViewProps {
  items: GenerationRecord[];
  activeRecord: GenerationRecord | null;
  onPlayRecord: (record: GenerationRecord) => void;
  onRecordUpdated?: (updated: GenerationRecord) => void;
  onLoadInStudio: (record: GenerationRecord) => void;
  onDeleteItem: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onGoToStudio: () => void;
  uiLanguage: UILanguage;
  t: TranslationDictionary;
}

export function HistoryView({
  items,
  activeRecord,
  onPlayRecord,
  onRecordUpdated,
  onLoadInStudio,
  onDeleteItem,
  onClearAll,
  onGoToStudio,
  uiLanguage,
  t,
}: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [autoPlaySignal, setAutoPlaySignal] = useState(0);

  const safeItems = Array.isArray(items)
    ? items.filter((item): item is GenerationRecord => Boolean(item && typeof item === 'object' && item.id))
    : [];

  const filtered = safeItems.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.text || '').toLowerCase().includes(q) ||
      (item.voiceName || '').toLowerCase().includes(q) ||
      (item.model || '').toLowerCase().includes(q)
    );
  });

  const handlePlay = (record: GenerationRecord) => {
    onPlayRecord(record);
    setAutoPlaySignal((n) => n + 1);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteItem(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.history.title}</h1>
          <p className="text-sm text-slate-400 mt-1">{t.history.subtitle}</p>
        </div>

        {safeItems.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmClear ? (
              <>
                <span className="text-xs text-rose-300">{t.history.clearConfirm}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await onClearAll();
                    setConfirmClear(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors"
                >
                  {t.history.confirmDelete}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white"
                >
                  {t.history.cancel}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 hover:border-rose-500/40 hover:bg-rose-500/10 text-xs font-medium text-slate-300 hover:text-rose-200 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.history.clearAll}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {downloadError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
          <span>{downloadError}</span>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-rose-300 hover:text-white font-medium"
          >
            {t.common.dismiss}
          </button>
        </div>
      )}

      {activeRecord && (
        <AudioPlayer
          record={activeRecord}
          t={t}
          autoPlaySignal={autoPlaySignal}
          onRecordUpdated={onRecordUpdated}
        />
      )}

      {safeItems.length > 0 && (
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.history.searchPlaceholder}
            className="w-full rounded-lg border border-white/10 bg-[#0c101b] ps-10 pe-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
          />
        </div>
      )}

      {safeItems.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center">
          <History className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-white">{t.history.emptyTitle}</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">{t.history.emptyDesc}</p>
          <button
            type="button"
            onClick={onGoToStudio}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-sm font-semibold text-white transition-colors"
          >
            {t.history.goToStudio}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isSelected = activeRecord?.id === item.id;
            return (
              <article
                key={item.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? 'border-indigo-400/45 bg-indigo-500/[0.06]'
                    : 'border-white/[0.08] bg-[#0c101b]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                      <span className="font-semibold text-slate-100">
                        {item.voiceName || t.common.defaultVoice}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{item.model || 's2.1-pro'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{(item.format || 'mp3').toUpperCase()}</span>
                      {item.sampleRate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">
                            {(item.sampleRate / 1000).toFixed(1)} kHz
                          </span>
                        </>
                      )}
                      {item.segmentCount && item.segmentCount > 1 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">
                            {item.segmentCount} {t.studio.segmentsEstimate}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{formatBytes(item.fileSizeBytes)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDate(item.createdAt, uiLanguage)}</span>
                    </div>

                    <p dir="auto" className="text-sm text-slate-200 leading-relaxed line-clamp-3">
                      {item.text || ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePlay(item)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-indigo-500 text-white'
                          : 'bg-white/[0.08] hover:bg-indigo-500 text-slate-100 hover:text-white'
                      }`}
                    >
                      {isSelected ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      <span>{t.history.playItem}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onLoadInStudio(item)}
                      title={t.history.loadInStudio}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t.history.loadInStudio}</span>
                    </button>

                    <a
                      href={getAudioDownloadHref(item)}
                      download={getAudioDownloadFilename(item)}
                      onClick={async (e) => {
                        e.preventDefault();
                        if (downloadingId === item.id) return;
                        setDownloadError(null);
                        setDownloadingId(item.id);
                        try {
                          await downloadGenerationAudio(item);
                        } catch (err) {
                          setDownloadError(
                            err instanceof Error ? err.message : 'Unable to download audio file.'
                          );
                        } finally {
                          setDownloadingId(null);
                        }
                      }}
                      title={t.history.downloadItem}
                      aria-label={t.history.downloadItem}
                      className="p-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-200 transition-colors"
                    >
                      {downloadingId === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                    </a>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      title={t.history.deleteItem}
                      className="p-2 rounded-lg border border-white/10 bg-white/[0.03] hover:border-rose-500/40 hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
