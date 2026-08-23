import { Activity, ArrowRight } from 'lucide-react';

export function Home({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="flex flex-col h-full justify-center items-center text-center animate-in fade-in zoom-in duration-700 py-12">
      <div className="mb-8">
        <Activity className="w-24 h-24 md:w-32 md:h-32 text-emerald-500 dark:text-[#00FF94] mx-auto mb-6" />
        <h1 className="text-5xl md:text-8xl font-black tracking-tighter uppercase mb-4 dark:text-white text-slate-950">
          GlobePulse<span className="text-emerald-500 dark:text-[#00FF94]">AI</span>
        </h1>
        <p className="text-sm md:text-base uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 max-w-2xl mx-auto leading-relaxed">
          The next generation of algorithmic sentiment analysis. 
          Real-time global market mood tracking powered by advanced artificial intelligence.
        </p>
      </div>
      
      <button 
        onClick={onEnter}
        className="group relative inline-flex items-center justify-center gap-4 dark:bg-white bg-slate-900 dark:text-black text-white px-8 py-4 text-sm md:text-base font-black uppercase tracking-widest hover:bg-emerald-500 dark:hover:bg-[#00FF94] hover:text-white dark:hover:text-black transition-all duration-300 mt-4 rounded shadow-lg"
      >
        <span>Initialize Engine</span>
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>

      <div className="mt-20 flex gap-8 md:gap-16 text-left">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] dark:text-white/40 text-slate-500 mb-2 font-semibold">Latency</div>
          <div className="font-mono text-xl md:text-2xl font-black text-emerald-600 dark:text-[#00FF94]">12ms</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] dark:text-white/40 text-slate-500 mb-2 font-semibold">Data Sources</div>
          <div className="font-mono text-xl md:text-2xl font-black dark:text-white text-slate-900">1.4M+</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] dark:text-white/40 text-slate-500 mb-2 font-semibold">Accuracy</div>
          <div className="font-mono text-xl md:text-2xl font-black text-emerald-600 dark:text-[#00FF94]">94.2%</div>
        </div>
      </div>
    </div>
  );
}
