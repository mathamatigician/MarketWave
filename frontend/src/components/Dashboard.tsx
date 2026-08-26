import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Stock } from '../types';
import { OverallSentiment } from './OverallSentiment';
import { SectorHeatmap, TopStocks } from './DataWidgets';
import { StockTrendDetails } from './StockTrendDetails';
import { StockPriceSentimentTab } from './StockPriceSentimentTab';
import { IngestActivity } from './IngestActivity';
import { RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { API_URL } from '../config';

interface DashboardProps {
  email: string;
}

const formatAlertDate = (timestamp: any) => {
  if (!timestamp) return '';
  const num = Number(timestamp);
  if (!isNaN(num) && num > 0) {
    const ms = num < 99999999999 ? num * 1000 : num;
    return new Date(ms).toLocaleString();
  }
  const parsed = Date.parse(timestamp);
  if (!isNaN(parsed)) {
    return new Date(parsed).toLocaleString();
  }
  return String(timestamp);
};

export function Dashboard({ email }: DashboardProps) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [stocksData, setStocksData] = useState<Stock[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  const [dashboardTab, setDashboardTab] = useState<'sentiment' | 'charts'>('sentiment');
  const [selectedChartTicker, setSelectedChartTicker] = useState<string>('');
  const [selectedHeatmapTicker, setSelectedHeatmapTicker] = useState<string>('ALL');

  useEffect(() => {
    if (watchlist.length > 0 && !selectedChartTicker) {
      setSelectedChartTicker(watchlist[0]);
    }
  }, [watchlist, selectedChartTicker]);

  // Dedicated Heatmap Fetcher
  const fetchHeatmap = useCallback(async () => {
    try {
      const hmUrl = selectedHeatmapTicker && selectedHeatmapTicker !== 'ALL'
        ? `${API_URL}/api/sentiment/heatmap?email=${encodeURIComponent(email)}&ticker=${encodeURIComponent(selectedHeatmapTicker)}`
        : `${API_URL}/api/sentiment/heatmap?email=${encodeURIComponent(email)}`;
      const hmRes = await fetch(hmUrl);
      if (hmRes.ok) {
        const hmData = await hmRes.json();
        setHeatmapData(hmData || []);
      }
    } catch (e) {
      console.error("Failed to fetch heatmap", e);
    }
  }, [email, selectedHeatmapTicker]);

  // Fetch watchlist, alerts, heatmap, and Yahoo Finance details
  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // 1. Fetch Watchlist
      const wlRes = await fetch(`${API_URL}/api/watchlist?email=${encodeURIComponent(email)}`);
      if (!wlRes.ok) throw new Error("Failed to load watchlist");
      const wlData = await wlRes.json();
      const wl = wlData.watchlist || [];
      setWatchlist(wl);

      // 2. Fetch Alerts
      const alertsRes = await fetch(`${API_URL}/api/alerts`);
      if (alertsRes.ok) {
        const alData = await alertsRes.json();
        setAlerts(alData || []);
      }

      // 3. Heatmap is owned by its own polling effect (keyed on the selected
      //    ticker), so it is deliberately not fetched here.

      // 4. Fetch Stock history summaries
      const stockSummaries: Stock[] = [];
      for (const ticker of wl) {
        try {
          const res = await fetch(`${API_URL}/api/stock/history?ticker=${encodeURIComponent(ticker)}&period=5d`);
          if (res.ok) {
            const hist = await res.json();
            const prices = hist.price_series || [];
            const sentiments = hist.sentiment_series || [];
            
            let price = 150.0;
            let changePercent = 0.0;
            if (prices.length > 0) {
              const latest = prices[prices.length - 1];
              price = latest.value !== undefined ? latest.value : 150.0;
              
              if (prices.length > 1) {
                const prev = prices[prices.length - 2];
                const prevVal = prev.value || 1.0;
                changePercent = ((price - prevVal) / prevVal) * 100.0;
              }
            }

            let sentimentScore = 0.0;
            if (sentiments.length > 0) {
              const latest = sentiments[sentiments.length - 1];
              const val = latest.value !== undefined ? latest.value : (latest.score || 0.0);
              const isPositive = latest.color ? latest.color.includes('0, 150') : true;
              sentimentScore = isPositive ? (val / 100.0) : -(val / 100.0);
            }

            stockSummaries.push({
              ticker,
              name: `${ticker} Corp.`,
              sentimentScore,
              price,
              changePercent,
              region: ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'IN' : 'US',
              currency: ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'INR' : 'USD'
            });
          }
        } catch (err) {
          console.error("Error fetching summary for " + ticker, err);
        }
      }
      setStocksData(stockSummaries);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Full dashboard polling every 60 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60000);
    return () => clearInterval(interval);
  }, [email]);

  // Heatmap load + 60s poll. Keyed on fetchHeatmap, which is memoized on the
  // selected ticker, so the interval re-binds whenever the filter changes and
  // always refreshes the currently selected ticker.
  useEffect(() => {
    fetchHeatmap();
    const heatmapInterval = setInterval(fetchHeatmap, 60000);
    return () => clearInterval(heatmapInterval);
  }, [fetchHeatmap]);

  // Handle Watchlist Updates (Star / Add Ticker)
  const handleWatchlistChange = async (newWatchlist: string[]) => {
    try {
      const res = await fetch(`${API_URL}/api/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tickers: newWatchlist })
      });
      if (res.ok) {
        fetchData(true);
      }
    } catch (e) {
      console.error("Failed to update watchlist", e);
    }
  };

  // Trigger Pipeline Ingestion for every ticker in this user's watchlist.
  // Sequentially awaited (not concurrent) to keep behavior predictable and
  // avoid bursting Gemini rate limits across a multi-ticker watchlist at
  // once. No more blocking alert() -- the IngestActivity panel now shows
  // real, live progress instead.
  const handleRunPipeline = async () => {
    if (watchlist.length === 0) return;
    try {
      setPipelineRunning(true);
      for (const ticker of watchlist) {
        const res = await fetch(`${API_URL}/api/pipeline/run?ticker=${encodeURIComponent(ticker)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
          console.error(`Pipeline run failed for ${ticker}: HTTP ${res.status}`);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPipelineRunning(false);
    }
  };

  // Compute overall score (average of watchlist sentiments)
  const overallScore = useMemo(() => {
    if (stocksData.length === 0) return 0.0;
    const sum = stocksData.reduce((acc, curr) => acc + curr.sentimentScore, 0);
    return sum / stocksData.length;
  }, [stocksData]);

  // Compute trend label
  const trendLabel = useMemo(() => {
    if (overallScore > 0.4) return 'Strong Bullish';
    if (overallScore > 0.15) return 'Bullish';
    if (overallScore < -0.4) return 'Strong Bearish';
    if (overallScore < -0.15) return 'Bearish';
    return 'Neutral';
  }, [overallScore]);

  if (loading && stocksData.length === 0) {
    return (
      <div className="flex h-[calc(100vh-160px)] items-center justify-center flex-col gap-4 text-slate-400 dark:text-slate-500">
        <img src="/favicon.svg" alt="MarketWave Logo" className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
        <p className="font-mono text-sm uppercase tracking-widest">Accessing Firestore datastore...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Active Alerts Banner */}
      {alerts.length > 0 && alerts.some(alert => watchlist.includes(alert.ticker)) && (
        <div className="space-y-3">
          {alerts
            .filter(alert => watchlist.includes(alert.ticker))
            .map((alert, idx) => (
              <div key={idx} className="bg-red-950/40 border border-red-500/30 rounded-lg p-4 text-rose-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span>
                    <strong>Critical Sentiment Alert:</strong> {alert.ticker} has experienced a negative sentiment drop! (Average Sentiment: {alert.average_sentiment})
                  </span>
                </div>
                {alert.timestamp && (
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                    {formatAlertDate(alert.timestamp)}
                  </span>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <label className="text-[10px] sm:text-[11px] uppercase tracking-[0.3em] sm:tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-1">Market Overview</label>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-[#00FF94] shadow-[0_0_8px_rgba(16,185,129,0.5)] dark:shadow-[0_0_8px_#00FF94]"></div>
            <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest dark:text-white/60 text-slate-600">
              Live Stream (Firestore)
            </span>
          </div>
          <span className="text-[10px] sm:text-[11px] font-mono dark:text-white/40 text-slate-500 uppercase tracking-widest">
            Sync: {format(new Date(), 'HH:mm:ss')}
          </span>
          <button 
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-1 rounded-md dark:text-white text-slate-700 dark:hover:text-[#00FF94] hover:text-emerald-500 transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCcw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs Selection Header */}
      <div className="flex border-b dark:border-white/10 border-slate-200 gap-3 sm:gap-6 mb-6 overflow-x-auto shrink-0 pb-1 scrollbar-none">
        <button 
          onClick={() => setDashboardTab('sentiment')}
          className={`text-[11px] sm:text-xs font-black uppercase tracking-widest pb-3 transition-all whitespace-nowrap ${
            dashboardTab === 'sentiment' 
              ? 'dark:text-white text-slate-900 border-b-2 dark:border-[#00FF94] border-emerald-500 font-bold' 
              : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          📊 Sentiment Analysis
        </button>
        <button 
          onClick={() => setDashboardTab('charts')}
          className={`text-[11px] sm:text-xs font-black uppercase tracking-widest pb-3 transition-all whitespace-nowrap ${
            dashboardTab === 'charts' 
              ? 'dark:text-white text-slate-900 border-b-2 dark:border-[#00FF94] border-emerald-500 font-bold' 
              : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          📈 Stock Price vs Sentiments
        </button>
      </div>

      {/* Main Content Areas based on Tab selection */}
      {dashboardTab === 'sentiment' ? (
        <div className="grid grid-cols-12 gap-6 lg:gap-8 animate-in fade-in duration-300">
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-6 sm:gap-8">
            <OverallSentiment overallScore={overallScore} trendLabel={trendLabel} watchlistStocks={stocksData} />
            <TopStocks 
              email={email}
              watchlist={watchlist} 
              stocksData={stocksData} 
              alerts={alerts}
              onWatchlistChange={handleWatchlistChange} 
              onSelectStock={setSelectedStock} 
              onRunPipeline={handleRunPipeline}
              pipelineRunning={pipelineRunning}
            />
            <IngestActivity />
          </div>

          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l dark:border-white/10 border-slate-200 pt-6 lg:pt-0 lg:pl-6">
            <SectorHeatmap 
              heatmapData={heatmapData} 
              watchlist={watchlist}
              selectedTicker={selectedHeatmapTicker}
              onSelectTicker={setSelectedHeatmapTicker}
            />
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in duration-300">
          <StockPriceSentimentTab 
            watchlist={watchlist}
            activeTicker={selectedChartTicker}
            onTickerChange={setSelectedChartTicker}
          />
        </div>
      )}

      {/* Detailed Stock Trend Overlay */}
      {selectedStock && (
        <StockTrendDetails 
          stock={selectedStock} 
          onClose={() => setSelectedStock(null)} 
        />
      )}
    </div>
  );
}
