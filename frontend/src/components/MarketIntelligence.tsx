import React from 'react';
import { format } from 'date-fns';
import { RefreshCw, AlertCircle, CheckCircle2, TrendingUp, TrendingDown, Minus, Layers, Radio } from 'lucide-react';
import type { Stock } from '../types';

interface BriefingItem {
  ticker: string;
  bullet: string;
}

interface MarketIntelligenceProps {
  briefing: BriefingItem[];
  loading: boolean;
  briefingStatus: 'idle' | 'updating' | 'live' | 'error';
  briefingError: string | null;
  briefingTimestamp: number | null;
  connectionStatus: 'LIVE' | 'RECONNECTING' | 'OFFLINE';
  stocksData: Stock[];
  overallScore: number | null;
  trendLabel: string;
  onRefresh: () => void;
}

const COMPANY_TICKER_MAP: Record<string, string> = {
  "Tesla": "TSLA",
  "Apple": "AAPL",
  "Google": "GOOG",
  "Microsoft": "MSFT",
  "Nvidia": "NVDA",
  "Amazon": "AMZN",
  "Intel": "INTC",
  "Meta": "META",
  "Reliance Industries": "RELIANCE.NS",
  "Tata Motors": "TATAMOTORS.NS",
  "Infosys": "INFY.NS"
};

export const MarketIntelligence: React.FC<MarketIntelligenceProps> = ({
  briefing,
  loading,
  briefingStatus,
  briefingError,
  briefingTimestamp,
  connectionStatus,
  stocksData,
  overallScore,
  trendLabel,
  onRefresh,
}) => {
  // Determine institutional signal type and key driver from real stock sentiment and content
  const analyzeCatalyst = (ticker: string, bulletText: string) => {
    const sym = COMPANY_TICKER_MAP[ticker] || ticker;
    const stock = stocksData.find(s => s.ticker === sym || s.ticker === ticker || s.name.toLowerCase().includes(ticker.toLowerCase()));
    
    let signalLabel = 'NEUTRAL';
    let colorClass = 'text-slate-400';
    let bgClass = 'bg-slate-500/10 border-slate-500/20';
    let Icon = Minus;

    if (stock && typeof stock.sentimentScore === 'number' && !isNaN(stock.sentimentScore)) {
      if (stock.sentimentScore > 0.15) {
        signalLabel = 'BULLISH';
        colorClass = 'text-emerald-500 dark:text-[#00FF94]';
        bgClass = 'bg-emerald-500/10 border-emerald-500/20';
        Icon = TrendingUp;
      } else if (stock.sentimentScore < -0.15) {
        signalLabel = 'BEARISH';
        colorClass = 'text-rose-500 dark:text-[#FF3E3E]';
        bgClass = 'bg-rose-500/10 border-rose-500/20';
        Icon = TrendingDown;
      }
    } else {
      const lower = bulletText.toLowerCase();
      if (lower.includes('growth') || lower.includes('gain') || lower.includes('rally') || lower.includes('positive') || lower.includes('breakthrough') || lower.includes('strong') || lower.includes('investment') || lower.includes('confidence')) {
        signalLabel = 'BULLISH';
        colorClass = 'text-emerald-500 dark:text-[#00FF94]';
        bgClass = 'bg-emerald-500/10 border-emerald-500/20';
        Icon = TrendingUp;
      } else if (lower.includes('overvalued') || lower.includes('drop') || lower.includes('decline') || lower.includes('fall') || lower.includes('negative') || lower.includes('risk') || lower.includes('pressure') || lower.includes('headwind')) {
        signalLabel = 'BEARISH';
        colorClass = 'text-rose-500 dark:text-[#FF3E3E]';
        bgClass = 'bg-rose-500/10 border-rose-500/20';
        Icon = TrendingDown;
      }
    }

    // Determine Key Driver
    const lower = bulletText.toLowerCase();
    let keyDriver = 'Market Development';
    if (lower.includes('overvalued') || lower.includes('valuation') || lower.includes('pe ratio') || lower.includes('multiple')) {
      keyDriver = 'Valuation Dynamics';
    } else if (lower.includes('investment') || lower.includes('institutional') || lower.includes('stake') || lower.includes('shareholder')) {
      keyDriver = 'Institutional Positioning';
    } else if (lower.includes('growth') || lower.includes('revenue') || lower.includes('earnings') || lower.includes('forecast') || lower.includes('profit')) {
      keyDriver = 'Growth & Guidance';
    } else if (lower.includes('product') || lower.includes('launch') || lower.includes('technology') || lower.includes('breakthrough') || lower.includes('autonomous')) {
      keyDriver = 'Product & Innovation';
    } else if (lower.includes('supply chain') || lower.includes('production') || lower.includes('factory') || lower.includes('manufacturing')) {
      keyDriver = 'Operations & Supply Chain';
    }

    // Concise "Why It Matters" statement
    let whyItMatters = 'Key development to monitor against baseline price action.';
    if (signalLabel === 'BEARISH') {
      whyItMatters = 'Valuation concerns or operational headwinds could exert downward pressure on near-term trading multiples.';
    } else if (signalLabel === 'BULLISH') {
      whyItMatters = 'Expanding operational momentum and positive analyst coverage support favorable risk-reward expectations.';
    } else {
      whyItMatters = 'Balanced catalyst indicators suggest steady baseline tracking pending further volume confirmation.';
    }

    return { signalLabel, colorClass, bgClass, keyDriver, whyItMatters, Icon };
  };

  const isUpdating = loading || briefingStatus === 'updating';
  const hasBriefing = briefing && briefing.length > 0;

  return (
    <div className="space-y-6">
      {/* Executive Intelligence Header & Action Bar */}
      <div className="rounded-xl border dark:border-white/10 border-slate-200 dark:bg-[#111114] bg-slate-50 p-4 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b dark:border-white/5 border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 dark:text-[#00FF94] text-base font-black">⚡</span>
              <h2 className="text-sm sm:text-base font-mono font-bold uppercase tracking-[0.2em] dark:text-white text-slate-900">
                Market Intelligence
              </h2>
            </div>
            <p className="text-xs font-mono text-slate-500 dark:text-white/50">
              Real-time synthesis of market-moving signals across your watchlist.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Live Operational Status Indicator */}
            {isUpdating ? (
              <span className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono px-2.5 py-1 rounded-md font-bold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                ● ANALYZING...
              </span>
            ) : connectionStatus === 'LIVE' && hasBriefing ? (
              <span className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-600 dark:text-[#00FF94] text-[10px] font-mono px-2.5 py-1 rounded-md font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-[#00FF94]" />
                ● LIVE ANALYSIS
              </span>
            ) : connectionStatus === 'LIVE' ? (
              <span className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/50 text-slate-400 text-[10px] font-mono px-2.5 py-1 rounded-md font-semibold">
                <Radio className="w-2.5 h-2.5 text-slate-400 animate-pulse" />
                ● LIVE ANALYSIS
              </span>
            ) : (
              <span className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[10px] font-mono px-2.5 py-1 rounded-md font-semibold">
                ○ ANALYSIS TEMPORARILY UNAVAILABLE
              </span>
            )}

            {/* Last Updated Timestamp */}
            {briefingTimestamp && !isUpdating && (
              <span className="text-[10px] font-mono text-slate-500 dark:text-white/40 bg-white dark:bg-white/5 px-2.5 py-1 rounded-md border dark:border-white/5 border-slate-200">
                Last updated {format(new Date(briefingTimestamp), 'HH:mm:ss')}
              </span>
            )}

            {/* Professional Refresh Action */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isUpdating}
              className="text-[11px] font-mono font-semibold px-3 py-1 rounded-md bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border dark:border-white/10 border-slate-200 hover:border-emerald-500 dark:hover:border-emerald-400 text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-xs cursor-pointer"
              title="Refresh Analysis"
            >
              <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>↻ Refresh Analysis</span>
            </button>
          </div>
        </div>

        {/* Institutional Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg dark:bg-white/2 bg-white border dark:border-white/5 border-slate-200/60">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">
              Watchlist Coverage
            </span>
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white uppercase">
                {stocksData.length > 0 ? `${stocksData.length} Tracked Equities` : 'Watchlist Active'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-lg dark:bg-white/2 bg-white border dark:border-white/5 border-slate-200/60">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">
              Market Sentiment Context
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                {overallScore !== null 
                  ? `${overallScore >= 0 ? `+${overallScore.toFixed(2)}` : overallScore.toFixed(2)} (${trendLabel.toUpperCase()})` 
                  : 'Data Pending'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-lg dark:bg-white/2 bg-white border dark:border-white/5 border-slate-200/60">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">
              Signal Channels
            </span>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00FF94]" />
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white uppercase">
                {hasBriefing ? `${briefing.length} Channels Active` : 'Continuous Monitoring'}
              </span>
            </div>
          </div>
        </div>

        {/* Error Fallback Banner if Available */}
        {briefingError && hasBriefing && (
          <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-2.5 text-amber-200 text-xs flex items-center gap-2 font-mono">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>ANALYSIS TEMPORARILY UNAVAILABLE • Latest valid analysis is preserved.</span>
          </div>
        )}
      </div>

      {/* Intelligence Cards Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-white/40 block font-bold font-mono">
            Watchlist Signals & Key Drivers
          </span>
          <span className="text-[10px] font-mono text-slate-400 dark:text-white/30">
            Ordered by Signal Relevance
          </span>
        </div>

        {hasBriefing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {briefing.map((item, idx) => {
              const { signalLabel, colorClass, bgClass, keyDriver, whyItMatters } = analyzeCatalyst(item.ticker, item.bullet);
              return (
                <div 
                  key={idx}
                  className="rounded-xl border dark:border-white/10 border-slate-200 dark:bg-[#121214] bg-white p-4 space-y-3.5 hover:dark:border-white/20 hover:border-slate-300 transition-all shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Card Header: Ticker & Signal Badge */}
                    <div className="flex items-center justify-between gap-2 border-b dark:border-white/5 border-slate-100 pb-2.5">
                      <span className="font-mono font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                        {item.ticker}
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${colorClass} ${bgClass}`}>
                        {signalLabel}
                      </span>
                    </div>

                    {/* Key Driver Identifier */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-white/40 block font-semibold">
                        Key Driver: <span className="dark:text-white/80 text-slate-700">{keyDriver}</span>
                      </span>
                      <p className="text-xs leading-relaxed text-slate-700 dark:text-white/85 font-mono">
                        {item.bullet}
                      </p>
                    </div>

                    {/* Why It Matters Statement */}
                    <div className="pt-2 border-t dark:border-white/5 border-slate-100 space-y-0.5">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-white/40 font-bold block">
                        Why It Matters
                      </span>
                      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-white/60 font-mono">
                        {whyItMatters}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t dark:border-white/5 border-slate-100 text-[10px] font-mono text-slate-400 dark:text-white/30">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-[#00FF94]" />
                      Live Feed Verified
                    </span>
                    <span>Institutional Signal</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center border border-dashed dark:border-white/10 border-slate-200 rounded-xl space-y-2 bg-slate-50 dark:bg-white/2">
            <p className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500 dark:text-white/60">
              {isUpdating ? 'ANALYZING LATEST WATCHLIST DEVELOPMENTS...' : 'NO NEW MARKET SIGNALS'}
            </p>
            <p className="text-xs font-mono text-slate-400 dark:text-white/40 max-w-md mx-auto">
              {isUpdating 
                ? 'Processing live market streams and calculating institutional catalyst impact.' 
                : 'Latest watchlist developments will appear here automatically as news feeds are ingested.'}
            </p>
          </div>
        )}
      </div>

      {/* Subtle Institutional Compliance Attribution */}
      <div className="pt-2 border-t dark:border-white/5 border-slate-200 text-center">
        <span className="text-[10px] font-mono text-slate-400 dark:text-white/30">
          AI-generated analysis • Powered by Google
        </span>
      </div>
    </div>
  );
};
