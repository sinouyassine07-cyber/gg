import { useEffect, useRef, useState } from 'react';
import { Loader2, Play, Square, Star, Trash2 } from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { api } from '../lib/api';
import type { VoiceModel } from '../types';
import { VoiceAvatar } from './VoiceAvatar';

interface FavoritesViewProps {
  favorites: VoiceModel[];
  selectedVoice: VoiceModel | null;
  onUseVoice: (voice: VoiceModel) => void;
  onRemoveFavorite: (voice: VoiceModel) => Promise<void>;
  onBrowseLibrary: () => void;
  t: TranslationDictionary;
}

export function FavoritesView({
  favorites,
  selectedVoice,
  onUseVoice,
  onRemoveFavorite,
  onBrowseLibrary,
  t,
}: FavoritesViewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const handlePreview = async (voice: VoiceModel) => {
    if (previewingId === voice._id) {
      audioRef.current?.pause();
      setPreviewingId(null);
      return;
    }

    audioRef.current?.pause();
    setLoadingId(voice._id);
    try {
      let sampleUrl = voice.samples?.[0]?.audio;
      if (!sampleUrl) {
        const detail = await api.getVoiceById(voice._id);
        sampleUrl = detail.samples?.[0]?.audio;
      }
      if (!sampleUrl) {
        setLoadingId(null);
        return;
      }
      const audio = new Audio(sampleUrl);
      audioRef.current = audio;
      audio.onended = () => setPreviewingId(null);
      await audio.play();
      setPreviewingId(voice._id);
    } catch {
      setPreviewingId(null);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{t.favorites.title}</h1>
        <p className="text-sm text-slate-400 mt-1">{t.favorites.subtitle}</p>
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-12 text-center">
          <Star className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-white">{t.favorites.emptyTitle}</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">{t.favorites.emptyDesc}</p>
          <button
            type="button"
            onClick={onBrowseLibrary}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-sm font-semibold text-white transition-colors"
          >
            {t.favorites.browseLibrary}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {favorites.map((voice) => {
            const isSelected = selectedVoice?._id === voice._id;
            const isPreviewing = previewingId === voice._id;
            const isLoading = loadingId === voice._id;

            return (
              <article
                key={voice._id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-4 ${
                  isSelected
                    ? 'border-indigo-400/50 bg-indigo-500/[0.07]'
                    : 'border-white/[0.08] bg-[#0c101b]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <VoiceAvatar src={voice.cover_image} name={voice.title} size="md" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{voice.title}</h3>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {[voice.author?.nickname, voice.languages?.slice(0, 3).join(', ').toUpperCase()]
                          .filter(Boolean)
                          .join(' · ') || voice._id}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveFavorite(voice)}
                    title={t.favorites.removeFavorite}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {voice.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {voice.description}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => handlePreview(voice)}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isPreviewing ? (
                      <Square className="w-3.5 h-3.5 fill-current text-indigo-400" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>{isPreviewing ? t.library.previewStop : t.library.previewPlay}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onUseVoice(voice)}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-xs font-semibold text-white transition-colors"
                  >
                    {t.favorites.useInStudio}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
