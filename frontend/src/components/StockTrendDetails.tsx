import { useEffect, useState, useMemo } from 'react';
import type { Stock } from '../types';
import { getSentimentColor, formatPrice, getArticleSentimentScore, formatArticleSentiment } from '../lib/utils';
import { X, RefreshCw, AlertCircle, Globe, Calendar, Tag } from 'lucide-react';
import { ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { API_URL } from '../config';

interface RecentArticle {
  url: string;
  content: string;
  date: string;
  sentiment: Record<string, any> | null;
}

interface ChartDataPoint {
  date: string;
  displayDate: string;
  fullDate: string;
  close: number | null;
  sentiment: number | null;
  article_count: number;
  articles: RecentArticle[];
}

function normalizeDateStr(d: string | undefined): string | null {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parts = d.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${year}-${month}-${day}`;
  }
  try {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {
    // ignore
  }
  return null;
}

const CustomChartTooltip = ({ active, payload, currency }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  const data: ChartDataPoint = payload[0]?.payload;
  if (!data) return null;

  const priceVal = data.close;
  const sentimentVal = data.sentiment;
  const articleCount = data.article_count || 0;
  const dateStr = data.fullDate || data.displayDate || data.date;

  const hasSentiment = sentimentVal !== null && sentimentVal !== undefined && !isNaN(sentimentVal);
  const formattedSentiment = hasSentiment ? (sentimentVal >= 0 ? `+${sentimentVal.toFixed(2)}` : sentimentVal.toFixed(2)) : '--';
  const signalLabel = hasSentiment 
    ? (sentimentVal > 0.5 ? 'Strong Bullish' : sentimentVal > 0.15 ? 'Bullish' : sentimentVal < -0.5 ? 'Strong Bearish' : sentimentVal < -0.15 ? 'Bearish' : 'Neutral')
    : 'No Signal';
  const signalColor = hasSentiment
    ? (sentimentVal > 0.15 ? 'text-[#00FF94]' : sentimentVal < -0.15 ? 'text-[#FF3E3E]' : 'text-slate-300 dark:text-white/80')
    : 'text-slate-500';

  return (
    <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs font-mono min-w-[220px] max-w-[320px] space-y-2 text-slate-200 pointer-events-none">
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
        <span className="font-bold text-white">{dateStr}</span>
        {articleCount > 0 && (
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
            {articleCount} {articleCount === 1 ? 'article' : 'articles'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <span className="text-slate-400 block text-[10px] uppercase">Stock Price</span>
          <span className="font-bold text-white text-sm">
            {priceVal !== null && priceVal !== undefined ? formatPrice(priceVal, currency) : '--'}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px] uppercase">Daily Sentiment</span>
          <span className={`font-bold text-sm ${signalColor}`}>
            {formattedSentiment}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px]">
        <span className="text-slate-400 uppercase">Market Signal:</span>
        <span className={`font-bold uppercase ${signalColor}`}>{signalLabel}</span>
      </div>

      {data.articles && data.articles.length > 0 && (
        <div className="pt-1.5 border-t border-slate-800 text-[10px] space-y-1">
          <span className="text-slate-400 uppercase block font-bold">Key Catalysts:</span>
          {data.articles.slice(0, 2).map((art, idx) => {
            const artScore = getArticleSentimentScore(art.sentiment);
            const artScoreStr = artScore !== null ? (artScore >= 0 ? `+${artScore.toFixed(2)}` : artScore.toFixed(2)) : '';
            return (
              <div key={idx} className="truncate text-slate-300 flex items-center justify-between gap-2">
                <span className="truncate">• {art.content}</span>
                {artScoreStr && (
                  <span className={`shrink-0 font-bold ${artScore && artScore > 0.15 ? 'text-[#00FF94]' : artScore && artScore < -0.15 ? 'text-[#FF3E3E]' : 'text-slate-400'}`}>
                    {artScoreStr}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export function StockTrendDetails({ 
  stock, 
  onClose 
}: { 
  stock: Stock; 
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceSeries, setPriceSeries] = useState<any[]>([]);
  const [sentimentSeries, setSentimentSeries] = useState<any[]>([]);
  const [recentArticles, setRecentArticles] = useState<RecentArticle[]>([]);

  const fetchDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/stock/history?ticker=${encodeURIComponent(stock.ticker)}&period=30d`);
      if (!res.ok) throw new Error('Failed to retrieve stock history data.');
      const data = await res.json();
      
      setPriceSeries(data.price_series || []);
      setSentimentSeries(data.sentiment_series || []);
      setRecentArticles(data.recent_articles || []);
    } catch (err) {
      console.error(err);
      setError('Could not connect to database or retrieve stock data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [stock.ticker]);

  const currency = stock.currency || (stock.ticker.endsWith('.NS') || stock.ticker.endsWith('.BO') ? 'INR' : 'USD');

  // Construct unified date-aligned dataset
  const chartData: ChartDataPoint[] = useMemo(() => {
    const articlesByDate = new Map<string, RecentArticle[]>();
    recentArticles.forEach(art => {
      const normDate = normalizeDateStr(art.date);
      if (normDate) {
        const list = articlesByDate.get(normDate) || [];
        list.push(art);
        articlesByDate.set(normDate, list);
      }
    });

    const sentimentSeriesByDate = new Map<string, { score: number; count: number }>();
    sentimentSeries.forEach(s => {
      const normDate = normalizeDateStr(s.time || s.date);
      if (normDate) {
        let score: number | null = null;
        if (s.score !== undefined && s.score !== null) {
          score = Number(s.score);
        } else if (s.value !== undefined) {
          const isPositive = s.color ? s.color.includes('0, 150') : true;
          score = isPositive ? (s.value / 100.0) : -(s.value / 100.0);
        }
        if (score !== null && !isNaN(score)) {
          sentimentSeriesByDate.set(normDate, { score: Number(score.toFixed(2)), count: s.article_count || 1 });
        }
      }
    });

    const allDates = new Set<string>();
    priceSeries.forEach(p => {
      const norm = normalizeDateStr(p.time || p.date);
      if (norm) allDates.add(norm);
    });
    sentimentSeries.forEach(s => {
      const norm = normalizeDateStr(s.time || s.date);
      if (norm) allDates.add(norm);
    });
    recentArticles.forEach(a => {
      const norm = normalizeDateStr(a.date);
      if (norm) allDates.add(norm);
    });

    const sortedDates = Array.from(allDates).sort();
    let lastKnownClose: number | null = null;

    return sortedDates.map(dateKey => {
      const priceItem = priceSeries.find(p => normalizeDateStr(p.time || p.date) === dateKey);
      let close: number | null = null;
      if (priceItem && priceItem.value !== undefined && priceItem.value !== null) {
        close = priceItem.value;
        lastKnownClose = priceItem.value;
      } else if (lastKnownClose !== null) {
        close = lastKnownClose;
      }

      let sentiment: number | null = null;
      let article_count = 0;
      const articlesOnDate = articlesByDate.get(dateKey) || [];

      const validScores: number[] = [];
      articlesOnDate.forEach(art => {
        const sc = getArticleSentimentScore(art.sentiment);
        if (sc !== null && typeof sc === 'number' && !isNaN(sc)) {
          validScores.push(sc);
        }
      });

      if (validScores.length > 0) {
        const sum = validScores.reduce((acc, curr) => acc + curr, 0);
        sentiment = Number((sum / validScores.length).toFixed(2));
        article_count = articlesOnDate.length;
      } else if (sentimentSeriesByDate.has(dateKey)) {
        const seriesEntry = sentimentSeriesByDate.get(dateKey)!;
        sentiment = seriesEntry.score;
        article_count = seriesEntry.count;
      } else {
        sentiment = null;
        article_count = 0;
      }

      const parts = dateKey.split('-');
      let displayDate = dateKey;
      let fullDate = dateKey;
      if (parts.length === 3) {
        const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!isNaN(dateObj.getTime())) {
          const monthName = dateObj.toLocaleString('en-US', { month: 'short' });
          const dayNum = dateObj.getDate();
          displayDate = `${dayNum} ${monthName}`;
          fullDate = `${dayNum} ${monthName} ${parts[0]}`;
        }
      }

      return {
        date: dateKey,
        displayDate,
        fullDate,
        close,
        sentiment,
        article_count,
        articles: articlesOnDate
      };
    });
  }, [priceSeries, sentimentSeries, recentArticles]);

  const scoreColor = stock.sentimentScore !== null ? getSentimentColor(stock.sentimentScore) : 'text-slate-400 dark:text-white/40';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-[#0E0E10] border border-slate-200 dark:border-white/10 rounded-xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50 dark:bg-white/2">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black italic text-slate-900 dark:text-white">{stock.ticker}</span>
            <div className="h-4 w-px bg-slate-300 dark:bg-white/20"></div>
            <span className="text-sm uppercase tracking-wider text-slate-500 dark:text-white/60 font-semibold">{stock.name}</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              <div className="text-center">
                <p className="font-mono text-sm uppercase tracking-widest text-slate-600 dark:text-white/70">Initiating Neural Scan...</p>
                <p className="text-xs text-slate-400 dark:text-white/40 mt-1">Parsing latest news and sentiment channels for {stock.ticker}</p>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">Sentiment Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-4xl font-extrabold italic ${scoreColor}`}>
                      {stock.sentimentScore !== null ? (stock.sentimentScore >= 0 ? `+${stock.sentimentScore.toFixed(2)}` : stock.sentimentScore.toFixed(2)) : '--'}
                    </span>
                    <span className={`text-[10px] font-bold uppercase ${scoreColor}`}>
                      {stock.sentimentScore !== null ? (stock.sentimentScore > 0.15 ? 'Bullish' : stock.sentimentScore < -0.15 ? 'Bearish' : 'Neutral') : 'Data Pending'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">Current Price</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{formatPrice(stock.price, currency)}</span>
                    <span className={`text-xs font-mono font-bold ${stock.changePercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-white/40 block mb-1">Algorithmic Rating</span>
                  <span className="text-base font-extrabold uppercase text-slate-800 dark:text-white/80 block mt-1.5">
                    {stock.sentimentScore === null ? 'No Signal / Pending' :
                     stock.sentimentScore >= 0.4 ? 'Strong Outperform' : 
                     stock.sentimentScore >= 0.15 ? 'Moderate Outperform' : 
                     stock.sentimentScore >= -0.15 ? 'Hold / Neutral' : 
                     stock.sentimentScore >= -0.4 ? 'Moderate Underperform' : 'Strong Underperform'}
                  </span>
                </div>
              </div>

              {/* Composed Price and Sentiment Overlay Chart */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-white/40 block font-semibold">
                    Price Overlay & Sentiment Trajectory (Past 30 Days)
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span className="text-[#38bdf8]">● Price</span>
                    <span className="text-[#00FF94]">■ Bullish</span>
                    <span className="text-[#FF3E3E]">■ Bearish</span>
                  </div>
                </div>
                <div className="h-64 w-full bg-slate-50 dark:bg-[#121214] p-4 rounded-lg border border-slate-100 dark:border-white/5">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="detailPriceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      
                      <XAxis 
                        dataKey="displayDate" 
                        stroke="#64748b" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={{ stroke: '#334155' }} 
                      />
                      <YAxis 
                        yAxisId="left"
                        domain={['auto', 'auto']}
                        stroke="#64748b" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(val) => `$${val.toFixed(0)}`}
                        label={{ value: 'Price', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 9 } }}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        domain={[-1.0, 1.0]} 
                        stroke="#64748b" 
                        fontSize={9} 
                        tickLine={false} 
                        axisLine={false} 
                        ticks={[-1.0, -0.5, 0.0, 0.5, 1.0]}
                        tickFormatter={(val) => val === 0 ? '0.00' : val > 0 ? `+${val.toFixed(1)}` : `${val.toFixed(1)}`}
                        label={{ value: 'Sentiment', angle: 90, position: 'insideRight', style: { fill: '#94a3b8', fontSize: 9 } }}
                      />
                      
                      <ReferenceLine yAxisId="right" y={0} stroke="#64748b" strokeDasharray="3 3" strokeWidth={1} />
                      <ReferenceLine yAxisId="right" y={0.15} stroke="#00FF94" strokeDasharray="1 4" strokeOpacity={0.4} />
                      <ReferenceLine yAxisId="right" y={-0.15} stroke="#FF3E3E" strokeDasharray="1 4" strokeOpacity={0.4} />
                      
                      <Tooltip content={<CustomChartTooltip currency={currency} />} />
                      
                      <Bar 
                        yAxisId="right"
                        dataKey="sentiment" 
                        barSize={12}
                        name="Daily Sentiment"
                      >
                        {chartData.map((entry, index) => {
                          const val = entry.sentiment;
                          const color = val === null ? 'transparent' : val > 0.15 ? '#00FF94' : val < -0.15 ? '#FF3E3E' : '#94a3b8';
                          return <Cell key={`detail-cell-${index}`} fill={color} opacity={0.85} />;
                        })}
                      </Bar>

                      <Area 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="close" 
                        stroke="#38bdf8" 
                        strokeWidth={2}
                        fill="url(#detailPriceGradient)" 
                        name="Price"
                        dot={false}
                        activeDot={{ r: 4, fill: '#38bdf8', stroke: '#0f172a', strokeWidth: 2 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Real News Catalysts Breakdown */}
              <div className="space-y-3">
                <span className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-white/40 block font-semibold">
                  Primary Sentiment Catalysts (Scraped News)
                </span>
                {recentArticles.length === 0 ? (
                  <div className="p-4 text-center font-mono text-xs dark:bg-white/5 bg-slate-50 border dark:border-white/5 border-slate-100 rounded-lg text-slate-400">
                    No articles currently scraped for this equity. Trigger news ingestion from the dashboard.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentArticles.map((article, i) => {
                      const score = getArticleSentimentScore(article.sentiment);
                      const { scoreText, labelText, colorClass } = formatArticleSentiment(score);

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
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${colorClass} dark:bg-white/5 bg-slate-200`}>
                                {scoreText}
                              </span>
                              <span className={`text-[10px] font-mono font-bold uppercase ${colorClass}`}>
                                {labelText}
                              </span>
                            </div>
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
                            {article.sentiment && typeof article.sentiment === 'object' && Object.entries(article.sentiment).map(([topic, val]) => {
                              if (['overall_sentiment', 'Overall sentiment', 'overallSentiment', 'score'].includes(topic)) return null;
                              if (val === null || val === undefined || typeof val !== 'number' || Math.abs(val) < 0.1) return null;
                              const topicColor = val > 0.15 ? 'text-emerald-500 dark:text-[#00FF94]' : val < -0.15 ? 'text-rose-500 dark:text-[#FF3E3E]' : 'text-slate-600 dark:text-slate-300';
                              return (
                                <span key={topic} className="flex items-center gap-1 dark:bg-white/10 bg-slate-200 px-1.5 py-0.5 rounded text-[9px] text-slate-800 dark:text-slate-300">
                                  <Tag className="w-2.5 h-2.5" />
                                  <span>{topic.replace(/_/g, ' ')}:</span>
                                  <span className={topicColor}>{val >= 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}</span>
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
      </div>
    </div>
  );
}
