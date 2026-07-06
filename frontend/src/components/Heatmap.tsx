import React from 'react';

interface HeatmapItem {
  "Sentiment Topic": string;
  "Sentiment Score": number | null;
  "N": number;
}

interface HeatmapProps {
  data: HeatmapItem[];
}

export const Heatmap: React.FC<HeatmapProps> = ({ data }) => {
  // Helper to color-code sentiment scores
  const getSentimentStyle = (score: number | null) => {
    if (score === null) {
      return {
        background: 'rgba(30, 41, 59, 0.4)',
        borderColor: 'rgba(255,255,255,0.05)',
        color: '#64748b'
      };
    }
    
    if (score >= 0.1) {
      // Scale green intensity based on positive score
      const opacity = Math.min(0.15 + (score * 0.7), 0.85);
      return {
        background: `rgba(16, 185, 129, ${opacity * 0.25})`,
        borderColor: `rgba(16, 185, 129, ${opacity * 0.5})`,
        color: '#34d399',
        fontWeight: '600'
      };
    } else if (score <= -0.1) {
      // Scale red intensity based on negative score
      const absScore = Math.abs(score);
      const opacity = Math.min(0.15 + (absScore * 0.7), 0.85);
      return {
        background: `rgba(239, 68, 68, ${opacity * 0.25})`,
        borderColor: `rgba(239, 68, 68, ${opacity * 0.5})`,
        color: '#f87171',
        fontWeight: '600'
      };
    } else {
      // Neutral
      return {
        background: 'rgba(71, 85, 105, 0.15)',
        borderColor: 'rgba(71, 85, 105, 0.3)',
        color: '#cbd5e1'
      };
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[350px] text-slate-500">
        <span className="text-3xl mb-2">📊</span>
        <p className="text-sm">No sentiment data available for this selection.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white tracking-tight m-0">Topic Sentiment Summary</h3>
        <span className="text-xs text-slate-400 font-medium">Aggregated across all matching articles (Median)</span>
      </div>

      <div className="overflow-y-auto pr-1 flex-1 max-h-[380px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="pb-3 font-semibold">Sentiment Topic</th>
              <th className="pb-3 text-center font-semibold w-[120px]">Sentiment Score</th>
              <th className="pb-3 text-right font-semibold w-[80px]">Mentions (N)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-sm">
            {data.map((item, index) => {
              const score = item["Sentiment Score"];
              const style = getSentimentStyle(score);
              return (
                <tr key={index} className="hover:bg-slate-900/10 transition-colors">
                  <td className="py-3 text-slate-300 font-medium">{item["Sentiment Topic"]}</td>
                  <td className="py-2.5 text-center">
                    <span 
                      className="inline-block px-2.5 py-1 rounded-md text-xs border tracking-wide transition-all"
                      style={style}
                    >
                      {score !== null ? (score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2)) : 'N/A'}
                    </span>
                  </td>
                  <td className="py-3 text-right text-slate-400 font-mono text-xs">{item["N"]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
