import { useState, useMemo, useEffect } from 'react';
import type { Stock } from '../types';
import { getSentimentColor, formatPrice } from '../lib/utils';
import { TrendingUp, Star, X, Play, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config';

interface SectorHeatmapProps {
  heatmapData: any[];
  watchlist?: string[];
  selectedTicker?: string;
  onSelectTicker?: (ticker: string) => void;
}

export function SectorHeatmap({ 
  heatmapData, 
  watchlist = [], 
  selectedTicker = 'ALL', 
  onSelectTicker 
}: SectorHeatmapProps) {
  // /api/sentiment/heatmap returns one row per topic, already aggregated:
  //   { "Sentiment Topic": "Product launches", "Sentiment Score": 0.7, "N": 4 }
  // Topics with no scored articles come back with a null score and are dropped.
  // "Overall sentiment" is the cross-topic aggregate rather than a topic of its
  // own, so it is excluded from the per-topic breakdown.
  const topicDistributions = useMemo(() => {
    if (!heatmapData || heatmapData.length === 0) return [];

    return heatmapData
      .filter(row =>
        row
        && row['Sentiment Topic']
        && row['Sentiment Topic'] !== 'Overall sentiment'
        && typeof row['Sentiment Score'] === 'number'
      )
      .map(row => ({
        name: row['Sentiment Topic'] as string,
        score: row['Sentiment Score'] as number,
        count: typeof row['N'] === 'number' ? row['N'] : 0,
      }))
      .sort((a, b) => b.score - a.score);
  }, [heatmapData]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <label className="text-[11px] uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 block">
          Topic Distribution
        </label>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase dark:text-white/40 text-slate-500">Filter:</span>
          <select
            disabled={watchlist.length === 0}
            value={selectedTicker}
            onChange={(e) => onSelectTicker?.(e.target.value)}
            className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg border dark:border-white/10 border-slate-200 dark:bg-[#121214] bg-white dark:text-white text-slate-900 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {watchlist.length === 0 ? (
              <option value="ALL">No Watchlist Items</option>
            ) : (
              <>
                <option value="ALL">All Watchlist Items ({watchlist.length})</option>
                {watchlist.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>
      
      {watchlist.length === 0 ? (
        <div className="p-8 text-center border border-dashed dark:border-white/10 border-slate-200 rounded-xl my-4">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-400 dark:text-white/40">No Watchlist Items</p>
          <p className="text-xs text-slate-500 dark:text-white/30 mt-1.5">Add tickers to your watchlist to view topic sentiment distributions.</p>
        </div>
      ) : topicDistributions.length === 0 ? (
        <div className="p-8 text-center border border-dashed dark:border-white/10 border-slate-200 rounded-xl my-4">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-400 dark:text-white/40">No Topic Sentiment Yet</p>
          <p className="text-xs text-slate-500 dark:text-white/30 mt-1.5">
            {selectedTicker === 'ALL'
              ? 'Ingest news for your watchlist to build the topic breakdown.'
              : `No scored articles for ${selectedTicker} yet.`}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {topicDistributions.map((topic) => {
            const score = topic.score;
            // Map -1.0 to 1.0 into 0% to 100% width
            const barWidthPct = Math.round((score + 1) * 50);
            const formattedScore = score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
            
            return (
              <div key={topic.name} className="group cursor-default">
                <div className="flex justify-between mb-2 items-baseline">
                  <span className="text-sm font-bold uppercase dark:text-white text-slate-900 group-hover:text-emerald-500 transition-colors">
                    {topic.name}
                  </span>
                  <span className={`font-mono text-sm font-bold ${getSentimentColor(score)}`}>
                    {formattedScore}
                  </span>
                </div>
                <div className="w-full dark:bg-white/10 bg-slate-200 h-1">
                  <div 
                    className={`h-full ${getSentimentColor(score, 'bg')}`}
                    style={{ width: `${barWidthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-12">
        <label className="text-[11px] uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-4">Trending Signal</label>
        <div className="p-5 dark:bg-white bg-slate-900 dark:text-black text-white rounded-lg shadow-md transition-colors">
          <p className="text-xs font-bold leading-relaxed uppercase">
            Algorithmic detection indicates heightened institutional activity in top performing sectors.
          </p>
          <div className="mt-4 flex justify-between items-center border-t dark:border-black/10 border-white/10 pt-3">
            <span className="text-[10px] font-black tracking-widest uppercase opacity-70">System Alert</span>
            <span className="text-[10px] font-mono opacity-70">LIVE SYNC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TopStocksProps {
  email: string;
  watchlist: string[];
  stocksData: Stock[];
  alerts: any[];
  onWatchlistChange: (newWatchlist: string[]) => void;
  onSelectStock?: (stock: Stock) => void;
  onRunPipeline: () => void;
  pipelineRunning: boolean;
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

export function TopStocks({ 
  email,
  watchlist, 
  stocksData, 
  alerts,
  onWatchlistChange, 
  onSelectStock,
  onRunPipeline,
  pipelineRunning
}: TopStocksProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'watchlist' | 'bullish'>('watchlist');
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customTicker, setCustomTicker] = useState('');
  const [isEditingWatchlist, setIsEditingWatchlist] = useState(false);
  const [allOptions, setAllOptions] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);

  useEffect(() => {
    if (isEditingWatchlist && email) {
      fetch(`${API_URL}/api/watchlist?email=${encodeURIComponent(email)}`)
        .then(res => res.json())
        .then(data => {
          setAllOptions(data.all_options || []);
          setSelectedTickers(watchlist);
        })
        .catch(err => console.error("Error loading watchlist options", err));
    }
  }, [isEditingWatchlist, email, watchlist]);

  // Handle Watchlist Star Toggle via callback
  const toggleWatchlist = (ticker: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const upperTicker = ticker.toUpperCase().trim();
    if (watchlist.includes(upperTicker)) {
      onWatchlistChange(watchlist.filter(t => t !== upperTicker));
    } else {
      onWatchlistChange([...watchlist, upperTicker]);
    }
  };

  // Add custom ticker via callback
  const handleAddCustomStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTicker) return;
    const tickerUpper = customTicker.toUpperCase().trim();
    if (!watchlist.includes(tickerUpper)) {
      onWatchlistChange([...watchlist, tickerUpper]);
    }
    setIsAddingCustom(false);
    setCustomTicker('');
  };

  // Filter & Search computation
  const filteredStocks = useMemo(() => {
    return stocksData.filter(stock => {
      // 1. Filter by Tab
      if (activeTab === 'watchlist' && !watchlist.includes(stock.ticker)) {
        return false;
      }
      if (activeTab === 'bullish' && stock.sentimentScore < 0.15) {
        return false;
      }

      // 2. Filter by Search Query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        return (
          stock.ticker.toLowerCase().includes(query) ||
          stock.name.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [stocksData, watchlist, activeTab, searchQuery]);

  return (
    <div className="flex flex-col mt-4">
      {/* Active Alerts Banner */}
      {alerts && alerts.length > 0 && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl flex items-start gap-3 animate-pulse">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-extrabold uppercase tracking-widest block mb-1">Watchdog Notification</span>
            <span className="font-mono">{alerts[0].message} (Score: {alerts[0].average_sentiment})</span>
          </div>
        </div>
      )}

      {/* Search & Action Controls */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono tracking-widest text-slate-400 dark:text-white/40">Watchlist Directory</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 dark:text-white/80 text-slate-700">
              {watchlist.length} tracked
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Run Scraper Pipeline Button */}
            <button 
              onClick={onRunPipeline}
              disabled={pipelineRunning}
              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 border dark:border-white/10 border-slate-200 hover:border-emerald-500 hover:text-emerald-500 dark:hover:border-emerald-500 dark:hover:text-emerald-500 transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <Play className={`w-3 h-3 ${pipelineRunning ? 'animate-pulse text-emerald-500' : ''}`} />
              <span>{pipelineRunning ? 'Ingesting...' : 'Ingest News'}</span>
            </button>

            {/* Add Custom Ticker */}
            <button 
              onClick={() => setIsAddingCustom(!isAddingCustom)}
              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg border dark:border-white/10 border-slate-200 hover:border-emerald-500 hover:text-emerald-500 dark:hover:border-emerald-500 dark:hover:text-emerald-500 transition-all flex items-center gap-1 shrink-0"
            >
              <span>+ Add Ticker</span>
            </button>

            {/* Manage Watchlist Checklist */}
            <button 
              onClick={() => setIsEditingWatchlist(true)}
              className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg border dark:border-white/10 border-slate-200 hover:border-emerald-500 hover:text-emerald-500 dark:hover:border-emerald-500 dark:hover:text-emerald-500 transition-all flex items-center gap-1.5 shrink-0"
            >
              <span>⚙️ Manage</span>
            </button>
          </div>
        </div>

        {/* Custom Ticker Form */}
        {isAddingCustom && (
          <form onSubmit={handleAddCustomStock} className="p-4 rounded-xl border dark:border-white/10 border-slate-200 bg-slate-50 dark:bg-white/2 animate-in slide-in-from-top duration-300 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-white/80">Add to Watchlist</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input 
                type="text" 
                placeholder="Ticker (e.g. AMD, COIN, LLY)"
                value={customTicker}
                onChange={e => setCustomTicker(e.target.value)}
                maxLength={10}
                required
                className="px-3 py-2 text-sm rounded bg-white dark:bg-[#121214] border dark:border-white/10 border-slate-200 focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-500 uppercase"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button 
                type="button" 
                onClick={() => setIsAddingCustom(false)}
                className="px-3 py-1.5 text-xs rounded border dark:border-white/5 border-slate-200 text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="px-3 py-1.5 text-xs font-semibold rounded bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                Start Tracking
              </button>
            </div>
          </form>
        )}

        {/* Search Input */}
        <div className="relative w-full">
          <input 
            type="text"
            placeholder="Search watchlist by ticker symbol or name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border dark:border-white/10 border-slate-200 dark:bg-[#0E0E10] bg-white dark:text-white text-slate-900 placeholder-slate-400 dark:placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-500 transition-all"
          />
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 dark:text-white/40 text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white transition-colors"
              title="Clear Search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters Tabs Row */}
        <div className="flex border-b dark:border-white/10 border-slate-200 gap-4 sm:gap-6 overflow-x-auto shrink-0 pb-1 scrollbar-none">
          <button 
            type="button"
            onClick={() => setActiveTab('watchlist')}
            className={`pb-3 text-xs uppercase tracking-widest font-black transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'watchlist' ? 'border-emerald-500 dark:border-[#00FF94] dark:text-white text-slate-950' : 'border-transparent text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60'}`}
          >
            <span>My Watchlist</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full dark:bg-amber-400/10 bg-amber-500/10 dark:text-amber-300 text-amber-600 font-bold">
              {watchlist.length}
            </span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('all')}
            className={`pb-3 text-xs uppercase tracking-widest font-black transition-all border-b-2 whitespace-nowrap ${activeTab === 'all' ? 'border-emerald-500 dark:border-[#00FF94] dark:text-white text-slate-950' : 'border-transparent text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60'}`}
          >
            All Equities
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('bullish')}
            className={`pb-3 text-xs uppercase tracking-widest font-black transition-all border-b-2 flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'bullish' ? 'border-emerald-500 dark:border-[#00FF94] dark:text-white text-slate-950' : 'border-transparent text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60'}`}
          >
            <span>Bullish Trends (&gt;0.15)</span>
          </button>
        </div>
      </div>

      {/* Table Listing */}
      <div className="w-full overflow-hidden rounded-xl border dark:border-white/10 border-slate-200 dark:bg-[#0E0E10]/40 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="dark:text-white/40 text-slate-500 border-b dark:border-white/10 border-slate-200 text-[10px] uppercase tracking-widest dark:bg-white/5 bg-slate-50">
                <th className="p-4 font-bold text-left w-12">Watch</th>
                <th className="p-4 font-bold text-left">Ticker</th>
                <th className="p-4 font-bold text-right">Price</th>
                <th className="p-4 font-bold text-right">24h Change</th>
                <th className="p-4 font-bold text-right">Sentiment Score</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-white/10 divide-slate-200">
              {filteredStocks.map((stock) => {
                const isPositive = stock.changePercent >= 0;
                const isFavorited = watchlist.includes(stock.ticker);
                const score = stock.sentimentScore;
                const formattedScore = score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
                
                return (
                  <tr 
                    key={stock.ticker} 
                    onClick={() => onSelectStock?.(stock)}
                    className="group hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    {/* Watch / Star Column */}
                    <td className="p-4 w-12" onClick={(e) => toggleWatchlist(stock.ticker, e)}>
                      <button 
                        type="button"
                        className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        title={isFavorited ? "Remove from watchlist" : "Add to watchlist"}
                      >
                        <Star className={`w-4 h-4 transition-all ${isFavorited ? 'fill-amber-400 text-amber-400 scale-110' : 'dark:text-white/20 text-slate-300 group-hover:text-amber-400'}`} />
                      </button>
                    </td>

                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="font-extrabold italic text-base leading-none dark:text-white text-slate-900 group-hover:text-emerald-500 transition-colors">
                            {stock.ticker}
                          </span>
                          <span className="text-[10px] uppercase tracking-widest dark:text-white/40 text-slate-500 mt-1.5 font-medium truncate max-w-[120px] sm:max-w-none">
                            {stock.name}
                          </span>
                        </div>
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1 hidden sm:block" />
                      </div>
                    </td>

                    <td className="p-4 text-right font-mono font-bold dark:text-white/90 text-slate-800">
                      {formatPrice(stock.price, stock.currency)}
                    </td>

                    <td className="p-4 text-right">
                      <div className={`inline-flex items-center justify-end font-mono text-[12px] font-semibold ${isPositive ? 'text-emerald-500 dark:text-[#00FF94]' : 'text-rose-500 dark:text-[#FF3E3E]'}`}>
                        {isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </div>
                    </td>

                    <td className="p-4 text-right">
                      <span className={`inline-flex items-center justify-center font-mono text-[12px] font-bold px-2 py-0.5 rounded-md ${getSentimentColor(score)} dark:bg-white/5 bg-black/5`}>
                        {formattedScore}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Empty state */}
              {filteredStocks.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Star className="w-8 h-8 text-slate-300 dark:text-white/20 animate-pulse" />
                      <div>
                        <p className="font-mono text-xs uppercase tracking-widest text-slate-500 dark:text-white/40">No Equities Found</p>
                        <p className="text-xs text-slate-400 dark:text-white/20 mt-1 max-w-md mx-auto">
                          {activeTab === 'watchlist' 
                            ? "Your watchlist is empty. Search for tickers above and star them to track their sentiment!" 
                            : "No equities matched your active filters or search input."}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isEditingWatchlist && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300 text-slate-200 flex flex-col gap-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white uppercase tracking-tight italic">Manage Watchlist</h3>
                <p className="text-xs text-slate-400 mt-1">Select the companies you want to track on your active dashboard.</p>
              </div>
            </div>
            
            <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2">
              {allOptions.map((ticker) => {
                const isChecked = selectedTickers.includes(ticker);
                return (
                  <label 
                    key={ticker} 
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      isChecked 
                        ? 'bg-blue-600/10 border-blue-500/50 text-white' 
                        : 'border-slate-800 hover:bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedTickers(selectedTickers.filter(t => t !== ticker));
                          } else {
                            setSelectedTickers([...selectedTickers, ticker]);
                          }
                        }}
                        className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="text-sm font-semibold uppercase">{ticker}</span>
                    </div>
                    <span className="text-[10px] font-mono dark:text-white/40 text-slate-500">
                      {COMPANY_TICKER_MAP[ticker] || ticker}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
              <button 
                type="button"
                onClick={() => setIsEditingWatchlist(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => {
                  onWatchlistChange(selectedTickers);
                  setIsEditingWatchlist(false);
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-[#00FF94] hover:bg-[#00e082] text-black shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
