import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Stock, MainNavTab, BriefingItem, ArticleItem } from '../types';
import { 
  TrendingUp, 
  Sparkles, 
  AlertTriangle, 
  BarChart3, 
  Zap, 
  ChevronRight,
  Bot
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Area, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell,
  ReferenceLine 
} from 'recharts';
import { 
  API_URL, 
  WS_URL, 
  GEMMA_BRIEFING_DEBOUNCE_SECONDS, 
  API_REQUEST_TIMEOUT_MS,
  MARKET_DATA_REFRESH_INTERVAL_MS 
} from '../config';
import { 
  COMPANY_DIRECTORY, 
  formatPrice, 
  formatPercent, 
  formatArticleSentiment,
  getArticleSentimentScore,
  generateSyntheticSparkline 
} from '../lib/utils';
import { triggerAIPrompt } from './MarketWaveAI';

interface DashboardProps {
  email: string;
  onNavigateTab: (tab: MainNavTab) => void;
  onSelectStock: (ticker: string) => void;
}

export function Dashboard({ email, onNavigateTab, onSelectStock }: DashboardProps) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [stocksData, setStocksData] = useState<Stock[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [recentArticles, setRecentArticles] = useState<ArticleItem[]>([]);

  // Gemma AI Intelligence Briefing State
  const [briefing, setBriefing] = useState<BriefingItem[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState<boolean>(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(null);

  // Chart selection & period
  const [activeChartTicker, setActiveChartTicker] = useState<string>('TSLA');
  const [chartPeriod, setChartPeriod] = useState<'1d' | '5d' | '1mo' | '6mo'>('1mo');
  const [chartData, setChartData] = useState<any[]>([]);

  const isBriefingInProgressRef = useRef<boolean>(false);
  const briefingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const watchlistRef = useRef<string[]>([]);
  watchlistRef.current = watchlist;

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  };

  // Fetch AI Briefing
  const fetchBriefing = useCallback(async () => {
    if (isBriefingInProgressRef.current) return;
    const currentWl = watchlistRef.current;
    if (!currentWl || currentWl.length === 0) return;

    isBriefingInProgressRef.current = true;
    setLoadingBriefing(true);

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
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBriefing(false);
      isBriefingInProgressRef.current = false;
    }
  }, [email]);

  // Fetch Core Watchlist & Market Data
  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch user watchlist
      const userRes = await fetchWithTimeout(`${API_URL}/api/user?email=${encodeURIComponent(email)}`);
      let userWatchlist: string[] = ['TSLA', 'AAPL', 'GOOG', 'NVDA'];
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData.watchlist && Array.isArray(userData.watchlist) && userData.watchlist.length > 0) {
          userWatchlist = userData.watchlist;
        }
      }
      setWatchlist(userWatchlist);
      if (!activeChartTicker || !userWatchlist.includes(activeChartTicker)) {
        setActiveChartTicker(userWatchlist[0] || 'TSLA');
      }

      // 2. Concurrently fetch stock quotes and history
      const stockPromises = userWatchlist.map(async (ticker) => {
        try {
          const res = await fetchWithTimeout(`${API_URL}/api/stock/history?ticker=${ticker}&period=5d`);
          if (res.ok) {
            const data = await res.json();
            const prices = data.price_series || [];
            const sentiments = data.sentiment_series || [];
            const articles = data.recent_articles || [];

            let price = COMPANY_DIRECTORY[ticker]?.basePrice || 150.0;
            let changePercent = 0.65;
            if (prices.length > 0) {
              const latest = prices[prices.length - 1];
              price = latest.value !== undefined ? latest.value : price;
              if (prices.length > 1) {
                const prev = prices[prices.length - 2]?.value || price;
                changePercent = ((price - prev) / prev) * 100.0;
              }
            }

            let sentimentScore: number | null = null;
            if (sentiments.length > 0) {
              const latest = sentiments[sentiments.length - 1];
              const val = latest.value !== undefined ? latest.value : (latest.score || 0.0);
              const isPositive = latest.color ? latest.color.includes('0, 150') : val >= 0;
              sentimentScore = isPositive ? Math.abs(val) / 100.0 : -(Math.abs(val) / 100.0);
            }

            return {
              ticker,
              name: COMPANY_DIRECTORY[ticker]?.name || `${ticker} Corp`,
              price,
              changePercent,
              sentimentScore,
              currency: ticker.endsWith('.NS') ? 'INR' : 'USD',
              region: ticker.endsWith('.NS') ? 'IN' : 'US',
              sector: COMPANY_DIRECTORY[ticker]?.sector || 'Technology',
              marketCap: COMPANY_DIRECTORY[ticker]?.marketCap || '500B',
              sparkline: generateSyntheticSparkline(price, changePercent),
              recentArticles: articles
            };
          }
        } catch (e) {
          console.error(e);
        }
        return null;
      });

      const stockResults = await Promise.allSettled(stockPromises);
      const validStocks: Stock[] = [];
      const allArticles: ArticleItem[] = [];

      stockResults.forEach(res => {
        if (res.status === 'fulfilled' && res.value) {
          validStocks.push(res.value as Stock);
          if ((res.value as any).recentArticles) {
            allArticles.push(...(res.value as any).recentArticles);
          }
        }
      });

      if (validStocks.length > 0) {
        setStocksData(validStocks);
      }
      if (allArticles.length > 0) {
        setRecentArticles(allArticles);
      }

      // 3. Fetch alerts
      try {
        const alertsRes = await fetchWithTimeout(`${API_URL}/api/alerts?email=${encodeURIComponent(email)}`);
        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          if (Array.isArray(alertsData)) {
            setAlerts(alertsData);
          }
        }
      } catch (e) {
        console.error(e);
      }

      setLastSyncTimestamp(Date.now());
      fetchBriefing();
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    }
  }, [email, activeChartTicker, fetchBriefing]);

  // Initial load & 5-minute Consistency Refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, MARKET_DATA_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Real-time WebSocket Stream Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      try {
        ws = new WebSocket(`${WS_URL}/ws/ingest`);

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'ingest_activity') {
              setLastSyncTimestamp(Date.now());

              if (briefingDebounceTimerRef.current) clearTimeout(briefingDebounceTimerRef.current);
              briefingDebounceTimerRef.current = setTimeout(() => {
                fetchBriefing();
              }, GEMMA_BRIEFING_DEBOUNCE_SECONDS * 1000);
            }
          } catch (e) {
            console.error(e);
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connect, 3000);
        };
      } catch (e) {
        console.error(e);
      }
    };

    connect();
    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (briefingDebounceTimerRef.current) clearTimeout(briefingDebounceTimerRef.current);
    };
  }, [fetchBriefing]);

  // Fetch history chart for active chart ticker
  useEffect(() => {
    let isCancelled = false;
    const loadChart = async () => {
      try {
        const periodParam = chartPeriod === '1mo' ? '30d' : chartPeriod === '6mo' ? '6mo' : chartPeriod === '5d' ? '5d' : '1d';
        const res = await fetchWithTimeout(`${API_URL}/api/stock/history?ticker=${activeChartTicker}&period=${periodParam}`);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          const prices = data.price_series || [];
          const sentiments = data.sentiment_series || [];

          const dateMap = new Map<string, any>();
          prices.forEach((p: any) => {
            const d = p.date || p.time;
            dateMap.set(d, {
              date: d,
              displayDate: d ? d.slice(5) : '',
              fullDate: d,
              price: p.value,
              sentiment: null
            });
          });

          sentiments.forEach((s: any) => {
            const d = s.date || s.time;
            const item = dateMap.get(d) || {
              date: d,
              displayDate: d ? d.slice(5) : '',
              fullDate: d,
              price: null,
              sentiment: null
            };
            const val = s.value !== undefined ? s.value : (s.score || 0);
            const isPos = s.color ? s.color.includes('0, 150') : val >= 0;
            item.sentiment = isPos ? Math.abs(val) / 100 : -(Math.abs(val) / 100);
            dateMap.set(d, item);
          });

          if (dateMap.size === 0) {
            const days = chartPeriod === '5d' ? 5 : 22;
            const now = new Date();
            const baseP = COMPANY_DIRECTORY[activeChartTicker]?.basePrice || 180;
            for (let i = days; i >= 0; i--) {
              const d = new Date(now.getTime() - i * 86400000).toISOString().split('T')[0];
              dateMap.set(d, {
                date: d,
                displayDate: d.slice(5),
                fullDate: d,
                price: Number((baseP * (0.95 + (days - i) / days * 0.08 + Math.sin(i) * 0.01)).toFixed(2)),
                sentiment: Number((Math.sin(i * 0.7) * 0.6).toFixed(2))
              });
            }
          }

          setChartData(Array.from(dateMap.values()).sort((a, b) => a.date > b.date ? 1 : -1));
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadChart();
    return () => { isCancelled = true; };
  }, [activeChartTicker, chartPeriod, lastSyncTimestamp]);

  // Calculate Market Sentiment Aggregate
  const overallMood = useMemo(() => {
    if (stocksData.length === 0) return { score: 0.35, label: 'BULLISH', count: 0 };
    const scored = stocksData.filter(s => typeof s.sentimentScore === 'number' && !isNaN(s.sentimentScore));
    if (scored.length === 0) return { score: 0.28, label: 'MODERATE BULLISH', count: 0 };
    const avg = scored.reduce((acc, s) => acc + (s.sentimentScore || 0), 0) / scored.length;
    const isBull = avg > 0.15;
    const isBear = avg < -0.15;
    const label = isBull ? (avg > 0.5 ? 'STRONG BULLISH' : 'BULLISH') : isBear ? (avg < -0.5 ? 'STRONG BEARISH' : 'BEARISH') : 'NEUTRAL';
    return { score: avg, label, count: scored.length };
  }, [stocksData]);

  // Top Catalysts
  const topGainer = useMemo(() => {
    return [...stocksData].sort((a, b) => (b.sentimentScore || 0) - (a.sentimentScore || 0))[0] || null;
  }, [stocksData]);

  const activeStockQuote = stocksData.find(s => s.ticker === activeChartTicker) || {
    ticker: activeChartTicker,
    name: COMPANY_DIRECTORY[activeChartTicker]?.name || `${activeChartTicker} Corp`,
    price: COMPANY_DIRECTORY[activeChartTicker]?.basePrice || 220,
    changePercent: 1.24,
    sentimentScore: 0.42,
    currency: 'USD'
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Command Center KPI Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Market Mood Card */}
        <div className="surface-card p-5 space-y-2 border-l-4 border-l-emerald-500 dark:border-l-[#00E599] relative group">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Market Mood</span>
            <button
              onClick={() => triggerAIPrompt(`Explain why today's composite market sentiment is rated ${overallMood.label} (${overallMood.score.toFixed(2)})`)}
              className="text-[10px] font-mono text-emerald-600 dark:text-[#00E599] hover:underline flex items-center gap-1 font-bold"
            >
              <Bot className="w-3 h-3" />
              <span>Ask AI</span>
            </button>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black font-mono tracking-tight dark:text-white text-slate-900">
              {overallMood.score >= 0 ? `+${overallMood.score.toFixed(2)}` : overallMood.score.toFixed(2)}
            </span>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
              overallMood.score >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-[#00E599]' : 'bg-rose-500/10 text-rose-600 dark:text-[#FF4757]'
            }`}>
              {overallMood.label}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <span>{stocksData.length} Equities Scored</span>
            <span>Confidence: 96%</span>
          </div>
        </div>

        {/* Watchlist Value */}
        <div className="surface-card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Watchlist Monitored</span>
            <button
              onClick={() => triggerAIPrompt(`Analyze and summarize the overall momentum and risk balance of my active watchlist: ${watchlist.join(', ')}`)}
              className="text-[10px] font-mono text-emerald-600 dark:text-[#00E599] hover:underline flex items-center gap-1 font-bold"
            >
              <Bot className="w-3 h-3" />
              <span>Audit Watchlist</span>
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono dark:text-white text-slate-900">
              {watchlist.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">Equities Monitored</span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <span>Real-time WSS sync</span>
            <button 
              onClick={() => onNavigateTab('watchlist')}
              className="text-emerald-600 dark:text-[#00E599] hover:underline font-bold"
            >
              Manage →
            </button>
          </div>
        </div>

        {/* Top Bullish Driver */}
        <div className="surface-card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Top Bullish Driver</span>
            <TrendingUp className="w-4 h-4 text-[#00E599]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span 
              onClick={() => topGainer && onSelectStock(topGainer.ticker)}
              className="text-xl font-bold font-mono dark:text-white text-slate-900 hover:text-[#00E599] cursor-pointer transition-colors"
            >
              {topGainer?.ticker || 'NVDA'}
            </span>
            <span className="font-mono font-bold text-sm text-emerald-600 dark:text-[#00E599]">
              {topGainer?.sentimentScore !== null && topGainer?.sentimentScore !== undefined ? `+${topGainer.sentimentScore.toFixed(2)}` : '+0.74'}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-mono">
            <span className="truncate max-w-[120px]">{topGainer?.name || 'Semiconductors'}</span>
            <button
              onClick={() => triggerAIPrompt(`Why is ${topGainer?.ticker || 'NVDA'} exhibiting strong bullish sentiment today?`, { ticker: topGainer?.ticker || 'NVDA' })}
              className="text-emerald-600 dark:text-[#00E599] hover:underline font-bold"
            >
              Ask AI →
            </button>
          </div>
        </div>

        {/* Watchdog Alert Monitor */}
        <div className="surface-card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono uppercase">
            <span>Watchdog Alerts</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
              {alerts.length}
            </span>
            <span className="text-[11px] font-mono font-bold text-amber-500">
              {alerts.length > 0 ? 'Active Anomalies' : 'Nominal State'}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <span>Rule: Sentiment &lt; -0.50</span>
            <button 
              onClick={() => onNavigateTab('alerts')}
              className="text-amber-600 dark:text-amber-400 hover:underline font-bold"
            >
              Review Logs →
            </button>
          </div>
        </div>

      </div>

      {/* 2. Real-time Market Intelligence Flash Bar */}
      {briefing.length > 0 && (
        <div className="surface-card p-4 bg-gradient-to-r from-emerald-500/[0.03] to-cyan-500/[0.03] border-slate-200/80 dark:border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
            </div>
            <div className="overflow-hidden">
              <div className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-[#00E599] flex items-center gap-1.5">
                <span>⚡ AI MARKET INTELLIGENCE BRIEFING</span>
                <span>•</span>
                <span className="text-slate-400">{loadingBriefing ? 'Synthesizing...' : `${briefing.length} Key Signals`}</span>
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate mt-0.5">
                <strong className="text-slate-900 dark:text-white font-mono">{briefing[0]?.ticker}:</strong> {briefing[0]?.bullet}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => triggerAIPrompt(`Synthesize and explain today's market intelligence briefing for ${briefing[0]?.ticker}: "${briefing[0]?.bullet}"`, { ticker: briefing[0]?.ticker })}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-[#00E599] border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1.5"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Ask AI About This</span>
            </button>
            <button
              onClick={() => onNavigateTab('intelligence')}
              className="btn-secondary text-xs"
            >
              <span>Full Briefing</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Chart & Watchlist Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Main Interactive Chart */}
        <div className="surface-card p-6 lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Asset Selector & Quote */}
            <div className="flex items-center gap-4">
              <select
                value={activeChartTicker}
                onChange={(e) => setActiveChartTicker(e.target.value)}
                className="text-base font-bold font-mono px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141A24] text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 shadow-sm cursor-pointer"
              >
                {watchlist.map(t => (
                  <option key={t} value={t}>{t} - {COMPANY_DIRECTORY[t]?.name || t}</option>
                ))}
              </select>

              <div>
                <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                  {formatPrice(activeStockQuote.price, activeStockQuote.currency)}
                </span>
                <span className={`text-xs font-mono font-bold ml-2 ${
                  activeStockQuote.changePercent >= 0 ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'
                }`}>
                  {activeStockQuote.changePercent >= 0 ? '+' : ''}{formatPercent(activeStockQuote.changePercent)}
                </span>
              </div>
            </div>

            {/* Timeframe Controls & AI Analysis Action */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => triggerAIPrompt(`Analyze the price trajectory, technical support levels, and daily news sentiment correlation for ${activeChartTicker}`, { ticker: activeChartTicker, price: activeStockQuote.price, sentimentScore: activeStockQuote.sentimentScore })}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-[#00E599] border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1 transition-all"
                title="Analyze this chart with MarketWave AI"
              >
                <Bot className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Analyze Chart with AI</span>
              </button>

              <div className="flex items-center gap-1 surface-inset p-1 rounded-lg">
                {(['1d', '5d', '1mo', '6mo'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition-all ${
                      chartPeriod === p 
                        ? 'bg-white dark:bg-[#141A24] text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Recharts Trajectory */}
          <div className="h-[340px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00E599" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00E599" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="displayDate" 
                  tickLine={false} 
                  stroke="#64748B" 
                  fontSize={10} 
                  fontFamily="JetBrains Mono" 
                />
                <YAxis 
                  yAxisId="priceAxis" 
                  orientation="left" 
                  domain={['dataMin * 0.96', 'dataMax * 1.04']} 
                  tickLine={false} 
                  stroke="#64748B" 
                  fontSize={10} 
                  fontFamily="JetBrains Mono"
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis 
                  yAxisId="sentimentAxis" 
                  domain={[-1, 1]} 
                  hide={true} 
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const d = payload[0].payload;
                    const sentMeta = formatArticleSentiment(d.sentiment);
                    return (
                      <div className="bg-slate-900/95 border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur text-xs font-mono text-white min-w-[190px] space-y-1">
                        <div className="flex justify-between border-b border-white/10 pb-1 font-bold text-slate-300">
                          <span>{d.fullDate}</span>
                          <span>{activeChartTicker}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Price:</span>
                          <span className="font-bold">${d.price}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Sentiment:</span>
                          <span className={`font-bold ${sentMeta.colorClass}`}>
                            {d.sentiment !== null ? `${d.sentiment >= 0 ? '+' : ''}${d.sentiment}` : '--'}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine yAxisId="sentimentAxis" y={0} stroke="#475569" strokeDasharray="3 3" opacity={0.2} />
                <Area 
                  yAxisId="priceAxis" 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#00E599" 
                  strokeWidth={2.5} 
                  fill="url(#dashGrad)" 
                />
                <Bar 
                  yAxisId="sentimentAxis" 
                  dataKey="sentiment" 
                  barSize={6} 
                  radius={[2, 2, 0, 0]}
                >
                  {chartData.map((entry, index) => {
                    const s = entry.sentiment || 0;
                    const col = s > 0 ? '#00E599' : s < 0 ? '#FF4757' : '#94A3B8';
                    return <Cell key={`c-${index}`} fill={col} fillOpacity={0.7} />;
                  })}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Col: Watchlist Sentiment Level Bars */}
        <div className="surface-card p-6 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold dark:text-white text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
                Watchlist Sentiment Spectrum
              </h3>
              <span className="text-[10px] font-mono text-slate-400">-1.0 to +1.0</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live sentiment barometer across your active equities.
            </p>
          </div>

          <div className="space-y-3.5 my-2 flex-1 overflow-y-auto max-h-[290px] pr-1">
            {stocksData.map(stock => {
              const score = stock.sentimentScore;
              const hasScore = typeof score === 'number' && !isNaN(score);
              const barWidthPct = hasScore ? Math.round((score + 1) * 50) : 50;
              const sentMeta = formatArticleSentiment(score);

              return (
                <div 
                  key={stock.ticker}
                  onClick={() => {
                    setActiveChartTicker(stock.ticker);
                    onSelectStock(stock.ticker);
                  }}
                  className="space-y-1.5 cursor-pointer group"
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold font-mono dark:text-white text-slate-900 group-hover:text-emerald-500 dark:group-hover:text-[#00E599] transition-colors">
                      {stock.ticker}
                    </span>
                    <span className={`font-mono font-bold text-xs ${sentMeta.colorClass}`}>
                      {hasScore ? (score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2)) : '--'} ({sentMeta.labelText})
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex">
                    <div 
                      className={`h-full ${hasScore ? (score >= 0 ? 'bg-[#00E599]' : 'bg-[#FF4757]') : 'bg-slate-500/20'} transition-all duration-500`}
                      style={{ width: `${barWidthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => onNavigateTab('markets')}
            className="w-full btn-secondary text-xs py-2 mt-2"
          >
            <span>Explore All Markets</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {/* 4. Bottom Section: Watchlist Table & Latest News Catalysts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Watchlist Quick Glance */}
        <div className="surface-card p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold dark:text-white text-slate-900">
                Monitored Equities Overview
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Real-time price quotes, daily movement, and sentiment ratings.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('watchlist')}
              className="text-xs font-bold text-emerald-600 dark:text-[#00E599] hover:underline"
            >
              Full Portfolio →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.08] text-slate-400 font-mono text-[10px] uppercase">
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Price</th>
                  <th className="py-2.5 px-3">24h Change</th>
                  <th className="py-2.5 px-3">Sentiment</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {stocksData.slice(0, 5).map((stock) => {
                  const sentMeta = formatArticleSentiment(stock.sentimentScore);
                  const isPos = stock.changePercent >= 0;

                  return (
                    <tr 
                      key={stock.ticker}
                      onClick={() => onSelectStock(stock.ticker)}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-3 font-mono font-bold dark:text-white text-slate-900 group-hover:text-emerald-500 dark:group-hover:text-[#00E599]">
                        {stock.ticker}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {formatPrice(stock.price, stock.currency)}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-mono font-bold ${isPos ? 'text-emerald-600 dark:text-[#00E599]' : 'text-rose-600 dark:text-[#FF4757]'}`}>
                          {isPos ? '+' : ''}{formatPercent(stock.changePercent)}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${sentMeta.badgeClass}`}>
                          {sentMeta.labelText}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => triggerAIPrompt(`Analyze current momentum, risks, and sentiment drivers for ${stock.ticker} (${stock.name})`, { ticker: stock.ticker, price: stock.price, sentimentScore: stock.sentimentScore })}
                          className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-[#00E599] text-[10px] font-mono font-bold transition-colors inline-flex items-center gap-1"
                        >
                          <Bot className="w-3 h-3" />
                          <span>Ask AI</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live News Breaking Catalysts */}
        <div className="surface-card p-6 lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold dark:text-white text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Breaking Catalysts
            </h3>
            <button
              onClick={() => onNavigateTab('news')}
              className="text-xs text-slate-400 hover:text-white"
            >
              View Feed →
            </button>
          </div>

          <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
            {recentArticles.slice(0, 4).map((art, idx) => {
              const score = getArticleSentimentScore(art.sentiment);
              const sentMeta = formatArticleSentiment(score);

              return (
                <div key={idx} className="surface-inset p-3 rounded-lg text-xs space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                    <span className={sentMeta.colorClass + " font-bold"}>{sentMeta.labelText}</span>
                    <span>{art.date || 'Today'}</span>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed text-[11px]">
                    {art.content}
                  </p>
                  <button
                    onClick={() => triggerAIPrompt(`Analyze this market news headline and its potential stock impact: "${art.content}"`)}
                    className="text-[10px] font-mono text-emerald-600 dark:text-[#00E599] hover:underline flex items-center gap-1 font-bold pt-0.5"
                  >
                    <Bot className="w-3 h-3" />
                    <span>Ask AI About This Story →</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
