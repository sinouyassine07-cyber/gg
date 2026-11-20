import { useEffect, useState } from 'react';
import { Check, Globe, RotateCcw, Sliders } from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import {
  DEFAULT_GENERATION_PARAMS,
  type AudioFormat,
  type FishAudioModel,
  type GenerationParams,
  type LatencyMode,
  type UILanguage,
} from '../types';

interface SettingsViewProps {
  uiLanguage: UILanguage;
  onChangeLanguage: (lang: UILanguage) => Promise<void>;
  defaultParams: GenerationParams;
  onSaveDefaultParams: (next: GenerationParams) => Promise<void>;
  t: TranslationDictionary;
}

export function SettingsView({
  uiLanguage,
  onChangeLanguage,
  defaultParams,
  onSaveDefaultParams,
  t,
}: SettingsViewProps) {
  const [draft, setDraft] = useState<GenerationParams>(defaultParams);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setDraft(defaultParams);
  }, [defaultParams]);

  const handleSave = async () => {
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSaveDefaultParams(draft);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const factory = { ...DEFAULT_GENERATION_PARAMS };
    setDraft(factory);
    setSaving(true);
    try {
      await onSaveDefaultParams(factory);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{t.settings.title}</h1>
        <p className="text-sm text-slate-400 mt-1">{t.settings.subtitle}</p>
      </div>

      {/* Interface & RTL/LTR Localization */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-white/[0.08]">
          <Globe className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white">{t.settings.interfaceSection}</h2>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-100">{t.settings.languageLabel}</div>
            <div className="text-xs text-slate-400 mt-0.5">{t.settings.languageDesc}</div>
          </div>

          <div className="inline-flex p-1 rounded-lg bg-[#070910] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => onChangeLanguage('en')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                uiLanguage === 'en'
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.settings.englishOption}
            </button>
            <button
              type="button"
              onClick={() => onChangeLanguage('ar')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                uiLanguage === 'ar'
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.settings.arabicOption}
            </button>
          </div>
        </div>
      </section>

      {/* Default Generation Parameters */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0c101b] p-5 space-y-5">
        <div className="pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white">{t.settings.defaultsSection}</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t.settings.defaultsDesc}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="def-model" className="block text-xs font-medium text-slate-300">
              {t.studio.modelLabel}
            </label>
            <select
              id="def-model"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value as FishAudioModel })}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              <option value="s2.1-pro">s2.1-pro</option>
              <option value="s2.1-pro-free">s2.1-pro-free</option>
              <option value="s2-pro">s2-pro</option>
              <option value="s1">s1</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="def-format" className="block text-xs font-medium text-slate-300">
              {t.studio.formatLabel}
            </label>
            <select
              id="def-format"
              value={draft.format}
              onChange={(e) => setDraft({ ...draft, format: e.target.value as AudioFormat })}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="opus">Opus</option>
              <option value="pcm">PCM</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="def-latency" className="block text-xs font-medium text-slate-300">
              {t.studio.latencyLabel}
            </label>
            <select
              id="def-latency"
              value={draft.latency}
              onChange={(e) => setDraft({ ...draft, latency: e.target.value as LatencyMode })}
              className="w-full rounded-lg border border-white/10 bg-[#070910] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-400"
            >
              <option value="normal">{t.studio.latencyNormal}</option>
              <option value="balanced">{t.studio.latencyBalanced}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="def-speed" className="block text-xs font-medium text-slate-300">
              {t.studio.speedLabel} ({draft.speed.toFixed(2)}x)
            </label>
            <input
              id="def-speed"
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={draft.speed}
              onChange={(e) => setDraft({ ...draft, speed: Number(e.target.value) })}
              dir="ltr"
              className="studio-range w-full mt-2"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="def-temp" className="block text-xs font-medium text-slate-300">
              {t.studio.temperatureLabel} ({draft.temperature.toFixed(2)})
            </label>
            <input
              id="def-temp"
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={draft.temperature}
              onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
              dir="ltr"
              className="studio-range w-full mt-2"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="def-top-p" className="block text-xs font-medium text-slate-300">
              {t.studio.topPLabel} ({draft.top_p.toFixed(2)})
            </label>
            <input
              id="def-top-p"
              type="range"
              min={0.0}
              max={1.0}
              step={0.05}
              value={draft.top_p}
              onChange={(e) => setDraft({ ...draft, top_p: Number(e.target.value) })}
              dir="ltr"
              className="studio-range w-full mt-2"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 hover:bg-white/[0.06] text-xs font-medium text-slate-300 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.settings.resetDefaults}</span>
          </button>

          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                <Check className="w-3.5 h-3.5" />
                <span>{t.settings.savedNotice}</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-xs font-semibold text-white transition-colors"
            >
              {t.settings.saveDefaults}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
