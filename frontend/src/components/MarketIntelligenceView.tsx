import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Clock, 
  ExternalLink, 
  Newspaper,
  Globe
} from 'lucide-react';
import type { Stock, ArticleItem, BriefingItem } from '../types';
import { 
  COMPANY_TICKER_MAP, 
  formatArticleSentiment,
  getArticleSentimentScore 
} from '../lib/utils';
import { format } from 'date-fns';

interface MarketIntelligenceViewProps {
  briefing: BriefingItem[];
  loadingBriefing: boolean;
  briefingStatus: 'idle' | 'updating' | 'live' | 'error';
  briefingError: string | null;
  briefingTimestamp: number | null;
  onRefreshBriefing: () => void;
  stocksData: Stock[];
  watchlist: string[];
  recentArticles: ArticleItem[];
  onSelectStock: (ticker: string) => void;
}

export const MarketIntelligenceView: React.FC<MarketIntelligenceViewProps> = ({
  briefing,
  loadingBriefing,
  briefingTimestamp,
  onRefreshBriefing,
  stocksData,
  watchlist,
  recentArticles,
  onSelectStock,
}) => {
  const [newsFilter, setNewsFilter] = useState<'ALL' | 'HIGH' | 'BULLISH' | 'BEARISH'>('ALL');
  const [selectedNewsTicker, setSelectedNewsTicker] = useState<string>('ALL');

  // Analyze catalyst driver and sentiment direction for each briefing bullet
  const analyzedBriefings = useMemo(() => {
    return briefing.map(item => {
      const sym = COMPANY_TICKER_MAP[item.ticker] || item.ticker;
      const stock = stocksData.find(s => s.ticker === sym || s.ticker === item.ticker);
      
      let signalLabel = 'NEUTRAL';
      let colorClass = 'text-slate-400';
      let badgeClass = 'badge-neutral';
      let Icon = Minus;

      if (stock && typeof stock.sentimentScore === 'number' && !isNaN(stock.sentimentScore)) {
        if (stock.sentimentScore > 0.15) {
          signalLabel = 'BULLISH';
          colorClass = 'text-emerald-500 dark:text-[#00E599]';
          badgeClass = 'badge-bullish';
          Icon = TrendingUp;
        } else if (stock.sentimentScore < -0.15) {
          signalLabel = 'BEARISH';
          colorClass = 'text-rose-500 dark:text-[#FF4757]';
          badgeClass = 'badge-bearish';
          Icon = TrendingDown;
        }
      } else {
        const lower = item.bullet.toLowerCase();
        if (lower.includes('growth') || lower.includes('gain') || lower.includes('rally') || lower.includes('positive') || lower.includes('breakthrough') || lower.includes('strong')) {
          signalLabel = 'BULLISH';
          colorClass = 'text-emerald-500 dark:text-[#00E599]';
          badgeClass = 'badge-bullish';
          Icon = TrendingUp;
        } else if (lower.includes('overvalued') || lower.includes('drop') || lower.includes('decline') || lower.includes('fall') || lower.includes('risk') || lower.includes('headwind')) {
          signalLabel = 'BEARISH';
          colorClass = 'text-rose-500 dark:text-[#FF4757]';
          badgeClass = 'badge-bearish';
          Icon = TrendingDown;
        }
      }

      // Determine Key Driver
      const lower = item.bullet.toLowerCase();
      let keyDriver = 'Market Operations';
      if (lower.includes('valuation') || lower.includes('pe ratio') || lower.includes('multiple') || lower.includes('overvalued')) {
        keyDriver = 'Valuation Dynamics';
      } else if (lower.includes('investment') || lower.includes('institutional') || lower.includes('stake') || lower.includes('fund')) {
        keyDriver = 'Institutional Flows';
      } else if (lower.includes('growth') || lower.includes('revenue') || lower.includes('earnings') || lower.includes('profit')) {
        keyDriver = 'Growth & Guidance';
      } else if (lower.includes('product') || lower.includes('launch') || lower.includes('technology') || lower.includes('ai') || lower.includes('autonomous')) {
        keyDriver = 'Product & Innovation';
      }

      return {
        ticker: item.ticker,
        bullet: item.bullet,
        sym,
        signalLabel,
        colorClass,
        badgeClass,
        Icon,
        keyDriver
      };
    });
  }, [briefing, stocksData]);

  // Filter news articles
  const filteredArticles = useMemo(() => {
    return recentArticles.filter(art => {
      if (selectedNewsTicker !== 'ALL' && !art.content.toLowerCase().includes(selectedNewsTicker.toLowerCase())) {
        return false;
      }
      const score = getArticleSentimentScore(art.sentiment);
      if (newsFilter === 'HIGH' && Math.abs(score || 0) < 0.3) return false;
      if (newsFilter === 'BULLISH' && (score === null || score <= 0.15)) return false;
      if (newsFilter === 'BEARISH' && (score === null || score >= -0.15)) return false;
      return true;
    });
  }, [recentArticles, selectedNewsTicker, newsFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Executive AI Briefing Section Banner */}
      <div className="surface-card p-6 space-y-4 border-l-4 border-l-emerald-500 dark:border-l-[#00E599]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500 dark:text-[#00E599]" />
              <h2 className="text-xl font-bold dark:text-white text-slate-900 tracking-tight">
                Market Intelligence Flash Synthesis
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Real-time multi-agent aggregation synthesizing earnings, macro news, and price catalysts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {briefingTimestamp && (
              <span className="text-[11px] font-mono text-slate-400">
                Synthesized {format(new Date(briefingTimestamp), 'HH:mm:ss')}
              </span>
            )}
            <button
              onClick={onRefreshBriefing}
              disabled={loadingBriefing}
              className="btn-primary text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBriefing ? 'animate-spin' : ''}`} />
              <span>{loadingBriefing ? 'Synthesizing...' : 'Regenerate Briefing'}</span>
            </button>
          </div>
        </div>

        {/* Intelligence Cards Grid */}
        {analyzedBriefings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {analyzedBriefings.map((b, idx) => {
              const Icon = b.Icon;
              return (
                <div 
                  key={idx}
                  onClick={() => onSelectStock(b.sym)}
                  className="surface-inset p-4 rounded-xl hover:border-slate-300 dark:hover:border-white/10 transition-all cursor-pointer space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-[#00E599] transition-colors">
                        {b.ticker}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-200 dark:bg-white/10 text-slate-500">
                        {b.keyDriver}
                      </span>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${b.badgeClass} flex items-center gap-1`}>
                      <Icon className="w-3 h-3" />
                      <span>{b.signalLabel}</span>
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-3 leading-relaxed">
                    {b.bullet}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-200/50 dark:border-white/[0.04]">
                    <span>Source: Verified RSS / Finnhub</span>
                    <span className="text-emerald-600 dark:text-[#00E599] group-hover:underline">Deep Analysis →</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-slate-400">
            {loadingBriefing ? 'Generating real-time market synthesis...' : 'No active watchlist news to synthesize yet. Click Ingest News to populate.'}
          </div>
        )}
      </div>

      {/* 2. Editorial News Feed Section */}
      <div className="surface-card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold dark:text-white text-slate-900 flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-cyan-500" />
              Verified Financial News Stream
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live algorithmic triage with impact levels and 18-factor sentiment scoring.
            </p>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedNewsTicker}
              onChange={(e) => setSelectedNewsTicker(e.target.value)}
              className="text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121214] text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">All Watchlist Tickers</option>
              {watchlist.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <div className="flex items-center gap-1 surface-inset p-1 rounded-lg text-xs font-mono">
              {(['ALL', 'HIGH', 'BULLISH', 'BEARISH'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setNewsFilter(tab)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                    newsFilter === tab 
                      ? 'bg-white dark:bg-[#141A24] text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Articles List */}
        <div className="space-y-3">
          {filteredArticles.length > 0 ? (
            filteredArticles.map((art, idx) => {
              const score = getArticleSentimentScore(art.sentiment);
              const sentMeta = formatArticleSentiment(score);

              return (
                <div 
                  key={idx} 
                  className="surface-inset p-4 rounded-xl hover:border-slate-300 dark:hover:border-white/10 transition-all space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${sentMeta.badgeClass}`}>
                        {sentMeta.labelText}
                      </span>
                      <span className={`font-mono text-xs font-bold ${sentMeta.colorClass}`}>
                        {sentMeta.hasScore ? (score! >= 0 ? `+${score!.toFixed(2)}` : score!.toFixed(2)) : '--'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {art.date || 'Recent'}
                      </span>
                      {art.url && (
                        <a 
                          href={art.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-emerald-600 dark:text-[#00E599] hover:underline flex items-center gap-1"
                        >
                          <span>Full Article</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-normal">
                    {art.content}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="py-16 text-center text-xs text-slate-400 space-y-2">
              <Globe className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
              <p>No news articles match the selected filter criteria.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
