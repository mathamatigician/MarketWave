import React from 'react';
import { 
  LayoutGrid, 
  Globe, 
  TrendingUp, 
  Bookmark, 
  Cpu, 
  Newspaper, 
  BarChart2, 
  Bell, 
  LogOut, 
  Crown,
  PanelLeftClose,
  PanelLeftOpen,
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
  isCollapsed = false,
  onToggleCollapse,
}) => {

  const navSections: {
    id: string;
    title: string;
    items: {
      id: MainNavTab;
      label: string;
      icon: React.FC<any>;
      badge?: string | number;
      isAI?: boolean;
    }[];
  }[] = [
    {
      id: 'overview',
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      ]
    },
    {
      id: 'markets',
      title: 'MARKETS',
      items: [
        { id: 'markets', label: 'Markets', icon: Globe },
        { id: 'stocks', label: 'Terminal', icon: TrendingUp },
        { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
      ]
    },
    {
      id: 'intelligence',
      title: 'INTELLIGENCE',
      items: [
        { id: 'intelligence', label: 'Intelligence', icon: Cpu, isAI: true },
        { id: 'news', label: 'News Feed', icon: Newspaper },
        { id: 'analytics', label: 'Analytics', icon: BarChart2 },
      ]
    },
    {
      id: 'monitoring',
      title: 'MONITORING',
      items: [
        { id: 'alerts', label: 'Alerts', icon: Bell, badge: alertCount > 0 ? alertCount : undefined },
        ...(FEATURES.feedback ? [{ id: 'feedback' as MainNavTab, label: 'Feedback', icon: MessageSquare }] : [])
      ]
    }
  ];

  return (
    <aside 
      className={`h-full flex flex-col justify-between bg-white dark:bg-[#0A0D14] border-r border-slate-200/90 dark:border-white/[0.06] select-none transition-all duration-200 ${
        isCollapsed ? 'w-16' : 'w-[220px]'
      }`}
    >
      
      {/* 1. Brand Area */}
      <div className="h-14 px-3.5 flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.05] shrink-0">
        <button 
          onClick={() => onSelectTab('dashboard')} 
          className="flex items-center gap-2.5 text-left group overflow-hidden focus:outline-none"
          title="MarketWave Terminal"
        >
          <div className="w-7 h-7 rounded-md overflow-hidden flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <img src="/favicon.svg" alt="MarketWave" className="w-full h-full object-contain" />
          </div>

          {!isCollapsed && (
            <div className="overflow-hidden">
              <div className="text-xs font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight flex items-center gap-1">
                <span>MarketWave</span>
                <span className="text-[10px] font-mono font-black text-emerald-600 dark:text-[#00E599]">AI</span>
              </div>
              <span className="text-[9px] font-mono tracking-wider text-slate-400 dark:text-slate-500 uppercase block">
                Market Terminal
              </span>
            </div>
          )}
        </button>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* 2. Structured Grouped Navigation */}
      <div className="flex-1 py-3 px-2 space-y-4 overflow-y-auto no-scrollbar">
        {navSections.map((section) => (
          <div key={section.id} className="space-y-0.5">
            
            {/* Subtle Section Label */}
            {!isCollapsed && (
              <div className="px-2.5 pb-1 text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 font-semibold">
                {section.title}
              </div>
            )}

            {/* Navigation Items */}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-all duration-150 relative group ${
                      isActive
                        ? 'bg-slate-100/90 dark:bg-white/[0.06] text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.03] font-normal'
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    {/* Left Active Accent Indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-emerald-500 dark:bg-[#00E599] rounded-r" />
                    )}

                    <div className={`flex items-center ${isCollapsed ? 'mx-auto justify-center' : 'gap-2.5'}`}>
                      <Icon 
                        className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                          isActive 
                            ? 'text-emerald-600 dark:text-[#00E599]' 
                            : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                        }`} 
                        strokeWidth={1.75}
                      />
                      
                      {!isCollapsed && (
                        <span className="truncate tracking-tight flex items-center gap-1.5">
                          {item.label}
                          {item.isAI && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 dark:bg-[#00E599]/90 inline-block" title="AI-Assisted Feed" />
                          )}
                        </span>
                      )}
                    </div>

                    {/* Subtle Count Badge for Alerts */}
                    {!isCollapsed && item.badge !== undefined && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                        {item.badge}
                      </span>
                    )}

                    {/* Hover Tooltip when Collapsed */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white dark:bg-[#141A24] text-[11px] font-mono rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-white/10">
                        {item.label} {item.badge !== undefined ? `(${item.badge})` : ''}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

          </div>
        ))}
      </div>

      {/* 3. Refined Bottom Account Profile Area */}
      <div className="p-2 border-t border-slate-200/80 dark:border-white/[0.05] bg-slate-50/50 dark:bg-black/20 shrink-0 space-y-1.5">
        
        {/* Tier Status Pill */}
        {FEATURES.pricing && !isCollapsed && (
          <button
            onClick={onOpenPricing}
            className="w-full flex items-center justify-between px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 transition-colors text-[10px] font-mono font-bold"
          >
            <span className="flex items-center gap-1.5">
              <Crown className="w-3 h-3" />
              <span>{user?.subscription?.badge || 'PRO TIER'}</span>
            </span>
            <span className="text-[9px] uppercase tracking-wider text-amber-500/70">Plan</span>
          </button>
        )}

        {/* User Card */}
        <div className={`flex items-center justify-between p-1 rounded-md ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-md bg-slate-200 dark:bg-white/10 flex items-center justify-center shrink-0 font-bold font-mono text-slate-700 dark:text-slate-300 text-xs">
              {user?.first_name ? user.first_name[0].toUpperCase() : 'A'}
            </div>

            {!isCollapsed && (
              <div className="overflow-hidden">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate leading-tight">
                  {user ? (user.first_name || user.email.split('@')[0]) : 'Analyst'}
                </div>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block truncate">
                  {user ? user.email : 'demo1@marketwave.com'}
                </span>
              </div>
            )}
          </div>

          {!isCollapsed && user && (
            <button
              onClick={onLogout}
              className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
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
