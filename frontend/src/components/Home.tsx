import { 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Layers, 
  Globe2, 
  Activity, 
  Cpu, 
  Bot 
} from 'lucide-react';

interface HomeProps {
  onEnter: () => void;
}

export function Home({ onEnter }: HomeProps) {
  return (
    <div className="space-y-16 py-8 sm:py-16 animate-in fade-in duration-500 max-w-6xl mx-auto">
      
      {/* 1. Hero Section */}
      <div className="text-center space-y-6 max-w-4xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full surface-inset text-emerald-600 dark:text-[#00E599] text-xs font-mono font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 live-beacon"></span>
          <span>MARKETWAVE FINANCIAL INTELLIGENCE v2.5</span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight dark:text-white text-slate-900 leading-[1.08]">
          Institutional Market Sentiment. <br />
          <span className="bg-gradient-to-r from-emerald-500 via-cyan-400 to-indigo-500 bg-clip-text text-transparent">
            Synthesized in Real-Time.
          </span>
        </h1>

        <p className="text-sm sm:text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Transform unorganized market news, regulatory filings, and earnings into actionable 18-factor algorithmic sentiment signals and multi-agent AI briefings.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            onClick={onEnter}
            className="btn-primary text-sm px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/20 font-bold"
          >
            <span>Launch Market Terminal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Live Interactive Stats Barometer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4">
        {[
          { label: 'Token Ingestion Latency', value: '< 120ms', icon: Zap, color: 'text-amber-400' },
          { label: 'Scored News Sources', value: '1.4M+', icon: Globe2, color: 'text-emerald-500 dark:text-[#00E599]' },
          { label: 'Semantic Accuracy', value: '96.4%', icon: ShieldCheck, color: 'text-cyan-400' },
          { label: 'Active Topic Dimensions', value: '18 Factors', icon: Layers, color: 'text-indigo-400' },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="surface-card p-5 space-y-1 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">{stat.label}</span>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 dark:text-white">
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
        <div className="surface-card p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-[#00E599]">
            <Activity className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Dual-Signal Price & Sentiment
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Overlay historical stock candlestick charts with normalized daily news sentiment on independent axes to uncover market divergences.
          </p>
        </div>

        <div className="surface-card p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-500">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Gemma AI Market Briefings
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Institutional synthesis condensing breaking developments into directional signal chips with identified key market drivers.
          </p>
        </div>

        <div className="surface-card p-6 space-y-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Bot className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Multi-Agent Financial Copilot
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Concurrently queries news researchers, sentiment analysts, and price correlators to provide deep contextual answers.
          </p>
        </div>
      </div>

    </div>
  );
}
