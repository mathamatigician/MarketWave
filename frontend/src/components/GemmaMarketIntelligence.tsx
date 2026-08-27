import React from 'react';
import { format } from 'date-fns';
import { RefreshCw, Sparkles, AlertCircle, Bot, Radio, CheckCircle2, ShieldCheck, Activity } from 'lucide-react';
import type { Stock } from '../types';

interface BriefingItem {
  ticker: string;
  bullet: string;
}

interface GemmaMarketIntelligenceProps {
  briefing: BriefingItem[];
  loading: boolean;
  briefingStatus: 'idle' | 'updating' | 'live' | 'error';
  briefingError: string | null;
  briefingTimestamp: number | null;
  modelName: string;
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

export const GemmaMarketIntelligence: React.FC<GemmaMarketIntelligenceProps> = ({
  briefing,
  loading,
  briefingStatus,
  briefingError,
  briefingTimestamp,
  modelName,
  connectionStatus,
  stocksData,
  overallScore,
  trendLabel,
  onRefresh,
}) => {
  // Helper to determine catalyst signal type from matching stock sentiment score or bullet content
  const getCatalystSignal = (ticker: string, bulletText: string) => {
    const sym = COMPANY_TICKER_MAP[ticker] || ticker;
    const stock = stocksData.find(s => s.ticker === sym || s.ticker === ticker || s.name.toLowerCase().includes(ticker.toLowerCase()));
    
    if (stock && typeof stock.sentimentScore === 'number' && !isNaN(stock.sentimentScore)) {
      if (stock.sentimentScore > 0.15) {
        return { label: 'Bullish Catalyst', colorClass: 'text-emerald-500 dark:text-[#00FF94]', bgClass: 'bg-emerald-500/10 border-emerald-500/20' };
      }
      if (stock.sentimentScore < -0.15) {
        return { label: 'Bearish Catalyst', colorClass: 'text-rose-500 dark:text-[#FF3E3E]', bgClass: 'bg-rose-500/10 border-rose-500/20' };
      }
      return { label: 'Neutral Catalyst', colorClass: 'text-slate-400', bgClass: 'bg-slate-500/10 border-slate-500/20' };
    }

    const lower = bulletText.toLowerCase();
    if (lower.includes('growth') || lower.includes('gain') || lower.includes('rally') || lower.includes('positive') || lower.includes('breakthrough') || lower.includes('strong')) {
      return { label: 'Bullish Catalyst', colorClass: 'text-emerald-500 dark:text-[#00FF94]', bgClass: 'bg-emerald-500/10 border-emerald-500/20' };
    }
    if (lower.includes('overvalued') || lower.includes('drop') || lower.includes('decline') || lower.includes('fall') || lower.includes('negative') || lower.includes('risk') || lower.includes('pressure')) {
      return { label: 'Bearish Catalyst', colorClass: 'text-rose-500 dark:text-[#FF3E3E]', bgClass: 'bg-rose-500/10 border-rose-500/20' };
    }
    return { label: 'Watchlist Catalyst', colorClass: 'text-indigo-400', bgClass: 'bg-indigo-500/10 border-indigo-500/20' };
  };

  const isUpdating = loading || briefingStatus === 'updating';
  const hasBriefing = briefing && briefing.length > 0;

  return (
    <div className="space-y-6">
      {/* Overview Header & Controls Panel */}
      <div className="rounded-xl border dark:border-indigo-500/20 border-indigo-200/60 dark:bg-[#111116] bg-slate-50/60 p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b dark:border-white/5 border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500 dark:text-indigo-400 animate-pulse shrink-0" />
              <h2 className="text-sm sm:text-base font-mono font-bold uppercase tracking-[0.2em] dark:text-white text-slate-900">
                ⚡ Gemma AI Market Intelligence
              </h2>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full dark:bg-indigo-950/60 bg-indigo-100 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                {modelName || 'Google Gemma 3 (12B)'}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-500 dark:text-white/50">
              Real-time executive AI synthesis synthesized across your active watchlist news stream
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Live Synthesis Status Indicator */}
            {isUpdating ? (
              <span className="flex items-center gap-1.5 bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 text-[10px] font-mono px-2.5 py-1 rounded-md font-bold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                ◉ SYNTHESIZING...
              </span>
            ) : connectionStatus === 'LIVE' && hasBriefing ? (
              <span className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-600 dark:text-[#00FF94] text-[10px] font-mono px-2.5 py-1 rounded-md font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-[#00FF94]" />
                ● LIVE SYNTHESIS
              </span>
            ) : connectionStatus === 'LIVE' ? (
              <span className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/50 text-slate-400 text-[10px] font-mono px-2.5 py-1 rounded-md font-semibold">
                <Radio className="w-2.5 h-2.5 text-slate-400 animate-pulse" />
                ● LISTENING FOR SIGNALS
              </span>
            ) : (
              <span className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[10px] font-mono px-2.5 py-1 rounded-md font-semibold">
                ○ TEMPORARILY UNAVAILABLE
              </span>
            )}

            {/* Actual Generation Timestamp */}
            {briefingTimestamp && !isUpdating && (
              <span className="text-[10px] font-mono text-slate-500 dark:text-white/40 bg-white dark:bg-white/5 px-2.5 py-1 rounded-md border dark:border-white/5 border-slate-200">
                Updated: {format(new Date(briefingTimestamp), 'HH:mm:ss')}
              </span>
            )}

            {/* Secondary Refresh Action */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isUpdating}
              className="text-[11px] font-mono font-semibold px-3 py-1 rounded-md bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border dark:border-white/10 border-slate-200 hover:border-indigo-500 dark:hover:border-indigo-400 text-slate-700 dark:text-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              title="Force Refresh Synthesis"
            >
              <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>↻ Refresh Synthesis</span>
            </button>
          </div>
        </div>

        {/* Executive Signal Overview Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg dark:bg-white/2 bg-white border dark:border-white/5 border-slate-200/60">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">
              Active Model Stream
            </span>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                {modelName || 'Google Gemma 3 (12B)'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg dark:bg-white/2 bg-white border dark:border-white/5 border-slate-200/60">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">
              Market Sentiment Context
            </span>
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                {overallScore !== null ? `${overallScore >= 0 ? `+${overallScore.toFixed(2)}` : overallScore.toFixed(2)} (${trendLabel})` : 'Awaiting Ingestion'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg dark:bg-white/2 bg-white border dark:border-white/5 border-slate-200/60">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">
              Catalyst Coverage
            </span>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00FF94]" />
              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                {hasBriefing ? `${briefing.length} Active Equities Synthesized` : '0 Equities Synthesized'}
              </span>
            </div>
          </div>
        </div>

        {/* Contextual Market Mood Alignment */}
        {overallScore !== null && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-500/5 border border-indigo-500/10 text-xs font-mono">
            <span className="font-bold text-indigo-500 dark:text-indigo-400 uppercase shrink-0">AI Interpretation:</span>
            <span className="text-slate-600 dark:text-white/75">
              Watchlist sentiment is currently {trendLabel.toLowerCase()} ({overallScore >= 0 ? `+${overallScore.toFixed(2)}` : overallScore.toFixed(2)}). Neural analysis mapped {hasBriefing ? briefing.length : 0} catalyst channels across live feeds.
            </span>
          </div>
        )}

        {/* Error Fallback Banner if Available */}
        {briefingError && hasBriefing && (
          <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-2.5 text-amber-200 text-xs flex items-center gap-2 font-mono">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>AI SYNTHESIS TEMPORARILY UNAVAILABLE • Showing latest valid synthesis.</span>
          </div>
        )}
      </div>

      {/* Output Cards Grid */}
      <div className="space-y-3">
        <span className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-white/40 block font-bold font-mono">
          Executive Catalyst Breakdown
        </span>

        {hasBriefing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {briefing.map((item, idx) => {
              const signal = getCatalystSignal(item.ticker, item.bullet);
              return (
                <div 
                  key={idx}
                  className="rounded-xl border dark:border-white/10 border-slate-200 dark:bg-[#121214] bg-white p-4 space-y-3 hover:dark:border-indigo-500/40 hover:border-indigo-300 transition-all shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 border-b dark:border-white/5 border-slate-100 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <Bot className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span className="font-mono font-extrabold text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                          {item.ticker}
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${signal.colorClass} ${signal.bgClass}`}>
                        {signal.label}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-600 dark:text-white/80 font-mono">
                      {item.bullet}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t dark:border-white/5 border-slate-100 text-[10px] font-mono text-slate-400 dark:text-white/30">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-[#00FF94]" />
                      Real-time Ingested
                    </span>
                    <span>AI Synthesized</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center border border-dashed dark:border-white/10 border-slate-200 rounded-xl space-y-2 bg-slate-50 dark:bg-white/2">
            <p className="text-xs font-mono font-bold uppercase tracking-widest text-slate-500 dark:text-white/50">
              {isUpdating ? 'Synthesizing latest watchlist news...' : 'NO CURRENT AI SIGNAL'}
            </p>
            <p className="text-xs font-mono text-slate-400 dark:text-white/40 max-w-md mx-auto">
              {isUpdating 
                ? 'Analyzing real-time Firestore article streams and generating institutional synthesis.' 
                : 'Waiting for incoming news articles to synthesize catalysts for your active watchlist.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
