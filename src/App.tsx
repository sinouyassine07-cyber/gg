import { useEffect, useRef, useState } from 'react';
import { Globe, Menu } from 'lucide-react';
import { ApiConfigView } from './components/ApiConfigView';
import { FavoritesView } from './components/FavoritesView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { StudioView } from './components/StudioView';
import { VoiceLibraryView } from './components/VoiceLibraryView';
import { TRANSLATIONS } from './i18n/translations';
import { api, ApiError } from './lib/api';
import {
  DEFAULT_GENERATION_PARAMS,
  type ApiConfigStatus,
  type DirectedSegment,
  type DirectedSegmentPayload,
  type GenerationParams,
  type GenerationProgress,
  type GenerationRecord,
  type NavSection,
  type UILanguage,
  type VoiceModel,
} from './types';

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('studio');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [uiLanguage, setUiLanguage] = useState<UILanguage>(() => {
    const saved = localStorage.getItem('voice_studio_lang');
    return saved === 'ar' ? 'ar' : 'en';
  });

  const [configStatus, setConfigStatus] = useState<ApiConfigStatus | null>(null);
  const [defaultParams, setDefaultParams] = useState<GenerationParams>(DEFAULT_GENERATION_PARAMS);
  const [studioParams, setStudioParams] = useState<GenerationParams>(DEFAULT_GENERATION_PARAMS);

  const [scriptText, setScriptText] = useState(
    'Welcome to Voice Studio AI. Enter or paste any script here to synthesize natural, expressive speech powered by Fish Audio.'
  );
  const [directorMode, setDirectorMode] = useState(false);
  const [directedSegments, setDirectedSegments] = useState<DirectedSegment[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<VoiceModel | null>(null);
  const [favorites, setFavorites] = useState<VoiceModel[]>([]);
  const [history, setHistory] = useState<GenerationRecord[]>([]);

  const [currentRecord, setCurrentRecord] = useState<GenerationRecord | null>(null);
  const [historyActiveRecord, setHistoryActiveRecord] = useState<GenerationRecord | null>(null);
  const [autoPlaySignal, setAutoPlaySignal] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);

  const t = TRANSLATIONS[uiLanguage];

  // Sync HTML dir and lang attributes for seamless RTL/LTR switching
  useEffect(() => {
    document.documentElement.lang = uiLanguage;
    document.documentElement.dir = uiLanguage === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('voice_studio_lang', uiLanguage);
  }, [uiLanguage]);

  // Initial Hydration from backend
  useEffect(() => {
    async function bootstrap() {
      try {
        const [statusRes, prefsRes, favRes, histRes] = await Promise.all([
          api.getConfigStatus(),
          api.getPreferences(),
          api.getFavorites(),
          api.getHistory(),
        ]);

        setConfigStatus(statusRes);
        if (prefsRes?.uiLanguage === 'en' || prefsRes?.uiLanguage === 'ar') {
          setUiLanguage(prefsRes.uiLanguage);
        }
        const safeParams = {
          ...DEFAULT_GENERATION_PARAMS,
          ...(prefsRes?.defaultParams || {}),
        };
        setDefaultParams(safeParams);
        setStudioParams(safeParams);
        setSelectedVoice(prefsRes?.selectedVoice ?? null);
        const safeFavs = Array.isArray(favRes?.items)
          ? favRes.items.filter((f): f is VoiceModel => Boolean(f && f._id))
          : [];
        const safeHist = Array.isArray(histRes?.items)
          ? histRes.items.filter((h): h is GenerationRecord => Boolean(h && h.id))
          : [];
        setFavorites(safeFavs);
        setHistory(safeHist);
        if (safeHist.length > 0) {
          setCurrentRecord(safeHist[0]);
        }
      } catch {
        // Non-fatal startup fallback
      }
    }
    bootstrap();
  }, []);

  const handleLanguageChange = async (nextLang: UILanguage) => {
    setUiLanguage(nextLang);
    try {
      await api.updatePreferences({ uiLanguage: nextLang });
    } catch {
      // Keep UI responsive even if preference persist fails
    }
  };

  const handleSelectVoice = async (voice: VoiceModel | null) => {
    setSelectedVoice(voice);
    try {
      await api.updatePreferences({ selectedVoice: voice });
    } catch {
      // Ignore non-critical persistence failure
    }
  };

  const handleToggleFavorite = async (voice: VoiceModel) => {
    const exists = favorites.some((f) => f._id === voice._id);
    if (exists) {
      const res = await api.removeFavorite(voice._id);
      if (Array.isArray(res?.items)) {
        setFavorites(res.items.filter((f): f is VoiceModel => Boolean(f && f._id)));
      }
    } else {
      const res = await api.addFavorite(voice);
      if (Array.isArray(res?.items)) {
        setFavorites(res.items.filter((f): f is VoiceModel => Boolean(f && f._id)));
      }
    }
  };

  const handleCancelGenerate = () => {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
  };

  const handleGenerate = async () => {
    setStudioError(null);
    const activeDirected: DirectedSegmentPayload[] | undefined =
      directorMode && directedSegments.length > 0
        ? directedSegments
            .filter((seg) => seg.text.trim() || seg.emotionTag.trim())
            .map((seg) => ({
              text: seg.text.trim(),
              emotionTag: seg.emotionTag.trim() || undefined,
              speed: seg.speed ?? undefined,
              voiceId:
                seg.voiceMode === 'default'
                  ? null
                  : seg.voiceMode === 'custom'
                    ? seg.voiceId
                    : selectedVoice?._id || null,
            }))
        : undefined;

    const trimmed = scriptText.trim();
    if (!trimmed && (!activeDirected || activeDirected.length === 0)) {
      setStudioError(t.studio.emptyTextError);
      return;
    }

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsGenerating(true);
    setGenerationProgress(null);
    try {
      const res = await api.generateSpeechStream(
        {
          text: trimmed || activeDirected!.map((s) => s.text).join('\n'),
          voiceId: selectedVoice?._id || null,
          voiceName: selectedVoice?.title || t.studio.defaultVoiceTitle,
          voiceAuthor: selectedVoice?.author?.nickname,
          segments: activeDirected,
          ...studioParams,
        },
        {
          signal: controller.signal,
          onProgress: (prog) => setGenerationProgress(prog),
        }
      );

      if (!res?.record?.id) {
        throw new Error('Speech synthesis completed without a valid audio record.');
      }

      setHistory((prev) => [res.record, ...prev]);
      setCurrentRecord(res.record);
      setAutoPlaySignal((n) => n + 1);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Cancelled by user
      } else if (err instanceof ApiError && err.code === 'API_KEY_MISSING') {
        setStudioError(err.message);
      } else {
        setStudioError(err instanceof Error ? err.message : 'Speech generation failed.');
      }
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
      }
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const handleDeleteHistoryItem = async (id: string) => {
    await api.deleteHistoryItem(id);
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (currentRecord?.id === id) setCurrentRecord(null);
    if (historyActiveRecord?.id === id) setHistoryActiveRecord(null);
  };

  const handleClearHistory = async () => {
    await api.clearHistory();
    setHistory([]);
    setCurrentRecord(null);
    setHistoryActiveRecord(null);
  };

  const handleRecordUpdated = (updated: GenerationRecord) => {
    setHistory((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    if (currentRecord?.id === updated.id) {
      setCurrentRecord(updated);
    }
    if (historyActiveRecord?.id === updated.id) {
      setHistoryActiveRecord(updated);
    }
  };

  const handleLoadInStudio = (record: GenerationRecord) => {
    setScriptText(record.text);
    setDirectorMode(false);
    setDirectedSegments([]);
    setStudioParams({
      ...studioParams,
      model: record.model,
      format: record.format,
      sample_rate: record.sampleRate,
      speed: record.speed,
      volume: record.volume,
      temperature: record.temperature,
      top_p: record.topP,
      repetition_penalty: record.repetitionPenalty,
      latency: record.latency,
      normalize: record.normalize,
      chunk_length: record.chunkLength,
    });
    if (record.voiceId) {
      setSelectedVoice({
        _id: record.voiceId,
        title: record.voiceName,
        author: record.voiceAuthor ? { nickname: record.voiceAuthor } : undefined,
      });
    } else {
      setSelectedVoice(null);
    }
    setCurrentRecord(record);
    setActiveSection('studio');
  };

  const handleSaveDefaultParams = async (next: GenerationParams) => {
    setDefaultParams(next);
    setStudioParams(next);
    await api.updatePreferences({ defaultParams: next });
  };

  const sectionTitleMap: Record<NavSection, string> = {
    studio: t.nav.studio,
    library: t.nav.library,
    history: t.nav.history,
    favorites: t.nav.favorites,
    settings: t.nav.settings,
    'api-config': t.nav.apiConfig,
  };

  return (
    <div className="min-h-screen bg-[#070910] text-slate-100 flex">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        configStatus={configStatus}
        historyCount={history.length}
        favoritesCount={favorites.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        t={t}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Header */}
        <header className="h-16 border-b border-white/[0.08] bg-[#070910]/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t.header.openMenu}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-semibold text-slate-200 truncate">
              {sectionTitleMap[activeSection]}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleLanguageChange(uiLanguage === 'en' ? 'ar' : 'en')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-[#0c101b] hover:bg-white/[0.06] text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t.header.languageToggle}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('api-config')}
              className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-white/10 bg-[#0c101b] hover:border-indigo-400/40 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
            >
              <span>{configStatus?.configured ? t.apiConfig.connected : t.header.configureApiKey}</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1360px] w-full mx-auto">
          {activeSection === 'studio' && (
            <StudioView
              text={scriptText}
              onTextChange={setScriptText}
              directorMode={directorMode}
              onDirectorModeChange={setDirectorMode}
              directedSegments={directedSegments}
              onDirectedSegmentsChange={setDirectedSegments}
              selectedVoice={selectedVoice}
              favorites={favorites}
              onClearVoice={() => handleSelectVoice(null)}
              onBrowseVoices={() => setActiveSection('library')}
              params={studioParams}
              onParamsChange={setStudioParams}
              onGenerate={handleGenerate}
              onCancelGenerate={handleCancelGenerate}
              isGenerating={isGenerating}
              progress={generationProgress}
              error={studioError}
              onDismissError={() => setStudioError(null)}
              currentRecord={currentRecord}
              onRecordUpdated={handleRecordUpdated}
              autoPlaySignal={autoPlaySignal}
              configStatus={configStatus}
              onOpenApiConfig={() => setActiveSection('api-config')}
              uiLanguage={uiLanguage}
              t={t}
            />
          )}

          {activeSection === 'library' && (
            <VoiceLibraryView
              selectedVoice={selectedVoice}
              onSelectVoice={(voice) => {
                handleSelectVoice(voice);
                setActiveSection('studio');
              }}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              configStatus={configStatus}
              onOpenApiConfig={() => setActiveSection('api-config')}
              t={t}
            />
          )}

          {activeSection === 'history' && (
            <HistoryView
              items={history}
              activeRecord={historyActiveRecord}
              onPlayRecord={setHistoryActiveRecord}
              onRecordUpdated={handleRecordUpdated}
              onLoadInStudio={handleLoadInStudio}
              onDeleteItem={handleDeleteHistoryItem}
              onClearAll={handleClearHistory}
              onGoToStudio={() => setActiveSection('studio')}
              uiLanguage={uiLanguage}
              t={t}
            />
          )}

          {activeSection === 'favorites' && (
            <FavoritesView
              favorites={favorites}
              selectedVoice={selectedVoice}
              onUseVoice={(voice) => {
                handleSelectVoice(voice);
                setActiveSection('studio');
              }}
              onRemoveFavorite={handleToggleFavorite}
              onBrowseLibrary={() => setActiveSection('library')}
              t={t}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              uiLanguage={uiLanguage}
              onChangeLanguage={handleLanguageChange}
              defaultParams={defaultParams}
              onSaveDefaultParams={handleSaveDefaultParams}
              t={t}
            />
          )}

          {activeSection === 'api-config' && (
            <ApiConfigView
              status={configStatus}
              onStatusUpdated={setConfigStatus}
              t={t}
            />
          )}
        </main>
      </div>
    </div>
  );
}
