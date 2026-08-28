import React from 'react';
import { 
  LayoutDashboard, 
  Globe2, 
  Eye, 
  Briefcase, 
  Sparkles, 
  Newspaper, 
  BarChart3, 
  Bell, 
  TrendingUp, 
  LogOut, 
  Crown,
  Activity,
  ChevronRight,
  User as UserIcon,
  MessageSquare
} from 'lucide-react';
import type { MainNavTab } from '../types';
import { FEATURES } from '../config';

interface SidebarNavProps {
  currentTab: MainNavTab;
  onSelectTab: (tab: MainNavTab) => void;
  alertCount: number;
  user: any;
  onLogout: () => void;
  onOpenPricing: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentTab,
  onSelectTab,
  alertCount,
  user,
  onLogout,
  onOpenPricing,
}) => {
  const mainNavItems: { id: MainNavTab; label: string; icon: React.FC<any>; badge?: string | number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'markets', label: 'Markets', icon: Globe2 },
    { id: 'stocks', label: 'Terminal', icon: TrendingUp },
    { id: 'watchlist', label: 'Watchlist', icon: Eye },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'intelligence', label: 'Intelligence', icon: Sparkles, badge: 'AI' },
    { id: 'news', label: 'News Feed', icon: Newspaper },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const bottomNavItems: { id: MainNavTab; label: string; icon: React.FC<any>; badge?: string | number }[] = [
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alertCount > 0 ? alertCount : undefined },
  ];

  if (FEATURES.feedback) {
    bottomNavItems.push({ id: 'feedback', label: 'Feedback', icon: MessageSquare });
  }

  return (
    <aside className="w-56 h-full flex flex-col justify-between bg-white dark:bg-[#090C13] border-r border-slate-200/80 dark:border-white/[0.06] select-none transition-colors duration-200">
      
      {/* 1. Brand Logo Header */}
      <div className="p-4 pb-3 border-b border-slate-200/60 dark:border-white/[0.04]">
        <button 
          onClick={() => onSelectTab('dashboard')} 
          className="flex items-center gap-2.5 group text-left w-full focus:outline-none"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 dark:from-[#00E599] dark:to-[#00B8FF] p-0.5 shadow-sm group-hover:scale-105 transition-transform flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center">
              <Activity className="w-4 h-4 text-[#00E599]" />
            </div>
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-tight dark:text-white text-slate-900 leading-none flex items-center gap-1">
              MarketWave<span className="text-emerald-500 dark:text-[#00E599] font-black">AI</span>
            </div>
            <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400 dark:text-slate-500 block mt-0.5">
              Market Terminal
            </span>
          </div>
        </button>
      </div>

      {/* 2. Main Navigation List */}
      <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto no-scrollbar">
        <div className="px-3 pb-1 text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 font-bold">
          Workspace
        </div>

        {mainNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 group ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-[#141A24] dark:text-[#00E599] dark:border dark:border-[#00E599]/30 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive 
                    ? 'text-emerald-400 dark:text-[#00E599]' 
                    : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                }`} />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
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

        {/* Section Divider */}
        <div className="pt-4 px-3 pb-1 text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 font-bold">
          System & Watchdog
        </div>

        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 group ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-[#141A24] dark:text-[#00E599] dark:border dark:border-[#00E599]/30 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                  isActive 
                    ? 'text-emerald-400 dark:text-[#00E599]' 
                    : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                }`} />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Bottom User Profile & Tier Card */}
      <div className="p-3 border-t border-slate-200/60 dark:border-white/[0.04] space-y-2 bg-slate-50/50 dark:bg-black/20">
        {FEATURES.pricing && (
          <button
            onClick={onOpenPricing}
            className="w-full flex items-center justify-between p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 transition-all text-xs font-mono font-bold"
          >
            <span className="flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5" />
              <span>{user?.subscription?.badge || 'PRO TIER'}</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="flex items-center justify-between p-1.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10 flex items-center justify-center shrink-0 text-slate-700 dark:text-slate-200">
              <UserIcon className="w-3.5 h-3.5" />
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {user ? (user.first_name || user.email.split('@')[0]) : 'Guest Analyst'}
              </div>
              <span className="text-[9px] font-mono text-emerald-600 dark:text-[#00E599] block truncate">
                {user ? user.email : 'Read-Only Mode'}
              </span>
            </div>
          </div>

          {user && (
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

    </aside>
  );
};
