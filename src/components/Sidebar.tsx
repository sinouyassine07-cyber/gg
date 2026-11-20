import {
  AudioWaveform,
  CheckCircle2,
  History,
  KeyRound,
  Library,
  Mic,
  Settings,
  Star,
  AlertCircle,
  X,
} from 'lucide-react';
import type { TranslationDictionary } from '../i18n/translations';
import type { ApiConfigStatus, NavSection } from '../types';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  configStatus: ApiConfigStatus | null;
  historyCount: number;
  favoritesCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
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
  t,
}: SidebarProps) {
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
    { id: 'settings', label: t.nav.settings, icon: Settings },
    { id: 'api-config', label: t.nav.apiConfig, icon: KeyRound },
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

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
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
