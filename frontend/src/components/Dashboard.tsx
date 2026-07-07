import { useState, useEffect, useMemo } from 'react';
import type { Stock } from '../types';
import { OverallSentiment } from './OverallSentiment';
import { SectorHeatmap, TopStocks } from './DataWidgets';
import { StockTrendDetails } from './StockTrendDetails';
import { StockPriceSentimentTab } from './StockPriceSentimentTab';
import { Activity, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';

interface DashboardProps {
  email: string;
}

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

  useEffect(() => {
    if (watchlist.length > 0 && !selectedChartTicker) {
      setSelectedChartTicker(watchlist[0]);
    }
  }, [watchlist, selectedChartTicker]);

  // Fetch watchlist, alerts, heatmap, and Yahoo Finance details
  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // 1. Fetch Watchlist
      const wlRes = await fetch(`http://localhost:8000/api/watchlist?email=${encodeURIComponent(email)}`);
      if (!wlRes.ok) throw new Error("Failed to load watchlist");
      const wlData = await wlRes.json();
      const wl = wlData.watchlist || [];
      setWatchlist(wl);

      // 2. Fetch Alerts
      const alertsRes = await fetch(`http://localhost:8000/api/alerts`);
      if (alertsRes.ok) {
        const alData = await alertsRes.json();
        setAlerts(alData || []);
      }

      // 3. Fetch Heatmap
      const hmRes = await fetch(`http://localhost:8000/api/sentiment/heatmap?email=${encodeURIComponent(email)}`);
      if (hmRes.ok) {
        const hmData = await hmRes.json();
        setHeatmapData(hmData || []);
      }

      // 4. Fetch Stock history summaries
      const stockSummaries: Stock[] = [];
      for (const ticker of wl) {
        try {
          const res = await fetch(`http://localhost:8000/api/stock/history?ticker=${encodeURIComponent(ticker)}&period=5d`);
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

  useEffect(() => {
    fetchData();
    // Poll every 60 seconds
    const interval = setInterval(() => fetchData(true), 60000);
    return () => clearInterval(interval);
  }, [email]);

  // Handle Watchlist Updates (Star / Add Ticker)
  const handleWatchlistChange = async (newWatchlist: string[]) => {
    try {
      const res = await fetch('http://localhost:8000/api/watchlist', {
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

  // Trigger Pipeline Ingestion
  const handleRunPipeline = async () => {
    try {
      setPipelineRunning(true);
      const res = await fetch('http://localhost:8000/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        alert("Scraper pipeline successfully triggered in background. Please wait a few moments for data compilation.");
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
        <Activity className="w-8 h-8 animate-pulse text-[#00FF94]" />
        <p className="font-mono text-sm uppercase tracking-widest">Accessing Firestore datastore...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-4">
        <div>
          <label className="text-[11px] uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-2">Market Overview</label>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-[#00FF94] shadow-[0_0_8px_rgba(16,185,129,0.5)] dark:shadow-[0_0_8px_#00FF94]"></div>
            <span className="text-[11px] font-mono uppercase tracking-widest dark:text-white/60 text-slate-600">
              Live Stream Active (Firestore)
            </span>
          </div>
          <span className="text-[11px] font-mono dark:text-white/40 text-slate-500 uppercase tracking-widest">
            Sync: {format(new Date(), 'HH:mm:ss')}
          </span>
          <button 
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="dark:text-white text-slate-700 dark:hover:text-[#00FF94] hover:text-emerald-500 transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs Selection Header */}
      <div className="flex border-b dark:border-white/10 border-slate-200 gap-6 mb-6">
        <button 
          onClick={() => setDashboardTab('sentiment')}
          className={`text-xs font-black uppercase tracking-widest pb-3 transition-all ${
            dashboardTab === 'sentiment' 
              ? 'dark:text-white text-slate-900 border-b-2 dark:border-[#00FF94] border-emerald-500 font-bold' 
              : 'dark:text-white/40 text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          📊 Sentiment Analysis
        </button>
        <button 
          onClick={() => setDashboardTab('charts')}
          className={`text-xs font-black uppercase tracking-widest pb-3 transition-all ${
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
        <div className="grid grid-cols-12 gap-8 animate-in fade-in duration-300">
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-8">
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
          </div>
          
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l dark:border-white/10 border-slate-200 pt-8 lg:pt-0 lg:pl-6">
            <SectorHeatmap heatmapData={heatmapData} />
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
