import React, { useState, useEffect } from 'react';
import { Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';
import { Loader2 } from 'lucide-react';
import { API_URL } from '../config';

interface ChartPanelProps {
  ticker: string;
}

export const ChartPanel: React.FC<ChartPanelProps> = ({ ticker }) => {
  const [data, setData] = useState<any[]>([]);
  const [period, setPeriod] = useState<string>('30d');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchHistoryData();
  }, [ticker, period]);

  const fetchHistoryData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/stock/history?ticker=${encodeURIComponent(ticker)}&period=${period}`);
      if (res.ok) {
        const payload = await res.json();
        const prices = payload.price_series || [];
        const sentiments = payload.sentiment_series || [];

        // Merge by date (time)
        const dateMap = new Map<string, any>();
        
        prices.forEach((p: any) => {
          dateMap.set(p.time, {
            time: p.time,
            price: p.value,
            sentiment: 0,
            color: 'rgba(255, 255, 255, 0.05)'
          });
        });

        sentiments.forEach((s: any) => {
          const isNegative = s.color.includes('255, 82, 82') || s.color.includes('rgba(255,82,82');
          const signedValue = isNegative ? -s.value : s.value;
          
          if (dateMap.has(s.time)) {
            const existing = dateMap.get(s.time);
            existing.sentiment = signedValue;
            existing.color = s.color;
          } else {
            dateMap.set(s.time, {
              time: s.time,
              price: null,
              sentiment: signedValue,
              color: s.color
            });
          }
        });

        const sortedData = Array.from(dateMap.values()).sort((a, b) => a.time.localeCompare(b.time));
        setData(sortedData);
      }
    } catch (e) {
      console.error("Error fetching charting data", e);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const price = payload[0]?.payload?.price;
      const sentiment = payload[0]?.payload?.sentiment;
      const time = payload[0]?.payload?.time;
      return (
        <div className="bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 shadow-xl backdrop-blur-sm text-xs">
          <p className="text-slate-400 font-semibold mb-1">{time}</p>
          {price !== undefined && price !== null && (
            <p className="text-cyan-400 m-0">Stock Price: <strong>${price.toFixed(2)}</strong></p>
          )}
          {sentiment !== undefined && sentiment !== 0 && (
            <p className={`${sentiment >= 0 ? 'text-emerald-400' : 'text-rose-400'} m-0`}>
              Daily Sentiment: <strong>{sentiment > 0 ? `+${sentiment.toFixed(1)}` : sentiment.toFixed(1)}%</strong>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight m-0">{ticker} Stock History & Daily Sentiment</h3>
          <p className="text-xs text-slate-400 m-0">Overlaying daily aggregated sentiment (histogram) on stock close price (area)</p>
        </div>
        <div className="flex gap-1.5 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
          {['5d', '30d', '3mo', '1y'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                period === p
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{ border: 'none', cursor: 'pointer', outline: 'none' }}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[300px] flex items-center justify-center relative">
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-cyan-400" size={32} />
            <span className="text-xs text-slate-500 font-medium">Fetching historical metrics...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="text-xs text-slate-500">No trading data available for the chosen stock and period.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f2fe" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#4facfe" stopOpacity={0.01}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dy={8}
              />
              <YAxis 
                yAxisId="left" 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(val) => `$${val}`}
                domain={['auto', 'auto']}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                domain={[-100, 100]}
                tickFormatter={(val) => `${val}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                yAxisId="left" 
                type="monotone" 
                dataKey="price" 
                stroke="#4facfe" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorPrice)" 
              />
              <Bar 
                yAxisId="right" 
                dataKey="sentiment" 
                radius={[4, 4, 0, 0]}
              >
                {data.map((entry, index) => {
                  // Recharts Bar cell coloring based on value
                  const isNeg = entry.sentiment < 0;
                  const color = isNeg ? 'rgba(239, 68, 68, 0.75)' : 'rgba(16, 185, 129, 0.75)';
                  return <rect key={`cell-${index}`} fill={color} />;
                })}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
