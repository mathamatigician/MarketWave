import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Stock } from '../types';
import { OverallSentiment } from './OverallSentiment';
import { SectorHeatmap, TopStocks } from './DataWidgets';
import { StockTrendDetails } from './StockTrendDetails';
import { StockPriceSentimentTab } from './StockPriceSentimentTab';
import { IngestActivity } from './IngestActivity';
import { RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { API_URL, WS_URL, GEMMA_BRIEFING_DEBOUNCE_SECONDS } from '../config';

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
  const [pipelineRunning, setPipelineRunning] = useState<boolean>(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'sentiment' | 'charts'>('sentiment');
  
  // Real-time Gemma Flash Briefing State
  const [briefing, setBriefing] = useState<{ ticker: string; bullet: string }[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState<boolean>(false);
  const [briefingTimestamp, setBriefingTimestamp] = useState<number | null>(null);
  const [briefingStatus, setBriefingStatus] = useState<'idle' | 'updating' | 'live' | 'error'>('idle');
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const isBriefingInProgressRef = useRef<boolean>(false);
  const briefingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBriefing = useCallback(async (_isManual = false) => {
    // Prevent overlapping simultaneous requests (R7)
    if (isBriefingInProgressRef.current) return;
    if (!watchlist || watchlist.length === 0) return;

    isBriefingInProgressRef.current = true;
    setLoadingBriefing(true);
    setBriefingStatus('updating');

    try {
      const res = await fetch(`${API_URL}/api/gemma/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tickers: watchlist })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.briefing) && data.briefing.length > 0) {
          setBriefing(data.briefing);
          setBriefingTimestamp(data.timestamp ? data.timestamp * 1000 : Date.now());
          setBriefingStatus('live');
          setBriefingError(null);
        } else if (data.status === 'no_data') {
          // If no new/relevant articles, preserve previous valid briefing if present (R14, R15)
          setBriefingStatus('live');
          setBriefingError(null);
        } else if (data.status === 'error') {
          // Non-destructive error state: preserves previous valid briefing (R14)
          setBriefingError(data.message || "Gemma 2 (9B) synthesis temporarily unavailable.");
          setBriefingStatus('error');
        }
      } else {
        setBriefingError(`Gemma synthesis returned HTTP ${res.status}`);
        setBriefingStatus('error');
      }
    } catch (err) {
      console.error("Failed to generate Gemma briefing", err);
      setBriefingError("Gemma inference temporarily unavailable. Showing latest cached briefing.");
      setBriefingStatus('error');
    } finally {
      isBriefingInProgressRef.current = false;
      setLoadingBriefing(false);
    }
  }, [email, watchlist]);

  // Debounced auto-trigger on real-time article events (R7, R8, R9)
  const triggerDebouncedBriefing = useCallback(() => {
    if (watchlist.length === 0) return;
    setBriefingStatus('updating');
    if (briefingDebounceTimerRef.current) {
      clearTimeout(briefingDebounceTimerRef.current);
    }
    const debounceMs = (GEMMA_BRIEFING_DEBOUNCE_SECONDS || 10) * 1000;
    briefingDebounceTimerRef.current = setTimeout(() => {
      fetchBriefing(false);
    }, debounceMs);
  }, [watchlist, fetchBriefing]);

  // Listen to /ws/ingest WebSocket for real-time article ingestion events
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isUnmounted = false;

    const connectIngestWs = () => {
      try {
        ws = new WebSocket(`${WS_URL}/ws/ingest`);
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (
              data.type === 'article_processed' ||
              data.type === 'new_article' ||
              (data.type === 'ingestion_cycle_completed' && (data.new_articles_count ?? 0) > 0)
            ) {
              const eventTicker = data.ticker?.toLowerCase();
              const isRelevant = !eventTicker || watchlist.some(w => w.toLowerCase() === eventTicker);
              if (isRelevant) {
                triggerDebouncedBriefing();
              }
            }
          } catch (e) {
            // Ignore malformed messages
          }
        };
        ws.onclose = () => {
          if (!isUnmounted) {
            setTimeout(connectIngestWs, 5000);
          }
        };
      } catch (e) {
        console.error("Dashboard WS connect failed", e);
      }
    };

    connectIngestWs();

    return () => {
      isUnmounted = true;
      if (ws) ws.close();
      if (briefingDebounceTimerRef.current) {
        clearTimeout(briefingDebounceTimerRef.current);
      }
    };
  }, [watchlist, triggerDebouncedBriefing]);
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
      {/* Active Alerts Banner with Gemma Catalyst */}
      {alerts.length > 0 && alerts.some(alert => watchlist.includes(alert.ticker)) && (
        <div className="space-y-3">
          {alerts
            .filter(alert => watchlist.includes(alert.ticker))
            .map((alert, idx) => (
              <div key={idx} className="bg-red-950/40 border border-red-500/30 rounded-lg p-4 text-rose-300 text-xs flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>
                      <strong>Critical Sentiment Alert:</strong> {alert.ticker} experienced a negative sentiment drop (Avg: {alert.average_sentiment})
                    </span>
                  </div>
                  {alert.timestamp && (
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      {formatAlertDate(alert.timestamp)}
                    </span>
                  )}
                </div>
                {alert.catalyst && (
                  <div className="pl-6 text-[11px] text-rose-200/90 font-medium flex flex-wrap items-center gap-2 bg-red-900/20 p-2 rounded border border-red-500/20">
                    <span>💡 <strong>Breaking Catalyst:</strong> {alert.catalyst}</span>
                    <span className="bg-purple-900/50 border border-purple-400/40 text-purple-200 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider ml-auto">
                      ⚡ Google Gemma 2
                    </span>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* ⚡ Gemma 60-Second Executive Flash Briefing Card */}
      <div className="bg-gradient-to-r from-purple-950/30 to-slate-900/40 border border-purple-500/30 rounded-xl p-4 sm:p-5 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚡</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white">Gemma 60s Executive Briefing</h3>
                <span className="bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold">
                  Google Gemma 2 (9B)
                </span>
                {(loadingBriefing || briefingStatus === 'updating') && (
                  <span className="flex items-center gap-1.5 bg-purple-900/60 border border-purple-400/40 text-purple-200 text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                    Live Synthesis...
                  </span>
                )}
                {briefingTimestamp && !loadingBriefing && briefingStatus !== 'updating' && (
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded-full border border-slate-700/50">
                    Updated: {format(new Date(briefingTimestamp), 'HH:mm:ss')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">Instant AI market digest synthesized across your active watchlist.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchBriefing(true)}
            disabled={loadingBriefing}
            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold tracking-wide transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-1.5 shrink-0"
          >
            <RefreshCcw className={`w-3 h-3 ${loadingBriefing ? 'animate-spin' : ''}`} />
            {loadingBriefing ? 'Synthesizing...' : 'Generate Flash Briefing'}
          </button>
        </div>

        {briefingError && briefing.length > 0 && (
          <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-2.5 my-2 text-amber-200 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{briefingError}</span>
          </div>
        )}

        {briefing.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-purple-500/20">
            {briefing.map((item, i) => (
              <div key={i} className="bg-slate-900/80 border border-purple-500/20 rounded-lg p-3 text-xs flex flex-col gap-1">
                <span className="font-mono font-bold text-emerald-400 text-[11px] uppercase tracking-wider">{item.ticker}</span>
                <p className="text-slate-300 text-[11px] leading-relaxed">{item.bullet}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-[11px] italic mt-1">
            {loadingBriefing
              ? 'Synthesizing latest watchlist news with Google Gemma 2...'
              : 'Click "Generate Flash Briefing" or wait for real-time news ingestion to synthesize watchlist catalysts.'}
          </p>
        )}
      </div>

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
