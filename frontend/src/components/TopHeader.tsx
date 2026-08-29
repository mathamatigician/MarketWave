import React from 'react';
import { 
  Search, 
  Sun, 
  Moon, 
  Bell, 
  RefreshCw, 
  Play, 
  Menu, 
  ChevronRight
} from 'lucide-react';
import type { MainNavTab } from '../types';

interface TopHeaderProps {
  currentTab: MainNavTab;
  selectedTicker?: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  alertCount: number;
  onOpenAlerts: () => void;
  onOpenSearch: () => void;
  onTriggerIngest: () => void;
  isIngesting: boolean;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  connectionStatus: 'LIVE' | 'RECONNECTING' | 'OFFLINE';
  lastSyncTimestamp: number | null;
  onToggleMobileMenu?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentTab,
  selectedTicker,
  theme,
  onToggleTheme,
  alertCount,
  onOpenAlerts,
  onOpenSearch,
  onTriggerIngest,
  isIngesting,
  onManualRefresh,
  isRefreshing,
  connectionStatus,
  lastSyncTimestamp,
  onToggleMobileMenu,
}) => {
  const getTabLabel = (tab: MainNavTab): string => {
    switch (tab) {
      case 'dashboard': return 'Command Center';
      case 'markets': return 'Global Markets Screener';
      case 'stocks': return selectedTicker ? `${selectedTicker} Terminal` : 'Stock Terminal';
      case 'watchlist': return 'Watchlist & Holdings';
      case 'intelligence': return 'Gemma AI Briefing';
      case 'news': return 'Verified News Stream';
      case 'analytics': return '18-Factor Topic Analytics';
      case 'alerts': return 'Watchdog Alert Hub';
      case 'feedback': return 'Community Reviews';
      default: return 'MarketWave Terminal';
    }
  };

  const formatSyncTime = (ts: number | null) => {
    if (!ts) return '--:--:--';
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <header className="h-14 w-full bg-white/90 dark:bg-[#090C13]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-white/[0.06] px-4 flex items-center justify-between gap-4 transition-colors z-20">
      
      {/* 1. Left: Mobile Toggle & Dynamic Breadcrumbs */}
      <div className="flex items-center gap-3 shrink-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 rounded-lg btn-secondary"
            aria-label="Toggle Navigation"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
          <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-wider text-slate-400">MarketWave</span>
          <ChevronRight className="hidden sm:inline w-3 h-3 text-slate-400" />
          <span className="font-bold text-slate-900 dark:text-white text-sm">
            {getTabLabel(currentTab)}
          </span>
        </div>
      </div>

      {/* 2. Center: Prominent Global Search Field */}
      <div className="flex-1 max-w-xl mx-auto px-2">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-xl surface-inset text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs transition-all border border-slate-200/80 dark:border-white/[0.08] shadow-sm group cursor-pointer"
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
            <span className="truncate text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
              Search stocks, companies, sectors, markets...
            </span>
          </div>
          <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-white/10 shrink-0">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* 3. Right: Essential Actions & Telemetry */}
      <div className="flex items-center gap-2 shrink-0">
        
        {/* Live Feed Pill */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-lg surface-inset text-[10px] font-mono text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              connectionStatus === 'LIVE' 
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(0,229,153,0.5)]' 
                : connectionStatus === 'RECONNECTING' 
                  ? 'bg-amber-500 animate-ping' 
                  : 'bg-rose-500'
            }`}></span>
            <span className="font-bold uppercase text-slate-700 dark:text-slate-300">
              {connectionStatus === 'LIVE' ? 'FEED LIVE' : connectionStatus}
            </span>
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span>{formatSyncTime(lastSyncTimestamp)}</span>
        </div>

        {/* Instant Ingest Action */}
        <button
          onClick={onTriggerIngest}
          disabled={isIngesting}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            isIngesting
              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30 cursor-wait'
              : 'surface-inset hover:border-emerald-500/30 text-emerald-600 dark:text-[#00E599]'
          }`}
          title="Trigger Real-Time News Ingestion"
        >
          <Play className={`w-3 h-3 fill-current ${isIngesting ? 'animate-spin' : ''}`} />
          <span className="text-[11px] font-mono font-bold">{isIngesting ? 'Ingesting...' : 'Ingest News'}</span>
        </button>

        {/* Manual Refresh */}
        <button
          onClick={onManualRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg btn-secondary text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          title="Refresh Consistency Cache"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
        </button>

        {/* Notifications / Alerts Trigger */}
        <button
          onClick={onOpenAlerts}
          className="p-2 rounded-lg btn-secondary relative text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          title="Watchdog Alerts"
        >
          <Bell className="w-3.5 h-3.5" />
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-mono text-[9px] font-extrabold flex items-center justify-center animate-pulse">
              {alertCount}
            </span>
          )}
        </button>

        {/* Theme Toggle */}
        <button 
          onClick={onToggleTheme} 
          className="p-2 rounded-lg btn-secondary"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
        </button>

      </div>

    </header>
  );
};
