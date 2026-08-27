import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Stock } from '../types';
import { OverallSentiment } from './OverallSentiment';
import { SectorHeatmap, TopStocks } from './DataWidgets';
import { StockTrendDetails } from './StockTrendDetails';
import { StockPriceSentimentTab } from './StockPriceSentimentTab';
import { IngestActivity, type ActivityEvent } from './IngestActivity';
import { RefreshCcw, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { API_URL, WS_URL, GEMMA_BRIEFING_DEBOUNCE_SECONDS, API_REQUEST_TIMEOUT_MS } from '../config';

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

const parseStockSummary = (ticker: string, hist: any): Stock => {
  const prices = hist?.price_series || [];
  const sentiments = hist?.sentiment_series || [];

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

  let sentimentScore: number | null = null;
  if (sentiments.length > 0) {
    const latest = sentiments[sentiments.length - 1];
    const val = latest.value !== undefined ? latest.value : (latest.score || 0.0);
    const isPositive = latest.color ? latest.color.includes('0, 150') : true;
    sentimentScore = isPositive ? (val / 100.0) : -(val / 100.0);
  }

  return {
    ticker,
    name: `${ticker} Corp.`,
    sentimentScore,
    price,
    changePercent,
    region: ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'IN' : 'US',
    currency: ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'INR' : 'USD'
  };
};

/** Helper for bounded HTTP requests using AbortController */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = API_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function Dashboard({ email }: DashboardProps) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [stocksData, setStocksData] = useState<Stock[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState<boolean>(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'sentiment' | 'charts'>('sentiment');
  
  // Real-time Stream & Connection State
  const [connectionStatus, setConnectionStatus] = useState<'LIVE' | 'RECONNECTING' | 'OFFLINE'>('OFFLINE');
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(null);

  // Real-time Gemma Flash Briefing State
  const [briefing, setBriefing] = useState<{ ticker: string; bullet: string }[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState<boolean>(false);
  const [briefingTimestamp, setBriefingTimestamp] = useState<number | null>(null);
  const [briefingStatus, setBriefingStatus] = useState<'idle' | 'updating' | 'live' | 'error'>('idle');
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const [selectedChartTicker, setSelectedChartTicker] = useState<string>('');
  const [selectedHeatmapTicker, setSelectedHeatmapTicker] = useState<string>('ALL');

  const isBriefingInProgressRef = useRef<boolean>(false);
  const briefingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  
  const watchlistRef = useRef<string[]>([]);
  watchlistRef.current = watchlist;
  const selectedHeatmapTickerRef = useRef<string>('ALL');
  selectedHeatmapTickerRef.current = selectedHeatmapTicker;

  // Gemma Flash Briefing Fetcher
  const fetchBriefing = useCallback(async (_isManual = false) => {
    if (isBriefingInProgressRef.current) return;
    const currentWl = watchlistRef.current;
    if (!currentWl || currentWl.length === 0) return;

    isBriefingInProgressRef.current = true;
    setLoadingBriefing(true);
    setBriefingStatus('updating');

    try {
      const res = await fetchWithTimeout(`${API_URL}/api/gemma/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tickers: currentWl })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.briefing) && data.briefing.length > 0) {
          setBriefing(data.briefing);
          setBriefingTimestamp(data.timestamp ? data.timestamp * 1000 : Date.now());
          setBriefingStatus('live');
          setBriefingError(null);
        } else if (data.status === 'no_data') {
          setBriefingStatus('live');
          setBriefingError(null);
        } else if (data.status === 'error') {
          setBriefingError(data.message || "Gemma 2 (9B) synthesis temporarily unavailable.");
          setBriefingStatus('error');
        }
      } else {
        setBriefingError(`Gemma synthesis returned HTTP ${res.status}`);
        setBriefingStatus('error');
      }
    } catch (err: any) {
      console.error("Failed to generate Gemma briefing", err);
      setBriefingError("Gemma inference temporarily unavailable. Showing latest cached briefing.");
      setBriefingStatus('error');
    } finally {
      isBriefingInProgressRef.current = false;
      setLoadingBriefing(false);
    }
  }, [email]);

  // Debounced auto-trigger on real-time article events
  const triggerDebouncedBriefing = useCallback(() => {
    if (watchlistRef.current.length === 0) return;
    setBriefingStatus('updating');
    if (briefingDebounceTimerRef.current) {
      clearTimeout(briefingDebounceTimerRef.current);
    }
    const debounceMs = (GEMMA_BRIEFING_DEBOUNCE_SECONDS || 10) * 1000;
    briefingDebounceTimerRef.current = setTimeout(() => {
      fetchBriefing(false);
    }, debounceMs);
  }, [fetchBriefing]);

  // Dedicated Heatmap Fetcher
  const fetchHeatmap = useCallback(async () => {
    try {
      const ticker = selectedHeatmapTickerRef.current;
      const hmUrl = ticker && ticker !== 'ALL'
        ? `${API_URL}/api/sentiment/heatmap?email=${encodeURIComponent(email)}&ticker=${encodeURIComponent(ticker)}`
        : `${API_URL}/api/sentiment/heatmap?email=${encodeURIComponent(email)}`;
      const hmRes = await fetchWithTimeout(hmUrl);
      if (hmRes.ok) {
        const hmData = await hmRes.json();
        setHeatmapData(hmData || []);
      }
    } catch (e) {
      console.error("Failed to fetch heatmap", e);
    }
  }, [email]);

  // Dedicated Alerts Fetcher
  const fetchAlerts = useCallback(async () => {
    try {
      const alertsRes = await fetchWithTimeout(`${API_URL}/api/alerts`);
      if (alertsRes.ok) {
        const alData = await alertsRes.json();
        setAlerts(alData || []);
      }
    } catch (e) {
      console.error("Failed to fetch alerts", e);
    }
  }, []);

  // Targeted Single Stock Refresh
  const refreshSingleStock = useCallback(async (ticker: string) => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/stock/history?ticker=${encodeURIComponent(ticker)}&period=5d`);
      if (res.ok) {
        const hist = await res.json();
        const updated = parseStockSummary(ticker, hist);
        setStocksData(prev => {
          const idx = prev.findIndex(s => s.ticker.toLowerCase() === ticker.toLowerCase());
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [...prev, updated];
        });
        setLastSyncTimestamp(Date.now());
      }
    } catch (e) {
      console.error(`Failed to refresh stock ${ticker}:`, e);
    }
  }, []);

  // Stable refs for WebSocket callbacks to decouple socket lifecycle from state changes
  const fetchAlertsRef = useRef(fetchAlerts);
  fetchAlertsRef.current = fetchAlerts;
  const fetchHeatmapRef = useRef(fetchHeatmap);
  fetchHeatmapRef.current = fetchHeatmap;
  const refreshSingleStockRef = useRef(refreshSingleStock);
  refreshSingleStockRef.current = refreshSingleStock;
  const triggerDebouncedBriefingRef = useRef(triggerDebouncedBriefing);
  triggerDebouncedBriefingRef.current = triggerDebouncedBriefing;

  // Single WebSocket connection lifecycle with bounded exponential backoff
  const connectWebSocket = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(`${WS_URL}/ws/ingest`);

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }
        setConnectionStatus('LIVE');
        reconnectAttemptRef.current = 0;
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data: ActivityEvent = JSON.parse(event.data);
          
          // 1. Append to activity events for IngestActivity
          setActivityEvents(prev => [...prev, data].slice(-200));

          // 2. Immediate Targeted Ticker Updates
          const eventTicker = data.ticker?.trim();
          const currentWatchlist = watchlistRef.current;

          if (data.type === 'article_processed' || data.type === 'new_article') {
            setLastSyncTimestamp(Date.now());

            if (eventTicker) {
              const matchedTicker = currentWatchlist.find(
                w => w.toLowerCase() === eventTicker.toLowerCase()
              );
              if (matchedTicker) {
                refreshSingleStockRef.current(matchedTicker);
                fetchAlertsRef.current();
                fetchHeatmapRef.current();
                triggerDebouncedBriefingRef.current();
              }
            }
          } else if (data.type === 'ingestion_cycle_completed') {
            setLastSyncTimestamp(Date.now());
            if ((data.new_articles_count ?? 0) > 0) {
              fetchAlertsRef.current();
              fetchHeatmapRef.current();
              triggerDebouncedBriefingRef.current();
            }
          }
        } catch (e) {
          // ignore malformed message
        }
      };

      ws.onclose = () => {
        if (isUnmountedRef.current) return;
        if (reconnectAttemptRef.current > 5) {
          setConnectionStatus('OFFLINE');
        } else {
          setConnectionStatus('RECONNECTING');
        }

        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptRef.current), 15000);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      };

      ws.onerror = () => {
        if (isUnmountedRef.current) return;
        setConnectionStatus('RECONNECTING');
      };

      socketRef.current = ws;
    } catch (e) {
      if (!isUnmountedRef.current) {
        setConnectionStatus('OFFLINE');
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptRef.current), 15000);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      }
    }
  }, []);

  // Fetch watchlist, alerts, heatmap, and Yahoo Finance details on initial load or manual refresh
  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Fetch Watchlist with bounded timeout
      let wl: string[] = [];
      try {
        const wlRes = await fetchWithTimeout(`${API_URL}/api/watchlist?email=${encodeURIComponent(email)}`);
        if (!wlRes.ok) {
          throw new Error(`Failed to load watchlist (HTTP ${wlRes.status})`);
        }
        const wlData = await wlRes.json();
        wl = wlData.watchlist || [];
        setWatchlist(wl);
        setWatchlistError(null);
      } catch (err: any) {
        console.error("Watchlist fetch error:", err);
        setWatchlistError(err.name === 'AbortError' ? 'Watchlist request timed out. Retrying...' : 'Datastore temporarily unavailable.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Unblock shell rendering immediately once minimum required state is known
      setLoading(false);

      // 2. Independently fetch Alerts
      fetchAlerts();

      // 3. Concurrently fetch Stock history summaries
      if (wl.length > 0) {
        const stockPromises = wl.map(async (ticker) => {
          try {
            const res = await fetchWithTimeout(`${API_URL}/api/stock/history?ticker=${encodeURIComponent(ticker)}&period=5d`);
            if (res.ok) {
              const hist = await res.json();
              return parseStockSummary(ticker, hist);
            }
          } catch (err) {
            console.error("Error fetching summary for " + ticker, err);
          }
          return null;
        });

        const settled = await Promise.allSettled(stockPromises);
        const stockSummaries: Stock[] = [];
        for (const item of settled) {
          if (item.status === 'fulfilled' && item.value !== null) {
            stockSummaries.push(item.value);
          }
        }
        if (stockSummaries.length > 0) {
          setStocksData(stockSummaries);
        }
      }
      setLastSyncTimestamp(Date.now());
    } catch (e) {
      console.error("Error fetching dashboard data:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData();
  }, [email]);

  // Sync selected chart ticker
  useEffect(() => {
    if (watchlist.length > 0 && !selectedChartTicker) {
      setSelectedChartTicker(watchlist[0]);
    }
  }, [watchlist, selectedChartTicker]);

  // Heatmap load when filter changes
  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap, selectedHeatmapTicker]);

  // Primary Event-Driven WebSocket connection lifecycle
  useEffect(() => {
    isUnmountedRef.current = false;
    connectWebSocket();

    // Fallback low-frequency sync (5 minutes) for network resilience
    const fallbackInterval = setInterval(() => {
      fetchData(true);
    }, 300000);

    return () => {
      isUnmountedRef.current = true;
      clearInterval(fallbackInterval);
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (briefingDebounceTimerRef.current) {
        clearTimeout(briefingDebounceTimerRef.current);
      }
    };
  }, [connectWebSocket]);

  // Handle Watchlist Updates (Star / Add Ticker)
  const handleWatchlistChange = async (newWatchlist: string[]) => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/watchlist`, {
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

  // Trigger Pipeline Ingestion for every ticker in this user's watchlist
  const handleRunPipeline = async () => {
    if (watchlist.length === 0) return;
    try {
      setPipelineRunning(true);
      for (const ticker of watchlist) {
        const res = await fetchWithTimeout(`${API_URL}/api/pipeline/run?ticker=${encodeURIComponent(ticker)}`, {
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
    const scoredStocks = stocksData.filter(s => typeof s.sentimentScore === 'number' && !isNaN(s.sentimentScore));
    if (scoredStocks.length === 0) return null;
    const sum = scoredStocks.reduce((acc, curr) => acc + (curr.sentimentScore as number), 0);
    return sum / scoredStocks.length;
  }, [stocksData]);

  // Compute trend label
  const trendLabel = useMemo(() => {
    if (overallScore === null) return 'NO SIGNAL';
    if (overallScore > 0.4) return 'Strong Bullish';
    if (overallScore > 0.15) return 'Bullish';
    if (overallScore < -0.4) return 'Strong Bearish';
    if (overallScore < -0.15) return 'Bearish';
    return 'Neutral';
  }, [overallScore]);

  // Initial datastore access screen only when truly loading without errors or existing data
  if (loading && !watchlistError && stocksData.length === 0 && watchlist.length === 0) {
    return (
      <div className="flex h-[calc(100vh-160px)] items-center justify-center flex-col gap-4 text-slate-400 dark:text-slate-500">
        <img src="/favicon.svg" alt="MarketWave Logo" className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 animate-pulse" />
        <p className="font-mono text-sm uppercase tracking-widest">Accessing Firestore datastore...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Explicit Datastore Error Banner with Retry */}
      {watchlistError && (
        <div className="bg-red-950/40 border border-red-500/40 rounded-xl p-5 text-center flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-left">
            <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
            <div>
              <h3 className="font-mono font-bold text-xs sm:text-sm text-rose-200 uppercase tracking-wider">DATA SOURCE UNAVAILABLE</h3>
              <p className="text-xs text-slate-400">{watchlistError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchData(false)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all shrink-0"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Retry Connection
          </button>
        </div>
      )}

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
                <h3 className="text-sm font-bold tracking-tight text-white">Executive Briefing</h3>
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

      {/* Dashboard Header with Real WebSocket Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <label className="text-[10px] sm:text-[11px] uppercase tracking-[0.3em] sm:tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-1">Market Overview</label>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            {connectionStatus === 'LIVE' ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-[#00FF94] shadow-[0_0_8px_rgba(16,185,129,0.5)] dark:shadow-[0_0_8px_#00FF94] animate-pulse"></div>
                <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-[#00FF94] font-semibold">
                  LIVE (Firestore Stream)
                </span>
              </>
            ) : connectionStatus === 'RECONNECTING' ? (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-ping"></div>
                <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-amber-500 font-semibold">
                  RECONNECTING...
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-rose-400 font-semibold">
                  OFFLINE
                </span>
              </>
            )}
          </div>
          <span className="text-[10px] sm:text-[11px] font-mono dark:text-white/40 text-slate-500 uppercase tracking-widest">
            Sync: {lastSyncTimestamp ? format(new Date(lastSyncTimestamp), 'HH:mm:ss') : '--:--:--'}
          </span>
          <button 
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-1 rounded-md dark:text-white text-slate-700 dark:hover:text-[#00FF94] hover:text-emerald-500 transition-colors disabled:opacity-50"
            title="Manual Refresh"
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
            <IngestActivity events={activityEvents} />
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
            lastSyncTimestamp={lastSyncTimestamp}
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
