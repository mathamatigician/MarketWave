import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Trash2, 
  ShieldAlert, 
  Clock 
} from 'lucide-react';
import type { AlertItem } from '../types';
import { formatArticleSentiment } from '../lib/utils';
import { format } from 'date-fns';

interface AlertsViewProps {
  alerts: any[];
  watchlist: string[];
  onSelectStock: (ticker: string) => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  watchlist,
  onSelectStock,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');
  const [localAlerts, setLocalAlerts] = useState<any[]>(alerts);

  // Normalize alerts from Firestore or local data
  const normalizedAlerts: AlertItem[] = (localAlerts.length > 0 ? localAlerts : alerts).map((a, idx) => {
    const sentiment = typeof a.sentiment === 'number' ? a.sentiment : -0.8;
    const ticker = a.ticker || 'TSLA';
    const isCritical = sentiment < -0.5;

    return {
      id: a.id || `alert-${idx}`,
      ticker,
      type: isCritical ? 'CRITICAL_DROP' : 'HIGH_VOLATILITY',
      title: a.title || `${ticker} Critical Sentiment Drop`,
      message: a.message || a.reason || `Algorithmic sentiment for ${ticker} collapsed below critical threshold to ${sentiment.toFixed(2)}.`,
      sentiment,
      timestamp: a.timestamp || Date.now() - idx * 3600000,
      isRead: false
    };
  });

  const filtered = normalizedAlerts.filter(a => {
    if (filterSeverity === 'CRITICAL' && a.sentiment >= -0.5) return false;
    if (filterSeverity === 'WARNING' && (a.sentiment < -0.5 || a.sentiment > 0)) return false;
    return true;
  });

  const handleClearAll = () => {
    setLocalAlerts([]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Banner & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 surface-card p-6 border-l-4 border-l-rose-500">
        <div>
          <h2 className="text-xl font-bold dark:text-white text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            Watchdog Market Alert Hub
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Automated anomaly detection watching for rapid sentiment collapses (&lt; -0.50) and institutional volatility.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button
              onClick={handleClearAll}
              className="btn-secondary text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Dismiss All</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 surface-inset p-1 rounded-xl text-xs font-mono">
          {(['ALL', 'CRITICAL', 'WARNING'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterSeverity(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterSeverity === tab 
                  ? 'bg-white dark:bg-[#141A24] text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab} ({normalizedAlerts.filter(a => tab === 'ALL' ? true : tab === 'CRITICAL' ? a.sentiment < -0.5 : a.sentiment >= -0.5).length})
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400 font-mono">
          Monitoring {watchlist.length} Tickers
        </span>
      </div>

      {/* Alerts Feed */}
      <div className="space-y-3">
        {filtered.length > 0 ? (
          filtered.map((item) => {
            const isCritical = item.sentiment < -0.5;
            const sentMeta = formatArticleSentiment(item.sentiment);

            return (
              <div
                key={item.id}
                onClick={() => onSelectStock(item.ticker)}
                className={`surface-card p-5 hover:border-slate-300 dark:hover:border-white/20 transition-all cursor-pointer space-y-2 border-l-4 ${
                  isCritical ? 'border-l-rose-500' : 'border-l-amber-500'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-sm dark:text-white text-slate-900 font-mono">
                      {item.ticker}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isCritical ? 'bg-rose-500/15 text-rose-600 dark:text-[#FF4757] border border-rose-500/30' : 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                    }`}>
                      {isCritical ? 'CRITICAL SENTIMENT COLLAPSE' : 'SENTIMENT ANOMALY'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                    <span className={`font-bold ${sentMeta.colorClass}`}>
                      {item.sentiment >= 0 ? `+${item.sentiment.toFixed(2)}` : item.sentiment.toFixed(2)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(item.timestamp), 'MMM dd, HH:mm')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
                  {item.message}
                </p>

                <div className="pt-2 flex justify-between items-center text-[10px] font-mono border-t border-slate-200/60 dark:border-white/[0.04]">
                  <span className="text-slate-400">Watchdog Rule: Sentiment &lt; -0.50</span>
                  <span className="text-emerald-600 dark:text-[#00E599] hover:underline font-bold">
                    Open {item.ticker} Terminal →
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="surface-card py-16 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 dark:text-[#00E599] mx-auto" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No Active Market Alerts
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              All monitored equities are operating within stable sentiment and volatility bands.
            </p>
          </div>
        )}
      </div>

    </div>
  );
};
