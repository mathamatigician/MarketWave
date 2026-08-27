import React, { useEffect, useState } from 'react';
import type { AINewsBrief } from '../types';
import { API_URL } from '../config';
import { 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  CheckCircle2, 
  Zap, 
  Briefcase,
  Scale,
  Rocket,
  Users
} from 'lucide-react';

interface AINewsBriefCardProps {
  ticker: string;
  companyName?: string;
}

export const AINewsBriefCard: React.FC<AINewsBriefCardProps> = ({ ticker, companyName }) => {
  const [brief, setBrief] = useState<AINewsBrief | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = async () => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/ticker/${encodeURIComponent(ticker)}/brief`);
      if (!res.ok) throw new Error('Failed to fetch AI news brief');
      const data = await res.json();
      setBrief(data);
    } catch (err) {
      console.error(err);
      setError('Unable to generate AI brief at this moment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrief();
  }, [ticker]);

  if (loading) {
    return (
      <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-6 shadow-xl backdrop-blur-md animate-pulse">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
          </div>
          <div className="h-5 w-48 bg-slate-800 rounded"></div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-slate-800 rounded"></div>
          <div className="h-4 w-5/6 bg-slate-800 rounded"></div>
          <div className="h-4 w-4/6 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 text-slate-400 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span>{error || 'No AI news brief available for this ticker.'}</span>
        </div>
        <button 
          onClick={fetchBrief}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg flex items-center space-x-2 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const confidencePercent = Math.round((brief.sentiment_confidence_score || 0.85) * 100);

  const hasEvents = brief.important_events && (
    (brief.important_events.earnings && brief.important_events.earnings.length > 0) ||
    (brief.important_events.layoffs && brief.important_events.layoffs.length > 0) ||
    (brief.important_events.lawsuits && brief.important_events.lawsuits.length > 0) ||
    (brief.important_events.launches && brief.important_events.launches.length > 0) ||
    (brief.important_events.partnerships && brief.important_events.partnerships.length > 0)
  );

  return (
    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-6 shadow-2xl backdrop-blur-md text-slate-100 transition-all">
      {/* Top Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-md">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-lg text-white">AI News Brief</h3>
              <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-full">
                Gemma 3 AI
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time multi-article synthesis for {companyName || brief.company_name || brief.ticker} ({brief.ticker})
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right">
            <span className="text-xs text-slate-400 block">Confidence Score</span>
            <span className="text-sm font-bold text-emerald-400">{confidencePercent}%</span>
          </div>
          <button 
            onClick={fetchBrief}
            title="Refresh AI Brief"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3-Line Executive Summary */}
      <div className="mb-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3 flex items-center space-x-1.5">
          <Zap className="w-3.5 h-3.5" />
          <span>Executive Summary</span>
        </h4>
        <div className="space-y-2">
          {brief.executive_summary.map((point, i) => (
            <div key={i} className="flex items-start space-x-3 bg-slate-800/50 p-3 rounded-lg border border-slate-800/80">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-200 leading-relaxed">{point}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Drivers: Positive vs Negative */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Positive Drivers */}
        <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-lg p-4">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2.5 flex items-center space-x-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Positive Drivers</span>
          </h5>
          <ul className="space-y-1.5">
            {brief.positive_drivers.map((drv, idx) => (
              <li key={idx} className="flex items-start space-x-2 text-xs text-emerald-200/90">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>{drv}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Negative Drivers */}
        <div className="bg-rose-950/20 border border-rose-500/20 rounded-lg p-4">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2.5 flex items-center space-x-1.5">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>Negative Drivers</span>
          </h5>
          <ul className="space-y-1.5">
            {brief.negative_drivers.map((drv, idx) => (
              <li key={idx} className="flex items-start space-x-2 text-xs text-rose-200/90">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{drv}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Key Risks */}
      {brief.key_risks && brief.key_risks.length > 0 && (
        <div className="mb-6 bg-amber-950/20 border border-amber-500/20 rounded-lg p-4">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2 flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Key Risks</span>
          </h5>
          <ul className="list-disc list-inside space-y-1 text-xs text-amber-200/90">
            {brief.key_risks.map((risk, idx) => (
              <li key={idx}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Categorized Important Events */}
      {hasEvents && (
        <div className="mb-6">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
            Important Events Flagged
          </h5>
          <div className="flex flex-wrap gap-2">
            {brief.important_events.launches?.map((item, i) => (
              <span key={`l-${i}`} className="inline-flex items-center space-x-1 text-xs px-2.5 py-1 bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded-md">
                <Rocket className="w-3 h-3" />
                <span>Launch: {item}</span>
              </span>
            ))}
            {brief.important_events.partnerships?.map((item, i) => (
              <span key={`p-${i}`} className="inline-flex items-center space-x-1 text-xs px-2.5 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/30 rounded-md">
                <Briefcase className="w-3 h-3" />
                <span>Deal: {item}</span>
              </span>
            ))}
            {brief.important_events.lawsuits?.map((item, i) => (
              <span key={`lw-${i}`} className="inline-flex items-center space-x-1 text-xs px-2.5 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-md">
                <Scale className="w-3 h-3" />
                <span>Legal: {item}</span>
              </span>
            ))}
            {brief.important_events.layoffs?.map((item, i) => (
              <span key={`ly-${i}`} className="inline-flex items-center space-x-1 text-xs px-2.5 py-1 bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded-md">
                <Users className="w-3 h-3" />
                <span>Restructuring: {item}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* What Changed Since Yesterday */}
      {brief.what_changed_since_yesterday && (
        <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-lg p-3.5 flex items-start space-x-3">
          <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider block mb-0.5">
              What Changed Since Yesterday?
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              {brief.what_changed_since_yesterday}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
