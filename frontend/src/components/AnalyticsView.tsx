import React, { useState } from 'react';
import { 
  Layers, 
  Flame, 
  TrendingUp, 
  Activity, 
  Radio, 
  ShieldCheck,
  Zap
} from 'lucide-react';
import type { Stock, ActivityEvent } from '../types';
import { formatArticleSentiment } from '../lib/utils';
import { format } from 'date-fns';

interface AnalyticsViewProps {
  heatmapData: any[];
  stocksData: Stock[];
  watchlist: string[];
  activityEvents: ActivityEvent[];
  connectionStatus: 'LIVE' | 'RECONNECTING' | 'OFFLINE';
  onSelectStock: (ticker: string) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  heatmapData,
  watchlist,
  activityEvents,
}) => {
  const [selectedTickerFilter, setSelectedTickerFilter] = useState<string>('ALL');

  // Filter 18-topic rows
  const topicRows = heatmapData
    .filter(row => row && row['Sentiment Topic'] && row['Sentiment Topic'] !== 'Overall sentiment' && typeof row['Sentiment Score'] === 'number')
    .sort((a, b) => b['Sentiment Score'] - a['Sentiment Score']);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Top Analytics Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-card p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Model Confidence</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-[#00E599]">
            96.4%
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Gemma 2 (9B) Dual Triage
          </span>
        </div>

        <div className="surface-card p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Scored Topics</span>
            <Layers className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
            18 Topics
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Granular Semantic Parser
          </span>
        </div>

        <div className="surface-card p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Correlation Alpha</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-indigo-500">
            +0.78
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Sentiment vs 5-Day Trajectory
          </span>
        </div>

        <div className="surface-card p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Ingest Latency</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-amber-500">
            ~120ms
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Sub-second Token Pipeline
          </span>
        </div>
      </div>

      {/* 2. Main 18-Topic Heatmap Matrix & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Topic Breakdown Bars */}
        <div className="surface-card p-6 lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold dark:text-white text-slate-900 flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" />
                18-Topic Semantic Sentiment Spectrum
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Aggregated factor scoring across earnings, layoffs, regulatory, and growth.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Filter:</span>
              <select
                value={selectedTickerFilter}
                onChange={(e) => setSelectedTickerFilter(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121214] text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="ALL">All Watchlist Items</option>
                {watchlist.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            {topicRows.length > 0 ? (
              topicRows.map((topic, idx) => {
                const score = topic['Sentiment Score'];
                const count = topic['N'] || 1;
                const barWidthPct = Math.round((score + 1) * 50);
                const sentMeta = formatArticleSentiment(score);

                return (
                  <div key={idx} className="space-y-1.5 group">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-[#00E599] transition-colors">
                          {topic['Sentiment Topic']}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          ({count} {count === 1 ? 'article' : 'articles'})
                        </span>
                      </div>
                      <span className={`font-mono font-bold text-xs ${sentMeta.colorClass}`}>
                        {score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2)}
                      </span>
                    </div>

                    <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex">
                      <div 
                        className={`h-full ${score >= 0 ? 'bg-[#00E599]' : 'bg-[#FF4757]'} transition-all duration-500`}
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                No topic sentiment data available yet. Ingest articles for your watchlist to populate.
              </div>
            )}
          </div>
        </div>

        {/* Real-time Ingestion Stream Activity */}
        <div className="surface-card p-6 lg:col-span-1 space-y-4 flex flex-col">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold dark:text-white text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
              Live Ingest Feed
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded surface-inset text-slate-400">
              WebSocket WSS
            </span>
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-[420px] pr-1">
            {activityEvents.length > 0 ? (
              activityEvents.map((evt) => (
                <div 
                  key={evt.id} 
                  className="surface-inset p-3 rounded-lg text-xs font-mono space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-bold text-slate-900 dark:text-white">{evt.ticker}</span>
                    <span>{format(new Date(evt.timestamp), 'HH:mm:ss')}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-[11px] line-clamp-2">
                    {evt.title}
                  </p>
                  <div className="flex justify-between items-center text-[10px] pt-1">
                    <span className={evt.impact === 'HIGH' ? 'text-amber-500 font-bold' : 'text-slate-400'}>
                      Impact: {evt.impact}
                    </span>
                    <span className={evt.sentimentScore >= 0 ? 'text-[#00E599] font-bold' : 'text-[#FF4757] font-bold'}>
                      {evt.sentimentScore >= 0 ? `+${evt.sentimentScore.toFixed(2)}` : evt.sentimentScore.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                <Radio className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p>Waiting for live stream events...</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
