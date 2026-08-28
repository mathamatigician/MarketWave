import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Globe2, 
  TrendingUp, 
  Briefcase, 
  Sparkles, 
  Newspaper, 
  BarChart3, 
  Bell, 
  MessageSquare, 
  Sun, 
  Moon, 
  Crown, 
  LogOut, 
  RefreshCw, 
  Play, 
  Search, 
  Bot, 
  Menu, 
  X,
  Activity,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import type { MainNavTab, MarketIndex } from '../types';
import { FEATURES } from '../config';

interface NavigationProps {
  currentTab: MainNavTab;
  onSelectTab: (tab: MainNavTab) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  user: any;
  onLogout: () => void;
  onOpenPricing: () => void;
  onOpenAgent: () => void;
  onTriggerIngest: () => void;
  isIngesting: boolean;
  connectionStatus: 'LIVE' | 'RECONNECTING' | 'OFFLINE';
  lastSyncTimestamp: number | null;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  alertCount: number;
  onSearchClick: () => void;
}

const GLOBAL_INDICES: MarketIndex[] = [
  { symbol: 'SPX', name: 'S&P 500', value: 5984.20, change: 38.10, changePercent: 0.64, isPositive: true },
  { symbol: 'NDX', name: 'NASDAQ 100', value: 19218.40, change: 175.30, changePercent: 0.92, isPositive: true },
  { symbol: 'DJI', name: 'Dow Jones', value: 43412.10, change: 78.40, changePercent: 0.18, isPositive: true },
  { symbol: 'NIFTY', name: 'Nifty 50', value: 24320.60, change: -45.80, changePercent: -0.19, isPositive: false },
  { symbol: 'VIX', name: 'Volatility', value: 14.82, change: -0.52, changePercent: -3.39, isPositive: true },
  { symbol: 'BTC', name: 'Bitcoin', value: 94820.00, change: 2240.00, changePercent: 2.42, isPositive: true },
];

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  theme,
  onToggleTheme,
  user,
  onLogout,
  onOpenPricing,
  onOpenAgent,
  onTriggerIngest,
  isIngesting,
  connectionStatus,
  lastSyncTimestamp,
  onManualRefresh,
  isRefreshing,
  alertCount,
  onSearchClick
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems: { id: MainNavTab; label: string; icon: React.FC<any>; badge?: string | number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'markets', label: 'Markets', icon: Globe2 },
    { id: 'stocks', label: 'Terminal', icon: TrendingUp },
    { id: 'watchlist', label: 'Portfolio & Watchlist', icon: Briefcase },
    { id: 'intelligence', label: 'Intelligence', icon: Sparkles, badge: 'AI' },
    { id: 'news', label: 'News Feed', icon: Newspaper },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alertCount > 0 ? alertCount : undefined },
  ];

  if (FEATURES.feedback) {
    navItems.push({ id: 'feedback', label: 'Feedback', icon: MessageSquare });
  }

  const formatSyncTime = (ts: number | null) => {
    if (!ts) return '--:--:--';
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <div className="sticky top-0 z-40 w-full bg-white/85 dark:bg-[#07090E]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-white/[0.08] transition-colors">
      
      {/* 1. Global Market Indices Live Ticker Bar */}
      <div className="w-full bg-slate-100/90 dark:bg-black/40 border-b border-slate-200/60 dark:border-white/[0.04] px-4 py-1.5 overflow-x-auto no-scrollbar">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-6 text-[11px] font-mono">
          <div className="flex items-center gap-6 overflow-x-auto shrink-0 no-scrollbar py-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-beacon"></span>
              MARKETS
            </span>
            {GLOBAL_INDICES.map((idx) => (
              <div key={idx.symbol} className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{idx.name}</span>
                <span className="font-bold text-slate-900 dark:text-white">{idx.value.toLocaleString()}</span>
                <span className={`flex items-center text-[10px] font-bold ${idx.changePercent >= 0 ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
                  {idx.changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {idx.changePercent >= 0 ? `+${idx.changePercent.toFixed(2)}%` : `${idx.changePercent.toFixed(2)}%`}
                </span>
              </div>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${
                connectionStatus === 'LIVE' 
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(0,229,153,0.5)]' 
                  : connectionStatus === 'RECONNECTING' 
                    ? 'bg-amber-500 animate-ping' 
                    : 'bg-rose-500'
              }`}></span>
              <span className="font-bold tracking-wider uppercase text-slate-700 dark:text-slate-300">
                {connectionStatus === 'LIVE' ? 'LIVE FEED' : connectionStatus}
              </span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span>SYNC: <strong className="text-slate-700 dark:text-slate-300">{formatSyncTime(lastSyncTimestamp)}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        
        {/* Left: Brand & Search Trigger */}
        <div className="flex items-center gap-5">
          <button 
            onClick={() => onSelectTab('dashboard')} 
            className="flex items-center gap-2.5 group text-left focus:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 dark:from-[#00E599] dark:to-[#00B8FF] p-0.5 shadow-sm group-hover:scale-105 transition-transform flex items-center justify-center">
              <div className="w-full h-full bg-slate-900 rounded-[7px] flex items-center justify-center">
                <Activity className="w-4 h-4 text-[#00E599]" />
              </div>
            </div>
            <div>
              <div className="text-base font-extrabold tracking-tight dark:text-white text-slate-900 leading-none flex items-center gap-1.5">
                MarketWave<span className="text-emerald-500 dark:text-[#00E599] font-black">AI</span>
              </div>
              <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500 block mt-0.5">
                Real-Time Intelligence
              </span>
            </div>
          </button>

          {/* Quick Search Bar */}
          <button
            onClick={onSearchClick}
            className="hidden xl:flex items-center gap-2.5 px-3 py-1.5 rounded-lg surface-inset text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs w-64 justify-between transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Search stocks, sectors, news...</span>
            </span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Center: Desktop Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.03] p-1 rounded-xl border border-slate-200/60 dark:border-white/[0.05]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 relative ${
                  isActive 
                    ? 'bg-white dark:bg-[#141A24] text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-white/[0.12]' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-500 dark:text-[#00E599]' : ''}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                    item.badge === 'AI' 
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-black' 
                      : 'bg-rose-500 text-white'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Actions, AI Copilot, Theme, User Menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Mobile Search Button */}
          <button
            onClick={onSearchClick}
            className="xl:hidden p-2 rounded-lg btn-secondary"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Instant Ingest Trigger */}
          <button
            onClick={onTriggerIngest}
            disabled={isIngesting}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              isIngesting
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30 cursor-wait'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-[#00E599] border border-emerald-500/20'
            }`}
            title="Trigger Live News Scraping & Sentiment Ingestion"
          >
            <Play className={`w-3 h-3 fill-current ${isIngesting ? 'animate-spin' : ''}`} />
            <span>{isIngesting ? 'Ingesting...' : 'Ingest News'}</span>
          </button>

          {/* AI Copilot Trigger */}
          <button
            onClick={onOpenAgent}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/15 to-cyan-500/15 hover:from-emerald-500/25 hover:to-cyan-500/25 border border-emerald-500/30 text-emerald-700 dark:text-[#00E599] font-bold text-xs shadow-sm transition-all active:scale-95"
            title="Open Antigravity AI Financial Copilot"
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden md:inline">AI Copilot</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-beacon"></span>
          </button>

          {/* Manual Refresh */}
          <button
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg btn-secondary"
            title="Refresh All Market Signals (5-min Consistency)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
          </button>

          {/* Theme Toggle */}
          <button 
            onClick={onToggleTheme} 
            className="p-2 rounded-lg btn-secondary"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
          </button>

          {/* Pricing Upgrade */}
          {FEATURES.pricing && (
            <button
              onClick={onOpenPricing}
              className="hidden sm:flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>{user?.subscription?.badge || 'Pro'}</span>
            </button>
          )}

          {/* User Profile / Logout */}
          {user ? (
            <div className="flex items-center gap-2 pl-1 border-l border-slate-200 dark:border-white/10">
              <div className="hidden xl:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[110px]">
                  {user.first_name || user.email.split('@')[0]}
                </span>
                <span className="text-[9px] font-mono text-emerald-600 dark:text-[#00E599] uppercase font-bold">
                  {user.subscription?.badge || 'STARTER'}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="lg:hidden p-2 rounded-lg btn-secondary"
            aria-label="Toggle menu"
          >
            {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 3. Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden border-t border-slate-200 dark:border-white/[0.08] bg-white/95 dark:bg-[#0E121B]/95 backdrop-blur-xl px-4 py-4 space-y-2 animate-in slide-in-from-top-2 duration-200 shadow-2xl">
          <div className="grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive 
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#00E599] border border-emerald-500/30' 
                      : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
            <button
              onClick={() => {
                onTriggerIngest();
                setMobileNavOpen(false);
              }}
              disabled={isIngesting}
              className="flex-1 mr-2 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-[#00E599] border border-emerald-500/20 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{isIngesting ? 'Ingesting...' : 'Ingest News'}</span>
            </button>
            {FEATURES.pricing && (
              <button
                onClick={() => {
                  onOpenPricing();
                  setMobileNavOpen(false);
                }}
                className="py-2 px-4 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-bold flex items-center gap-1"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Plans</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
