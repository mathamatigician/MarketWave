import { getSentimentColor } from '../lib/utils';
import type { Stock } from '../types';

interface OverallSentimentProps {
  overallScore: number;
  trendLabel: string;
  watchlistStocks: Stock[];
}

export function OverallSentiment({ overallScore, trendLabel, watchlistStocks }: OverallSentimentProps) {
  // Format overall score as a signed string (e.g. +0.45 or -0.12)
  const formattedScore = overallScore >= 0 
    ? `+${overallScore.toFixed(2)}` 
    : overallScore.toFixed(2);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <label className="text-[11px] uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-4">Current Market Mood</label>
        <div className="flex flex-wrap items-baseline gap-4">
          <h2 className="text-6xl sm:text-7xl md:text-8xl font-black leading-[0.8] tracking-[-0.05em] italic dark:text-white text-slate-950">
            {formattedScore}
          </h2>
          <div className="flex flex-col">
            <span className={`text-2xl md:text-3xl font-black italic uppercase leading-none ${getSentimentColor(overallScore)}`}>
              {trendLabel}
            </span>
            <span className="text-[11px] font-mono dark:text-white/40 text-slate-500 mt-2 uppercase">
              Confidence: {Math.abs(overallScore) > 0.4 ? 'High' : 'Medium'}
            </span>
          </div>
        </div>
      </div>

      <div className="dark:bg-white/5 bg-slate-50 border dark:border-white/10 border-slate-200 p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-end mb-6">
          <div className="text-[11px] uppercase tracking-widest dark:text-white/60 text-slate-600 font-bold italic">Watchlist Sentiment Levels</div>
          <div className="text-[11px] font-mono dark:text-white/40 text-slate-500 uppercase">Range: -1.0 to +1.0</div>
        </div>
        
        {watchlistStocks.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-slate-400 font-mono text-xs">
            No tickers in watchlist.
          </div>
        ) : (
          <div className="h-32 w-full flex items-end gap-3 pt-2">
            {watchlistStocks.map((stock) => {
              const score = stock.sentimentScore;
              // Map -1.0 to 1.0 into 0% to 100% height (abs height from center or just relative height)
              // For a clean presentation, let's render standard bars where height is percentage of absolute score:
              const barHeightPct = Math.max(10, Math.round(Math.abs(score) * 100));
              
              return (
                <div key={stock.ticker} className="flex-1 flex flex-col justify-end h-full group relative items-center">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 dark:bg-slate-900 bg-slate-800 text-white text-[10px] font-mono p-2 rounded whitespace-nowrap shadow-md">
                    {stock.name}: {score >= 0 ? '+' : ''}{score.toFixed(2)}
                  </div>
                  
                  {/* Bar */}
                  <div 
                    className={`w-full ${getSentimentColor(score, 'bg')} rounded-t-sm transition-all duration-700 ease-out hover:opacity-85`} 
                    style={{ height: `${barHeightPct}%` }}
                  />
                  
                  {/* Label */}
                  <span className="text-[9px] font-mono text-center block mt-2 dark:text-white/60 text-slate-700 font-bold uppercase truncate max-w-full">
                    {stock.ticker}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
