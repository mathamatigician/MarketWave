import { useEffect, useState, useMemo } from 'react';
import { getSentimentColor, formatPrice } from '../lib/utils';
import { RefreshCw, AlertCircle, Globe, Calendar, Tag } from 'lucide-react';
import { ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { API_URL } from '../config';

interface RecentArticle {
  url: string;
  content: string;
  date: string;
  sentiment: Record<string, number | null>;
}

interface StockPriceSentimentTabProps {
  watchlist: string[];
  activeTicker: string;
  onTickerChange: (ticker: string) => void;
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

export function StockPriceSentimentTab({
  watchlist,
  activeTicker,
  onTickerChange
}: StockPriceSentimentTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceSeries, setPriceSeries] = useState<any[]>([]);
  const [sentimentSeries, setSentimentSeries] = useState<any[]>([]);
  const [recentArticles, setRecentArticles] = useState<RecentArticle[]>([]);
  const [tickerDetails, setTickerDetails] = useState<{ price: number; changePercent: number; name: string } | null>(null);

  const fetchDetail = async () => {
    if (!activeTicker) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/stock/history?ticker=${encodeURIComponent(activeTicker)}&period=30d`);
      if (!res.ok) throw new Error('Failed to retrieve stock history data.');
      const data = await res.json();
      
      setPriceSeries(data.price_series || []);
      setSentimentSeries(data.sentiment_series || []);
      setRecentArticles(data.recent_articles || []);

      // Pull current price & details from the latest element
      let price = 150.0;
      let changePercent = 0.0;
      if (data.price_series && data.price_series.length > 0) {
        const latest = data.price_series[data.price_series.length - 1];
        price = latest.value !== undefined ? latest.value : 150.0;
        
        if (data.price_series.length > 1) {
          const prev = data.price_series[data.price_series.length - 2];
          const prevVal = prev.value || 1.0;
          changePercent = ((price - prevVal) / prevVal) * 100.0;
        }
      }

      setTickerDetails({
        price,
        changePercent,
        name: COMPANY_TICKER_MAP[activeTicker] || `${activeTicker} Corp.`
      });
    } catch (err) {
      console.error(err);
      setError('Could not connect to database or retrieve stock data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [activeTicker]);

  // Combine price series (date, Close) and sentiment series (date, score) for the composed chart
  const chartData = useMemo(() => {
    const dataMap: Record<string, { date: string; close: number | null; sentiment: number | null }> = {};
    
    // Fill price series
    priceSeries.forEach(p => {
      const dateKey = p.time || p.date;
      if (dateKey) {
        dataMap[dateKey] = {
          date: dateKey,
          close: p.value !== undefined ? p.value : (p.close || p.Close || null),
          sentiment: null
        };
      }
    });

    // Fill sentiment series
    sentimentSeries.forEach(s => {
      const dateKey = s.time || s.date;
      if (dateKey) {
        const val = s.value !== undefined ? s.value : (s.score || 0.0);
        const isPositive = s.color ? s.color.includes('0, 150') : true;
        const score = isPositive ? (val / 100.0) : -(val / 100.0);

        if (dataMap[dateKey]) {
          dataMap[dateKey].sentiment = score;
        } else {
          dataMap[dateKey] = {
            date: dateKey,
            close: null,
            sentiment: score
          };
        }
      }
    });

    // Convert back to sorted array
    const sorted = Object.values(dataMap).sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // Forward fill price for non-trading dates (weekends/holidays) that have sentiment
    let lastKnownClose: number | null = null;
    return sorted.map(item => {
      if (item.close !== null && item.close !== undefined) {
        lastKnownClose = item.close;
        return item;
      } else if (lastKnownClose !== null) {
        return { ...item, close: lastKnownClose };
      }
      return item;
    });
  }, [priceSeries, sentimentSeries]);

  const scoreColor = useMemo(() => {
    if (sentimentSeries.length === 0) return 'text-slate-400';
    const latest = sentimentSeries[sentimentSeries.length - 1];
    const val = latest.value !== undefined ? latest.value : (latest.score || 0.0);
    const isPositive = latest.color ? latest.color.includes('0, 150') : true;
    const score = isPositive ? (val / 100.0) : -(val / 100.0);
    return getSentimentColor(score);
  }, [sentimentSeries]);

  const scoreVal = useMemo(() => {
    if (sentimentSeries.length === 0) return 0.0;
    const latest = sentimentSeries[sentimentSeries.length - 1];
    const val = latest.value !== undefined ? latest.value : (latest.score || 0.0);
    const isPositive = latest.color ? latest.color.includes('0, 150') : true;
    return isPositive ? (val / 100.0) : -(val / 100.0);
  }, [sentimentSeries]);

  if (watchlist.length === 0) {
    return (
      <div className="p-12 text-center border border-slate-200 dark:border-white/10 rounded-xl bg-slate-50 dark:bg-white/2">
        <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        <p className="font-mono text-xs uppercase tracking-widest text-slate-500">Your Watchlist is Empty</p>
        <p className="text-xs text-slate-400 mt-1">
          Go back to the <strong>Sentiment Analysis</strong> tab and add or star equities to see their charts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Ticker Dropdown Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/2">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1.5 font-bold font-mono">
            Select Active Equity
          </label>
          <select 
            value={activeTicker} 
            onChange={(e) => onTickerChange(e.target.value)}
            className="text-sm font-bold uppercase py-2 px-3 rounded-lg border dark:border-white/10 border-slate-200 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {watchlist.map(t => (
              <option key={t} value={t}>{t} - {COMPANY_TICKER_MAP[t] || `${t} Corp.`}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={fetchDetail}
          disabled={loading}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/5 border dark:border-white/10 border-slate-200 hover:border-emerald-500 hover:text-emerald-500 dark:hover:border-emerald-500 dark:hover:text-emerald-500 transition-all flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Analysis</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
          <div className="text-center">
            <p className="font-mono text-sm uppercase tracking-widest text-slate-600 dark:text-white/70">Initiating Neural Scan...</p>
            <p className="text-xs text-slate-400 dark:text-white/40 mt-1">Parsing latest news and sentiment channels for {activeTicker}</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-rose-500">
          <AlertCircle className="w-10 h-10" />
          <p className="font-semibold">{error}</p>
          <button 
            onClick={fetchDetail}
            className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/25 rounded-lg text-sm font-semibold transition-colors text-slate-800 dark:text-slate-200"
          >
            Retry Analysis
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* High Level Stats Card */}
          {tickerDetails && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">Sentiment Score</span>
                <div className="flex items-baseline gap-2">
                  <span className={`text-4xl font-extrabold italic ${scoreColor}`}>
                    {scoreVal >= 0 ? `+${scoreVal.toFixed(2)}` : scoreVal.toFixed(2)}
                  </span>
                  <span className={`text-[10px] font-bold uppercase ${scoreColor}`}>
                    {scoreVal > 0.15 ? 'Bullish' : scoreVal < -0.15 ? 'Bearish' : 'Neutral'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">Current Price</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                    {formatPrice(tickerDetails.price, activeTicker.endsWith('.NS') || activeTicker.endsWith('.BO') ? 'INR' : 'USD')}
                  </span>
                  <span className={`text-xs font-mono font-bold ${tickerDetails.changePercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {tickerDetails.changePercent >= 0 ? '+' : ''}{tickerDetails.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">Algorithmic Rating</span>
                <span className="text-base font-extrabold uppercase text-slate-800 dark:text-white/80 block mt-1.5">
                  {scoreVal >= 0.4 ? 'Strong Outperform' : 
                   scoreVal >= 0.15 ? 'Moderate Outperform' : 
                   scoreVal >= -0.15 ? 'Hold / Neutral' : 
                   scoreVal >= -0.4 ? 'Moderate Underperform' : 'Strong Underperform'}
                </span>
              </div>
            </div>
          )}

          {/* Composed Price and Sentiment Overlay Chart */}
          <div className="p-6 bg-slate-50 dark:bg-[#121214] rounded-lg border border-slate-100 dark:border-white/5">
            <span className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-4 font-bold font-mono">
              Price Overlay & Sentiment Trajectory (Past 30 Days)
            </span>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: -5, left: -20, bottom: 0 }}>
                  <XAxis 
                    dataKey="date" 
                    stroke="#888888" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    yAxisId="left"
                    domain={['auto', 'auto']}
                    stroke="#888888" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false} 
                    label={{ value: 'Price', angle: -90, position: 'insideLeft', style: { fill: '#888888', fontSize: 9 } }}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    domain={[-3.0, 3.0]} 
                    stroke="#888888" 
                    fontSize={9} 
                    tickLine={false} 
                    axisLine={false} 
                    ticks={[-1.0, -0.5, 0.0, 0.5, 1.0]}
                    label={{ value: 'Sentiment', angle: 90, position: 'insideRight', style: { fill: '#888888', fontSize: 9 } }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                      border: 'none', 
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                      fontFamily: 'monospace'
                    }}
                  />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="close" 
                    stroke="#4facfe" 
                    strokeWidth={1.5}
                    fillOpacity={0.05} 
                    fill="#4facfe" 
                    name="Price"
                    connectNulls={true}
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="sentiment" 
                    name="Daily Sentiment" 
                    barSize={6}
                  >
                    {chartData.map((entry, index) => {
                      const val = entry.sentiment;
                      const color = val !== null && val > 0.15 ? '#00FF94' : val !== null && val < -0.15 ? '#FF3E3E' : '#64748b';
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Real News Catalysts Breakdown */}
          <div className="space-y-3">
            <span className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-white/40 block font-bold font-mono">
              Primary Sentiment Catalysts (Scraped News)
            </span>
            {recentArticles.length === 0 ? (
              <div className="p-6 text-center font-mono text-xs dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-100 rounded-lg text-slate-400">
                No articles currently scraped for this equity. Trigger news ingestion from the dashboard.
              </div>
            ) : (
              <div className="space-y-4">
                {recentArticles.map((article, i) => {
                  const overallSent = article.sentiment?.overall_sentiment ?? 0.0;
                  return (
                    <div 
                      key={i} 
                      className="p-4 border dark:border-white/10 border-slate-200 dark:bg-white/5 bg-slate-50 hover:dark:border-white/20 transition-all rounded-lg space-y-3"
                    >
                      <div className="flex justify-between items-start gap-4">
                        <a 
                          href={article.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-sm font-bold dark:text-white text-slate-900 hover:text-emerald-500 dark:hover:text-[#00FF94] flex items-center gap-1.5"
                        >
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-[400px]">Open Article Source</span>
                        </a>
                        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${getSentimentColor(overallSent)} dark:bg-white/5 bg-slate-200`}>
                          Score: {overallSent >= 0 ? '+' : ''}{overallSent.toFixed(2)}
                        </span>
                      </div>

                      <p className="text-xs leading-relaxed dark:text-white/70 text-slate-600 font-mono">
                        {article.content}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase font-mono dark:text-white/40 text-slate-400 pt-2 border-t dark:border-white/5 border-slate-200">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {article.date}
                        </span>
                        
                        {/* Topic Sentiment Badges */}
                        {Object.entries(article.sentiment || {}).map(([topic, score]) => {
                          if (topic === 'overall_sentiment' || score === null || Math.abs(score) < 0.1) return null;
                          return (
                            <span key={topic} className="flex items-center gap-1 dark:bg-white/10 bg-slate-200 px-1.5 py-0.5 rounded text-[9px] text-slate-800 dark:text-slate-300">
                              <Tag className="w-2.5 h-2.5" />
                              {topic}: {score >= 0 ? '+' : ''}{score.toFixed(1)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
