import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { api } from '../lib/api';
import { getExpressionTagsForModel, normalizeTagSyntax } from '../lib/s2Tags';
import type { DirectedSegment, GenerationParams, VoiceModel } from '../types';

interface SegmentDirectorProps {
  segments: DirectedSegment[];
  onSegmentsChange: (next: DirectedSegment[]) => void;
  onResplitFromScript: () => void;
  selectedVoice: VoiceModel | null;
  favorites: VoiceModel[];
  params: GenerationParams;
  uiLanguage: 'en' | 'ar';
  t: TranslationDictionary;
}

const SPEED_PRESETS = [0.75, 0.85, 0.9, 0.95, 1.0, 1.05, 1.15, 1.25, 1.4];

export function SegmentDirector({
  segments,
  onSegmentsChange,
  onResplitFromScript,
  selectedVoice,
  favorites,
  params,
  uiLanguage,
  t,
}: SegmentDirectorProps) {
  const tagOptions = getExpressionTagsForModel(params.model);
  const presetTagSet = new Set(tagOptions.map((o) => o.tag));

  const [customOpenIds, setCustomOpenIds] = useState<Record<string, boolean>>({});
  const [auditionLoadingId, setAuditionLoadingId] = useState<string | null>(null);
  const [auditionPlayingId, setAuditionPlayingId] = useState<string | null>(null);
  const [auditionError, setAuditionError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const auditionAbortRef = useRef<AbortController | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      auditionAbortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
      }
    };
  }, []);

  const stopAudition = () => {
    auditionAbortRef.current?.abort();
    auditionAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
    setAuditionLoadingId(null);
    setAuditionPlayingId(null);
  };

  const resolveSegmentVoiceId = (seg: DirectedSegment): string | null => {
    if (seg.voiceMode === 'default') return null;
    if (seg.voiceMode === 'custom') return seg.voiceId || null;
    return selectedVoice?._id || null;
  };

  const handleAudition = async (seg: DirectedSegment) => {
    if (auditionPlayingId === seg.id || auditionLoadingId === seg.id) {
      stopAudition();
      return;
    }

    stopAudition();
    setAuditionError(null);

    const text = seg.text.trim();
    if (!text && !seg.emotionTag.trim()) return;

    const controller = new AbortController();
    auditionAbortRef.current = controller;
    setAuditionLoadingId(seg.id);

    try {
      const blob = await api.auditionSegment(
        {
          ...params,
          text,
          emotionTag: seg.emotionTag,
          voiceId: resolveSegmentVoiceId(seg),
          speed: seg.speed ?? params.speed,
        },
        controller.signal
      );

      if (controller.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      activeUrlRef.current = url;

      const audio = audioRef.current || new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => {
        setAuditionPlayingId(null);
      };
      audio.onerror = () => {
        setAuditionPlayingId(null);
        setAuditionError('Unable to play segment preview audio.');
      };

      setAuditionLoadingId(null);
      setAuditionPlayingId(seg.id);
      await audio.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setAuditionLoadingId(null);
      setAuditionPlayingId(null);
      setAuditionError(err instanceof Error ? err.message : 'Segment preview failed.');
    }
  };

  const updateSegment = (id: string, patch: Partial<DirectedSegment>) => {
    onSegmentsChange(segments.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const moveSegment = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= segments.length) return;
    const copy = [...segments];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    onSegmentsChange(copy);
  };

  const removeSegment = (id: string) => {
    if (auditionPlayingId === id || auditionLoadingId === id) {
      stopAudition();
    }
    onSegmentsChange(segments.filter((s) => s.id !== id));
  };

  const addSegment = () => {
    const nextSeg: DirectedSegment = {
      id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: '',
      emotionTag: '',
      speed: null,
      voiceMode: 'global',
      voiceId: null,
    };
    onSegmentsChange([...segments, nextSeg]);
  };

  const resetAllOverrides = () => {
    setCustomOpenIds({});
    onSegmentsChange(
      segments.map((s) => ({
        ...s,
        emotionTag: '',
        speed: null,
        voiceMode: 'global',
        voiceId: null,
        voiceName: undefined,
      }))
    );
  };

  const handleVoiceSelectChange = (seg: DirectedSegment, value: string) => {
    if (value === 'global') {
      updateSegment(seg.id, { voiceMode: 'global', voiceId: null, voiceName: undefined });
      return;
    }
    if (value === 'default') {
      updateSegment(seg.id, { voiceMode: 'default', voiceId: null, voiceName: undefined });
      return;
    }
    if (value.startsWith('custom:')) {
      const targetId = value.slice(7);
      const fav = favorites.find((f) => f._id === targetId);
      const matchedName =
        fav?.title || (selectedVoice?._id === targetId ? selectedVoice.title : seg.voiceName);
      updateSegment(seg.id, {
        voiceMode: 'custom',
        voiceId: targetId,
        voiceName: matchedName,
      });
    }
  };

  return (
    <div className="bg-[#0a0e19]">
      {/* Director Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#090d16]">
        <p className="text-xs text-slate-400">{t.studio.directorDesc}</p>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onResplitFromScript}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t.studio.resplitFromScript}</span>
          </button>

          <button
            type="button"
            onClick={resetAllOverrides}
            disabled={segments.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] disabled:opacity-40 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.studio.resetOverrides}</span>
          </button>

          <button
            type="button"
            onClick={addSegment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-200 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.studio.addSegment}</span>
          </button>
        </div>
      </div>

      {auditionError && (
        <div className="px-4 py-2.5 border-b border-rose-500/25 bg-rose-500/10 text-xs text-rose-200 flex items-center justify-between gap-3">
          <span>{auditionError}</span>
          <button
            type="button"
            onClick={() => setAuditionError(null)}
            className="text-rose-300 hover:text-white text-xs font-medium"
          >
            {t.common.dismiss}
          </button>
        </div>
      )}

      {segments.length === 0 ? (
        <div className="px-4 py-12 text-center space-y-3">
          <p className="text-sm text-slate-400">{t.studio.directorEmpty}</p>
          <button
            type="button"
            onClick={addSegment}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.studio.addSegment}</span>
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.07]">
          {segments.map((seg, idx) => {
            const isCustomTag =
              Boolean(customOpenIds[seg.id]) ||
              (Boolean(seg.emotionTag) && !presetTagSet.has(seg.emotionTag));
            const emotionSelectValue = isCustomTag ? '__custom__' : seg.emotionTag;
            const voiceSelectValue =
              seg.voiceMode === 'custom' && seg.voiceId
                ? `custom:${seg.voiceId}`
                : seg.voiceMode;

            const isAuditionLoading = auditionLoadingId === seg.id;
            const isAuditionPlaying = auditionPlayingId === seg.id;
            const hasUnknownCustomVoice =
              seg.voiceMode === 'custom' &&
              seg.voiceId &&
              !favorites.some((f) => f._id === seg.voiceId) &&
              selectedVoice?._id !== seg.voiceId;

            return (
              <div key={seg.id} className="p-4 space-y-3 hover:bg-white/[0.015] transition-colors">
                {/* Segment Meta Row */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                    <span className="text-indigo-300 font-semibold">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {seg.text.length} {t.studio.characters}
                    </span>
                    {seg.emotionTag && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-200">{seg.emotionTag}</span>
                      </>
                    )}
                    {seg.speed !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-200">{seg.speed.toFixed(2)}x</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAudition(seg)}
                      disabled={!seg.text.trim() && !seg.emotionTag.trim()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-indigo-400/25 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40 text-xs font-medium text-indigo-200 transition-colors whitespace-nowrap"
                    >
                      {isAuditionLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>{t.studio.auditioning}</span>
                        </>
                      ) : isAuditionPlaying ? (
                        <>
                          <Square className="w-3 h-3 fill-current" />
                          <span>{t.studio.stopAudition}</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          <span>{t.studio.auditionSegment}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => moveSegment(idx, -1)}
                      disabled={idx === 0}
                      aria-label={t.studio.moveUp}
                      title={t.studio.moveUp}
                      className="p-1.5 rounded-md border border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => moveSegment(idx, 1)}
                      disabled={idx === segments.length - 1}
                      aria-label={t.studio.moveDown}
                      title={t.studio.moveDown}
                      className="p-1.5 rounded-md border border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => removeSegment(seg.id)}
                      aria-label={t.studio.deleteSegment}
                      title={t.studio.deleteSegment}
                      className="p-1.5 rounded-md border border-white/10 text-slate-400 hover:text-rose-300 hover:border-rose-500/30 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Editable Segment Script */}
                <textarea
                  dir="auto"
                  rows={2}
                  value={seg.text}
                  onChange={(e) => updateSegment(seg.id, { text: e.target.value })}
                  placeholder={t.studio.scriptPlaceholder}
                  className="w-full rounded-lg border border-white/[0.08] bg-[#070910] px-3 py-2.5 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 resize-y"
                />

                {/* Per-Segment Direction Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* 1. Emotion / Style Cue */}
                  <div className="space-y-1">
                    <label
                      htmlFor={`seg-emotion-${seg.id}`}
                      className="block text-[11px] font-medium text-slate-400"
                    >
                      {t.studio.segmentEmotion}
                    </label>
                    <select
                      id={`seg-emotion-${seg.id}`}
                      value={emotionSelectValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setCustomOpenIds((prev) => ({ ...prev, [seg.id]: true }));
                        } else {
                          setCustomOpenIds((prev) => ({ ...prev, [seg.id]: false }));
                          updateSegment(seg.id, { emotionTag: val });
                        }
                      }}
                      className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
                    >
                      <option value="">{t.studio.noEmotion}</option>
                      {tagOptions.map((opt) => (
                        <option key={opt.id} value={opt.tag}>
                          {opt.tag} · {uiLanguage === 'ar' ? opt.labelAr : opt.labelEn}
                        </option>
                      ))}
                      <option value="__custom__">{t.studio.customEmotionOption}</option>
                    </select>

                    {isCustomTag && (
                      <input
                        type="text"
                        dir="auto"
                        value={seg.emotionTag}
                        onChange={(e) => updateSegment(seg.id, { emotionTag: e.target.value })}
                        onBlur={(e) => {
                          const normalized = normalizeTagSyntax(e.target.value, params.model);
                          updateSegment(seg.id, { emotionTag: normalized });
                        }}
                        placeholder={t.studio.customEmotionPlaceholder}
                        className="w-full rounded-lg border border-indigo-400/35 bg-[#070910] px-2.5 py-1.5 text-xs font-mono text-indigo-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                      />
                    )}
                  </div>

                  {/* 2. Per-Segment Speed */}
                  <div className="space-y-1">
                    <label
                      htmlFor={`seg-speed-${seg.id}`}
                      className="block text-[11px] font-medium text-slate-400"
                    >
                      {t.studio.segmentSpeed}
                    </label>
                    <select
                      id={`seg-speed-${seg.id}`}
                      value={seg.speed === null ? 'global' : String(seg.speed)}
                      onChange={(e) =>
                        updateSegment(seg.id, {
                          speed: e.target.value === 'global' ? null : Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-indigo-400"
                    >
                      <option value="global">
                        {t.studio.globalSpeed} ({params.speed.toFixed(2)}x)
                      </option>
                      {SPEED_PRESETS.map((sp) => (
                        <option key={sp} value={String(sp)}>
                          {sp.toFixed(2)}x
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Per-Segment Speaker Voice */}
                  <div className="space-y-1">
                    <label
                      htmlFor={`seg-voice-${seg.id}`}
                      className="block text-[11px] font-medium text-slate-400"
                    >
                      {t.studio.segmentVoice}
                    </label>
                    <select
                      id={`seg-voice-${seg.id}`}
                      value={voiceSelectValue}
                      onChange={(e) => handleVoiceSelectChange(seg, e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#070910] px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-400"
                    >
                      <option value="global">
                        {t.studio.globalVoice}
                        {selectedVoice ? ` (${selectedVoice.title})` : ''}
                      </option>
                      <option value="default">{t.studio.defaultNarrator}</option>
                      {selectedVoice && (
                        <option value={`custom:${selectedVoice._id}`}>
                          {selectedVoice.title}
                        </option>
                      )}
                      {favorites
                        .filter((f) => f._id !== selectedVoice?._id)
                        .map((fav) => (
                          <option key={fav._id} value={`custom:${fav._id}`}>
                            {fav.title}
                          </option>
                        ))}
                      {hasUnknownCustomVoice && seg.voiceId && (
                        <option value={`custom:${seg.voiceId}`}>
                          {seg.voiceName || seg.voiceId}
                        </option>
                      )}
                    </select>
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
