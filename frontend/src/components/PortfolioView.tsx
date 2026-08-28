import React, { useState, useMemo } from 'react';
import { 
  Briefcase, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Trash2, 
  PieChart, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownRight, 
  Search, 
  Check 
} from 'lucide-react';
import type { Stock, PortfolioHolding } from '../types';
import { 
  COMPANY_DIRECTORY, 
  formatPrice, 
  formatPercent, 
  formatArticleSentiment 
} from '../lib/utils';

interface PortfolioViewProps {
  watchlist: string[];
  stocksData: Stock[];
  onToggleWatchlist: (ticker: string) => void;
  onSelectStock: (ticker: string) => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  watchlist,
  stocksData,
  onToggleWatchlist,
  onSelectStock,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  // Generate simulated realistic portfolio positions for active watchlist items
  const holdings: PortfolioHolding[] = useMemo(() => {
    return watchlist.map((ticker, index) => {
      const meta = COMPANY_DIRECTORY[ticker] || {
        name: `${ticker} Corp`,
        ticker: ticker,
        sector: "General Equities",
        basePrice: 150,
        currency: ticker.endsWith('.NS') ? 'INR' : 'USD'
      };

      const live = stocksData.find(s => s.ticker === ticker);
      const currentPrice = live ? live.price : meta.basePrice;
      const dayChangePercent = live ? live.changePercent : 0.45;
      const sentimentScore = live ? live.sentimentScore : null;

      // Seed consistent mock share quantities & buy price per index
      const shares = [25, 40, 15, 60, 10, 30, 80, 50][index % 8] || 20;
      const avgCost = currentPrice * (0.88 + (index % 5) * 0.04);
      const marketValue = shares * currentPrice;
      const totalCost = shares * avgCost;
      const totalReturn = marketValue - totalCost;
      const totalReturnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

      return {
        ticker,
        name: meta.name,
        shares,
        avgCost,
        currentPrice,
        marketValue,
        totalReturn,
        totalReturnPercent,
        dayChangePercent,
        allocationPercent: 0,
        sentimentScore,
        currency: meta.currency
      };
    });
  }, [watchlist, stocksData]);

  // Compute allocations
  const totalPortfolioValue = holdings.reduce((acc, h) => acc + h.marketValue, 0);
  const totalTotalReturn = holdings.reduce((acc, h) => acc + h.totalReturn, 0);
  const totalReturnPct = totalPortfolioValue > 0 ? (totalTotalReturn / (totalPortfolioValue - totalTotalReturn)) * 100 : 0;
  const todayPnL = holdings.reduce((acc, h) => acc + (h.marketValue * (h.dayChangePercent / 100)), 0);

  const holdingsWithAllocation = holdings.map(h => ({
    ...h,
    allocationPercent: totalPortfolioValue > 0 ? (h.marketValue / totalPortfolioValue) * 100 : 0
  }));

  // Sector breakdown
  const sectorAllocations = useMemo(() => {
    const map: Record<string, number> = {};
    holdingsWithAllocation.forEach(h => {
      const meta = COMPANY_DIRECTORY[h.ticker];
      const sector = meta ? meta.sector.split('&')[0].trim() : 'Other';
      map[sector] = (map[sector] || 0) + h.marketValue;
    });
    return Object.entries(map).map(([name, val]) => ({
      name,
      value: val,
      percent: totalPortfolioValue > 0 ? (val / totalPortfolioValue) * 100 : 0
    })).sort((a, b) => b.value - a.value);
  }, [holdingsWithAllocation, totalPortfolioValue]);

  const allAvailableTickers = Object.keys(COMPANY_DIRECTORY).filter(t => !['Tesla', 'Apple', 'Google', 'Alphabet', 'Microsoft', 'Nvidia', 'Amazon', 'Intel', 'Meta', 'Reliance Industries', 'Tata Motors', 'Infosys'].includes(t));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Executive Portfolio Metrics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="surface-card p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Portfolio Value</span>
            <Briefcase className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
            {formatPrice(totalPortfolioValue || 125480.00, 'USD')}
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {watchlist.length} Active Positions
          </span>
        </div>

        <div className="surface-card p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Unrealized Gain/Loss</span>
            {totalTotalReturn >= 0 ? <TrendingUp className="w-4 h-4 text-[#00E599]" /> : <TrendingDown className="w-4 h-4 text-[#FF4757]" />}
          </div>
          <div className={`text-2xl font-extrabold font-mono ${totalTotalReturn >= 0 ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
            {totalTotalReturn >= 0 ? '+' : ''}{formatPrice(totalTotalReturn, 'USD')}
          </div>
          <span className={`text-[11px] font-mono font-bold ${totalTotalReturn >= 0 ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
            {formatPercent(totalReturnPct)} All-Time
          </span>
        </div>

        <div className="surface-card p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Today's Movement</span>
            {todayPnL >= 0 ? <ArrowUpRight className="w-4 h-4 text-[#00E599]" /> : <ArrowDownRight className="w-4 h-4 text-[#FF4757]" />}
          </div>
          <div className={`text-2xl font-extrabold font-mono ${todayPnL >= 0 ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
            {todayPnL >= 0 ? '+' : ''}{formatPrice(todayPnL, 'USD')}
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            24h Estimated Delta
          </span>
        </div>

        <div className="surface-card p-5 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Portfolio Health</span>
            <ShieldCheck className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-cyan-500">
            94.8 / 100
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Optimal Sentiment Balance
          </span>
        </div>

      </div>

      {/* 2. Asset Allocation Progress Visualizer */}
      {holdingsWithAllocation.length > 0 && (
        <div className="surface-card p-5 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
              Sector Allocation Distribution
            </span>
            <span className="text-slate-400 font-mono text-[11px]">{sectorAllocations.length} Primary Sectors</span>
          </div>

          <div className="h-2.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex">
            {sectorAllocations.map((sec, idx) => {
              const colors = ['bg-emerald-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'];
              const col = colors[idx % colors.length];
              return (
                <div 
                  key={sec.name}
                  style={{ width: `${sec.percent}%` }}
                  className={`h-full ${col} transition-all duration-500`}
                  title={`${sec.name}: ${sec.percent.toFixed(1)}%`}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            {sectorAllocations.map((sec, idx) => {
              const colors = ['bg-emerald-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'];
              const col = colors[idx % colors.length];
              return (
                <div key={sec.name} className="flex items-center gap-1.5 text-xs font-mono">
                  <span className={`w-2 h-2 rounded-full ${col}`}></span>
                  <span className="text-slate-600 dark:text-slate-300">{sec.name}:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{sec.percent.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Watchlist & Portfolio Holdings Table */}
      <div className="surface-card overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold dark:text-white text-slate-900">
              Active Watchlist & Holdings
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live tracking of your monitored equities with algorithmic sentiment ratings.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Asset</span>
          </button>
        </div>

        {holdingsWithAllocation.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/60 dark:bg-black/20 text-slate-400 dark:text-slate-500 font-mono text-[10px] uppercase">
                  <th className="py-3 px-4 font-semibold">Asset</th>
                  <th className="py-3 px-4 font-semibold">Shares</th>
                  <th className="py-3 px-4 font-semibold">Avg Cost</th>
                  <th className="py-3 px-4 font-semibold">Price</th>
                  <th className="py-3 px-4 font-semibold">Market Value</th>
                  <th className="py-3 px-4 font-semibold">Total P&L</th>
                  <th className="py-3 px-4 font-semibold">Sentiment Signal</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {holdingsWithAllocation.map((h) => {
                  const sentMeta = formatArticleSentiment(h.sentimentScore);
                  const isProfit = h.totalReturn >= 0;

                  return (
                    <tr 
                      key={h.ticker}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => onSelectStock(h.ticker)}
                    >
                      {/* Asset Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/[0.08] flex items-center justify-center font-bold font-mono text-slate-800 dark:text-white text-xs shrink-0">
                            {h.ticker.slice(0, 3)}
                          </div>
                          <div>
                            <div className="font-bold dark:text-white text-slate-900 text-sm flex items-center gap-1.5 group-hover:text-emerald-600 dark:group-hover:text-[#00E599] transition-colors">
                              {h.ticker}
                              <span className="text-[9px] font-mono px-1 rounded bg-slate-100 dark:bg-white/5 text-slate-400">
                                {COMPANY_DIRECTORY[h.ticker]?.exchange || 'US'}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px] block">
                              {h.name}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Shares */}
                      <td className="py-3.5 px-4 font-mono text-slate-800 dark:text-slate-200">
                        {h.shares}
                      </td>

                      {/* Avg Cost */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {formatPrice(h.avgCost, h.currency)}
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {formatPrice(h.currentPrice, h.currency)}
                      </td>

                      {/* Market Value */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {formatPrice(h.marketValue, h.currency)}
                      </td>

                      {/* Total P&L */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono">
                          <div className={`font-bold ${isProfit ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
                            {isProfit ? '+' : ''}{formatPrice(h.totalReturn, h.currency)}
                          </div>
                          <span className={`text-[10px] ${isProfit ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
                            {formatPercent(h.totalReturnPercent)}
                          </span>
                        </div>
                      </td>

                      {/* Sentiment */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${sentMeta.badgeClass}`}>
                            {sentMeta.labelText}
                          </span>
                          <span className={`font-mono text-xs font-bold ${sentMeta.colorClass}`}>
                            {sentMeta.hasScore ? (h.sentimentScore! >= 0 ? `+${h.sentimentScore!.toFixed(2)}` : h.sentimentScore!.toFixed(2)) : '--'}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onToggleWatchlist(h.ticker)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          title="Remove from Watchlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center space-y-3">
            <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Your Watchlist is Empty
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Add stocks from the Market Screener or click the button below to start monitoring real-time sentiment.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary mx-auto text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Asset</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Add Asset Search Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="surface-card w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold dark:text-white text-slate-900">
                Add Asset to Watchlist
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ESC
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="Search by symbol or name..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                autoFocus
              />
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {allAvailableTickers
                .filter(t => {
                  const m = COMPANY_DIRECTORY[t];
                  const q = modalSearch.toLowerCase();
                  return t.toLowerCase().includes(q) || m?.name.toLowerCase().includes(q);
                })
                .map((ticker) => {
                  const meta = COMPANY_DIRECTORY[ticker];
                  const isAdded = watchlist.includes(ticker);
                  return (
                    <div
                      key={ticker}
                      onClick={() => onToggleWatchlist(ticker)}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="font-bold text-xs dark:text-white text-slate-900 flex items-center gap-2">
                          {ticker}
                          <span className="text-[10px] text-slate-400 font-normal">{meta?.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{meta?.sector}</span>
                      </div>
                      <button className={`p-1.5 rounded-lg text-xs font-bold ${
                        isAdded 
                          ? 'bg-emerald-500/20 text-[#00E599]' 
                          : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                      }`}>
                        {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              onClick={() => setShowAddModal(false)}
              className="w-full btn-secondary text-xs py-2"
            >
              Done
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
