import React, { useState, useMemo } from 'react';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpDown, 
  Plus, 
  Check, 
  BarChart2,
  Layers
} from 'lucide-react';
import type { Stock } from '../types';
import { 
  COMPANY_DIRECTORY, 
  formatPrice, 
  formatPercent, 
  formatArticleSentiment,
  generateSyntheticSparkline 
} from '../lib/utils';

interface MarketsViewProps {
  stocksData: Stock[];
  watchlist: string[];
  onToggleWatchlist: (ticker: string) => void;
  onSelectStock: (ticker: string) => void;
}

type CategoryFilter = 'ALL' | 'TECH' | 'EV' | 'SEMIS' | 'INDIA';
type SortField = 'ticker' | 'price' | 'changePercent' | 'sentimentScore' | 'marketCap';

export const MarketsView: React.FC<MarketsViewProps> = ({
  stocksData,
  watchlist,
  onToggleWatchlist,
  onSelectStock,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [sortField, setSortField] = useState<SortField>('changePercent');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Build merged catalog combining COMPANY_DIRECTORY with live stock prices & sentiment
  const marketCatalog: Stock[] = useMemo(() => {
    const uniqueTickers = Object.keys(COMPANY_DIRECTORY).filter(t => !['Tesla', 'Apple', 'Google', 'Alphabet', 'Microsoft', 'Nvidia', 'Amazon', 'Intel', 'Meta', 'Reliance Industries', 'Tata Motors', 'Infosys'].includes(t));
    
    return uniqueTickers.map(ticker => {
      const meta = COMPANY_DIRECTORY[ticker];
      const live = stocksData.find(s => s.ticker === ticker);
      const basePrice = live ? live.price : meta.basePrice;
      const changePercent = live ? live.changePercent : 0.85;
      const sentimentScore = live ? live.sentimentScore : null;

      return {
        ticker,
        name: meta.name,
        price: basePrice,
        changePercent: changePercent,
        sentimentScore: sentimentScore,
        currency: meta.currency,
        region: meta.exchange === 'NSE' ? 'IN' : 'US',
        sector: meta.sector,
        marketCap: meta.marketCap,
        peRatio: meta.peRatio,
        high52: meta.high52,
        low52: meta.low52,
        sparkline: generateSyntheticSparkline(basePrice, changePercent)
      };
    });
  }, [stocksData]);

  // Filter and Sort
  const filteredStocks = useMemo(() => {
    return marketCatalog.filter(stock => {
      // Category filter
      if (category === 'TECH' && !stock.sector?.includes('Software') && !stock.sector?.includes('Media') && !stock.sector?.includes('Consumer Electronics')) return false;
      if (category === 'EV' && !stock.sector?.includes('Automotive') && !stock.sector?.includes('Clean Energy')) return false;
      if (category === 'SEMIS' && !stock.sector?.includes('Semiconductor')) return false;
      if (category === 'INDIA' && stock.region !== 'IN') return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return stock.ticker.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q) || stock.sector?.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'marketCap') {
        valA = parseFloat(a.marketCap || '0');
        valB = parseFloat(b.marketCap || '0');
      }

      if (valA === null || valA === undefined) valA = -999999;
      if (valB === null || valB === undefined) valB = -999999;

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [marketCatalog, category, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Header & Metrics Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-card p-5">
        <div>
          <h2 className="text-xl font-bold dark:text-white text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-500 dark:text-[#00E599]" />
            Global Markets Screener
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time equity quotes overlaid with multi-source AI sentiment scoring & volatility indicators.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1.5 rounded-lg surface-inset flex items-center gap-2">
            <span className="text-slate-400">Total Equities:</span>
            <span className="font-bold font-mono dark:text-white text-slate-900">{marketCatalog.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg surface-inset flex items-center gap-2">
            <span className="text-slate-400">Watched:</span>
            <span className="font-bold font-mono text-emerald-600 dark:text-[#00E599]">{watchlist.length}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 surface-inset rounded-xl">
          {[
            { id: 'ALL', label: 'All Equities' },
            { id: 'TECH', label: 'Mega Tech' },
            { id: 'SEMIS', label: 'Semiconductors' },
            { id: 'EV', label: 'Auto & Clean EV' },
            { id: 'INDIA', label: 'NSE (India)' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setCategory(tab.id as CategoryFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                category === tab.id
                  ? 'bg-white dark:bg-[#141A24] text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ticker, company, sector..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-[#0E121B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-sm"
          />
        </div>
      </div>

      {/* Main Stock Screener Table */}
      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/60 dark:bg-black/20 text-slate-400 dark:text-slate-500 font-mono text-[10px] uppercase">
                <th className="py-3 px-4 font-semibold">Asset</th>
                <th 
                  onClick={() => handleSort('price')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                >
                  <span className="flex items-center gap-1">
                    Price
                    <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('changePercent')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                >
                  <span className="flex items-center gap-1">
                    24h Change
                    <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-3 px-4 font-semibold hidden md:table-cell">24h Trend</th>
                <th 
                  onClick={() => handleSort('sentimentScore')}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                >
                  <span className="flex items-center gap-1">
                    AI Sentiment Score
                    <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th 
                  onClick={() => handleSort('marketCap')}
                  className="py-3 px-4 font-semibold hidden lg:table-cell cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                >
                  <span className="flex items-center gap-1">
                    Mkt Cap
                    <ArrowUpDown className="w-3 h-3" />
                  </span>
                </th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {filteredStocks.map((stock) => {
                const isWatched = watchlist.includes(stock.ticker) || watchlist.some(w => COMPANY_DIRECTORY[w]?.ticker === stock.ticker);
                const sentimentMeta = formatArticleSentiment(stock.sentimentScore);
                const isPositive = stock.changePercent >= 0;

                return (
                  <tr 
                    key={stock.ticker}
                    className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => onSelectStock(stock.ticker)}
                  >
                    {/* Ticker & Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/[0.08] flex items-center justify-center font-bold font-mono text-slate-800 dark:text-white text-xs shrink-0">
                          {stock.ticker.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold dark:text-white text-slate-900 text-sm flex items-center gap-1.5 group-hover:text-emerald-600 dark:group-hover:text-[#00E599] transition-colors">
                            {stock.ticker}
                            <span className="text-[9px] font-mono px-1 rounded bg-slate-100 dark:bg-white/5 text-slate-400">
                              {COMPANY_DIRECTORY[stock.ticker]?.exchange || 'US'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px] block">
                            {stock.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {formatPrice(stock.price, stock.currency)}
                    </td>

                    {/* 24h Change */}
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded-md text-xs ${
                        isPositive 
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#00E599] border border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-600 dark:text-[#FF4757] border border-rose-500/20'
                      }`}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {formatPercent(stock.changePercent)}
                      </span>
                    </td>

                    {/* Sparkline mini chart */}
                    <td className="py-3.5 px-4 hidden md:table-cell">
                      <div className="h-6 w-24 flex items-end gap-0.5">
                        {(stock.sparkline || [20, 35, 45, 30, 60, 80]).map((point, idx) => {
                          const min = Math.min(...(stock.sparkline || [20]));
                          const max = Math.max(...(stock.sparkline || [100]));
                          const heightPct = Math.max(15, Math.round(((point - min) / (max - min || 1)) * 100));
                          return (
                            <div
                              key={idx}
                              style={{ height: `${heightPct}%` }}
                              className={`flex-1 rounded-t-xs ${isPositive ? 'bg-emerald-500/60 dark:bg-[#00E599]/60' : 'bg-rose-500/60 dark:bg-[#FF4757]/60'}`}
                            />
                          );
                        })}
                      </div>
                    </td>

                    {/* AI Sentiment Score */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${sentimentMeta.badgeClass}`}>
                          {sentimentMeta.labelText}
                        </span>
                        <span className={`font-mono font-bold text-xs ${sentimentMeta.colorClass}`}>
                          {sentimentMeta.hasScore ? (stock.sentimentScore! >= 0 ? `+${stock.sentimentScore!.toFixed(2)}` : stock.sentimentScore!.toFixed(2)) : '--'}
                        </span>
                      </div>
                    </td>

                    {/* Market Cap */}
                    <td className="py-3.5 px-4 hidden lg:table-cell font-mono text-slate-600 dark:text-slate-400">
                      {stock.marketCap}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onToggleWatchlist(stock.ticker)}
                          className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isWatched
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#00E599] border border-emerald-500/30'
                              : 'hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white'
                          }`}
                          title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                        >
                          {isWatched ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => onSelectStock(stock.ticker)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                          title="Open full terminal view"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredStocks.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500">
                    No matching stocks found for "{searchQuery}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
