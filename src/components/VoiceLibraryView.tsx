import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  KeyRound,
  Loader2,
  Play,
  Search,
  Square,
  Star,
  Volume2,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { api, ApiError } from '../lib/api';
import type { ApiConfigStatus, VoiceModel } from '../types';
import { VoiceAvatar } from './VoiceAvatar';

interface VoiceLibraryViewProps {
  selectedVoice: VoiceModel | null;
  onSelectVoice: (voice: VoiceModel) => void;
  favorites: VoiceModel[];
  onToggleFavorite: (voice: VoiceModel) => Promise<void>;
  configStatus: ApiConfigStatus | null;
  onOpenApiConfig: () => void;
  t: TranslationDictionary;
}

const LANGUAGE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'en', label: 'English (EN)' },
  { value: 'ar', label: 'Arabic (AR)' },
  { value: 'zh', label: 'Chinese (ZH)' },
  { value: 'ja', label: 'Japanese (JA)' },
  { value: 'ko', label: 'Korean (KO)' },
  { value: 'fr', label: 'French (FR)' },
  { value: 'de', label: 'German (DE)' },
  { value: 'es', label: 'Spanish (ES)' },
];

export function VoiceLibraryView({
  selectedVoice,
  onSelectVoice,
  favorites,
  onToggleFavorite,
  configStatus,
  onOpenApiConfig,
  t,
}: VoiceLibraryViewProps) {
  const [voices, setVoices] = useState<VoiceModel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [language, setLanguage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'task_count' | 'created_at'>('task_count');
  const [selfOnly, setSelfOnly] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMissing, setAuthMissing] = useState(false);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: t.library.categories.all },
    { id: 'narration', label: t.library.categories.narration },
    { id: 'conversational', label: t.library.categories.conversational },
    { id: 'news', label: t.library.categories.news },
    { id: 'audiobook', label: t.library.categories.audiobook },
    { id: 'gaming', label: t.library.categories.gaming },
    { id: 'podcast', label: t.library.categories.podcast },
    { id: 'commercial', label: t.library.categories.commercial },
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const fetchVoices = async (targetPage: number, append: boolean) => {
    if (configStatus && !configStatus.configured) {
      setAuthMissing(true);
      setVoices([]);
      setTotal(0);
      return;
    }

    setAuthMissing(false);
    setError(null);
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.getVoices({
        page_size: 24,
        page_number: targetPage,
        title: debouncedSearch || undefined,
        language: language !== 'all' ? language : undefined,
        tag: category !== 'all' ? category : undefined,
        sort_by: sortBy,
        self: selfOnly,
      });

      const safeList = Array.isArray(res.items)
        ? res.items.filter((v): v is VoiceModel => Boolean(v && typeof v === 'object' && v._id))
        : [];
      setTotal(typeof res.total === 'number' ? res.total : safeList.length);
      setVoices((prev) => (append ? [...prev, ...safeList] : safeList));
      setPage(targetPage);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'API_KEY_MISSING') {
        setAuthMissing(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load Fish Audio voices.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchVoices(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, language, sortBy, selfOnly, configStatus?.configured]);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingId(null);
  };

  const handlePreview = async (voice: VoiceModel) => {
    setPreviewError(null);
    if (previewingId === voice._id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewLoadingId(voice._id);

    try {
      let sampleUrl = voice.samples?.[0]?.audio;
      if (!sampleUrl) {
        const detailed = await api.getVoiceById(voice._id);
        sampleUrl = detailed.samples?.[0]?.audio;
      }

      if (!sampleUrl) {
        setPreviewError(`${voice.title}: ${t.library.noPreview}`);
        setPreviewLoadingId(null);
        return;
      }

      const audio = new Audio(sampleUrl);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingId(null);
      audio.onerror = () => {
        setPreviewingId(null);
        setPreviewError(`${voice.title}: ${t.library.noPreview}`);
      };

      await audio.play();
      setPreviewingId(voice._id);
    } catch {
      setPreviewError(`${voice.title}: ${t.library.noPreview}`);
      setPreviewingId(null);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const favoriteIds = new Set(favorites.map((f) => f._id));

  if (authMissing) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.library.title}</h1>
          <p className="text-sm text-slate-400 mt-1">{t.library.subtitle}</p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-8 sm:p-12 text-center max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-400/25 flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-5 h-5 text-indigo-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">{t.library.authRequiredTitle}</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">{t.library.authRequiredDesc}</p>
          <button
            type="button"
            onClick={onOpenApiConfig}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-sm font-semibold text-white transition-colors"
          >
            {t.library.goToApiConfig}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t.library.title}</h1>
          <p className="text-sm text-slate-400 mt-1">{t.library.subtitle}</p>
        </div>
        {total > 0 && (
          <div className="text-xs font-mono tabular-nums text-slate-400">
            {total.toLocaleString()} voices
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.library.searchPlaceholder}
              className="w-full rounded-lg border border-white/10 bg-[#070910] ps-10 pe-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label={t.library.allLanguages}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              {LANGUAGE_FILTERS.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.value === 'all' ? t.library.allLanguages : lang.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'task_count' | 'created_at')}
              aria-label="Sort voices"
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              <option value="task_count">{t.library.sortByPopular}</option>
              <option value="created_at">{t.library.sortByNewest}</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-center">
            <button
              type="button"
              onClick={() => setSelfOnly((s) => !s)}
              className={`w-full px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                selfOnly
                  ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200'
                  : 'border-white/10 bg-[#070910] text-slate-300 hover:text-white'
              }`}
            >
              {t.library.myVoicesOnly}
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                category === cat.id
                  ? 'bg-indigo-500 text-white'
                  : 'bg-[#070910] text-slate-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {previewError && (
        <div className="rounded-xl border border-white/10 bg-[#0c101b] px-4 py-2.5 text-xs text-slate-300 flex items-center justify-between">
          <span>{previewError}</span>
          <button
            type="button"
            onClick={() => setPreviewError(null)}
            className="text-slate-400 hover:text-white"
          >
            {t.common.dismiss}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-rose-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchVoices(1, false)}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-medium text-white"
          >
            {t.common.retry}
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-44 rounded-xl border border-white/[0.08] bg-[#0c101b] p-4 animate-pulse"
            />
          ))}
        </div>
      ) : voices.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center">
          <Volume2 className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-white">{t.library.emptyTitle}</h2>
          <p className="text-sm text-slate-400 mt-1">{t.library.emptyDesc}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {voices.map((voice) => {
              const isSelected = selectedVoice?._id === voice._id;
              const isFav = favoriteIds.has(voice._id);
              const isPreviewing = previewingId === voice._id;
              const isLoadingPreview = previewLoadingId === voice._id;

              const metadataParts = [
                voice.author?.nickname,
                voice.languages?.length
                  ? voice.languages.slice(0, 3).join(', ').toUpperCase()
                  : null,
                typeof voice.task_count === 'number'
                  ? `${voice.task_count.toLocaleString()} ${t.library.usesCount}`
                  : null,
              ].filter(Boolean);

              return (
                <article
                  key={voice._id}
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-colors ${
                    isSelected
                      ? 'border-indigo-400/50 bg-indigo-500/[0.07]'
                      : 'border-white/[0.08] bg-[#0c101b] hover:border-white/15'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <VoiceAvatar src={voice.cover_image} name={voice.title} size="md" />
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-white truncate">
                            {voice.title}
                          </h3>
                          {metadataParts.length > 0 && (
                            <div className="text-xs text-slate-400 truncate mt-0.5 tabular-nums">
                              {metadataParts.join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleFavorite(voice)}
                        aria-label={isFav ? t.library.favoriteRemove : t.library.favoriteAdd}
                        className={`p-2 rounded-lg transition-colors shrink-0 ${
                          isFav
                            ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                            : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.06]'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                    </div>

                    {voice.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {voice.description}
                      </p>
                    )}

                    {voice.tags && voice.tags.length > 0 && (
                      <div className="text-xs text-slate-500 truncate">
                        {voice.tags.slice(0, 4).join(' · ')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => handlePreview(voice)}
                      disabled={isLoadingPreview}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      {isLoadingPreview ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{t.library.previewLoading}</span>
                        </>
                      ) : isPreviewing ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current text-indigo-400" />
                          <span>{t.library.previewStop}</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{t.library.previewPlay}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectVoice(voice)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-indigo-500 text-white'
                          : 'bg-white/[0.08] hover:bg-indigo-500 text-slate-100 hover:text-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                      <span>{isSelected ? t.library.selectedBadge : t.library.selectVoice}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {voices.length < total && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => fetchVoices(page + 1, true)}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/12 bg-[#0c101b] hover:bg-white/[0.06] text-xs font-semibold text-slate-200 transition-colors"
              >
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t.library.loadMore}</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
