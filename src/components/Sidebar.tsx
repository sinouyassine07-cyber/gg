import {
  Activity,
  AudioWaveform,
  Captions,
  CheckCircle2,
  Clapperboard,
  Cpu,
  Download,
  FileText,
  Film,
  History,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  Library,
  Mic,
  PlusCircle,
  Settings,
  Star,
  AlertCircle,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import { YT_TRANSLATIONS } from '../i18n/ytTranslations';
import type { ApiConfigStatus, NavSection, UILanguage, YouTubeNavSection } from '../types';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  configStatus: ApiConfigStatus | null;
  historyCount: number;
  favoritesCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  uiLanguage: UILanguage;
  t: TranslationDictionary;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  configStatus,
  historyCount,
  favoritesCount,
  mobileOpen,
  onCloseMobile,
  uiLanguage,
  t,
}: SidebarProps) {
  const yt = YT_TRANSLATIONS[uiLanguage];

  const navItems: {
    id: NavSection;
    label: string;
    icon: typeof Mic;
    count?: number;
  }[] = [
    { id: 'studio', label: t.nav.studio, icon: Mic },
    { id: 'library', label: t.nav.library, icon: Library },
    { id: 'history', label: t.nav.history, icon: History, count: historyCount },
    { id: 'favorites', label: t.nav.favorites, icon: Star, count: favoritesCount },
    { id: 'ai-providers', label: t.aiProviders.sectionTitle, icon: Cpu },
    { id: 'settings', label: t.nav.settings, icon: Settings },
    { id: 'api-config', label: t.nav.apiConfig, icon: KeyRound },
  ];

  const youtubeItems: {
    id: YouTubeNavSection;
    label: string;
    icon: typeof Mic;
  }[] = [
    { id: 'yt-dashboard', label: yt.nav['yt-dashboard'], icon: LayoutDashboard },
    { id: 'yt-create', label: yt.nav['yt-create'], icon: PlusCircle },
    { id: 'yt-script', label: yt.nav['yt-script'], icon: FileText },
    { id: 'yt-voiceover', label: yt.nav['yt-voiceover'], icon: Volume2 },
    { id: 'yt-scenes', label: yt.nav['yt-scenes'], icon: Clapperboard },
    { id: 'yt-prompts', label: yt.nav['yt-prompts'], icon: Wand2 },
    { id: 'yt-uploads', label: yt.nav['yt-uploads'], icon: ImagePlus },
    { id: 'yt-subtitles', label: yt.nav['yt-subtitles'], icon: Captions },
    { id: 'yt-editor', label: yt.nav['yt-editor'], icon: Film },
    { id: 'yt-production', label: yt.nav['yt-production'], icon: Activity },
    { id: 'yt-export', label: yt.nav['yt-export'], icon: Download },
  ];

  const handleSelect = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#090d16] border-e border-white/[0.08] w-64 shrink-0">
      <div className="flex items-center justify-between h-16 px-5 border-b border-white/[0.08]">
        <button
          type="button"
          onClick={() => handleSelect('studio')}
          className="flex items-center gap-2.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0">
            <AudioWaveform className="w-4 h-4 text-white" />
          </span>
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            {t.brandName}
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto" aria-label="Primary Navigation">
        <div>
          <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {yt.voiceStudioGroup}
          </div>
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    isActive
                      ? 'bg-indigo-500/15 text-white border border-indigo-400/25'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && item.count > 0 && (
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-white/[0.06]">
          <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
            {yt.moduleTitle}
          </div>
          <div className="space-y-0.5">
            {youtubeItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    isActive
                      ? 'bg-indigo-500/15 text-white border border-indigo-400/25'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-white/[0.08]">
        <button
          type="button"
          onClick={() => handleSelect('api-config')}
          className="w-full text-start p-3 rounded-xl border border-white/[0.08] bg-[#0d121f] hover:border-white/15 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            {configStatus?.configured ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-300 truncate">{t.header.apiReady}</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-amber-300 truncate">{t.header.apiRequired}</span>
              </>
            )}
          </div>
          <div className="mt-1.5 text-xs text-slate-400 font-mono tabular-nums truncate">
            {configStatus?.configured
              ? configStatus.maskedKey || '••••••••'
              : t.header.configureApiKey}
          </div>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-screen sticky top-0">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
