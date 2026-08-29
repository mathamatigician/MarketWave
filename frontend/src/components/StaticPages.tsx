import { MapPin, Phone, HelpCircle, Send, Activity } from 'lucide-react';

export function About() {
  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in duration-300 py-10 space-y-8">
      <div className="surface-card p-8 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full surface-inset text-emerald-600 dark:text-[#00E599] text-xs font-mono font-bold">
          <Activity className="w-3.5 h-3.5" />
          <span>SYSTEM ARCHITECTURE & MISSION</span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight dark:text-white text-slate-900">
          About MarketWave Financial Intelligence
        </h2>
        
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            MarketWave operates at the intersection of quantitative finance and real-time natural language processing. Global markets generate tens of thousands of headlines, filings, and earnings reports every minute. We synthesize this chaotic stream into structured 18-factor algorithmic sentiment signals.
          </p>
          <p>
            Our multi-agent pipeline leverages dedicated News Researchers, Sentiment Analysts, and Price Correlators to deliver dual-signal market trajectories, watchdog anomaly detection, and real-time AI briefings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-white/10">
          <div className="surface-inset p-4 rounded-xl space-y-1">
            <span className="text-[10px] font-mono uppercase text-emerald-600 dark:text-[#00E599] font-bold">Mission</span>
            <div className="text-base font-bold text-slate-900 dark:text-white">Institutional Data Transparency</div>
            <p className="text-xs text-slate-500">Democratizing high-frequency algorithmic signals for everyday investors.</p>
          </div>
          <div className="surface-inset p-4 rounded-xl space-y-1">
            <span className="text-[10px] font-mono uppercase text-cyan-500 font-bold">Latency Standard</span>
            <div className="text-base font-bold text-slate-900 dark:text-white">Sub-Second WebSocket Pipeline</div>
            <p className="text-xs text-slate-500">Dual-triage model inference backed by Google Cloud Platform.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Contact() {
  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in duration-300 py-10 space-y-8">
      <div className="surface-card p-8 space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold dark:text-white text-slate-900">
            Contact & Operations
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Reach out to our engineering and research team.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 pt-2">
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl surface-inset text-emerald-500 dark:text-[#00E599] shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">Direct Line</div>
                <a 
                  href="tel:+918660682508"
                  className="font-mono text-base font-bold text-slate-900 dark:text-white hover:text-emerald-500 dark:hover:text-[#00E599] transition-colors"
                >
                  +91 86606 82508
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl surface-inset text-emerald-500 dark:text-[#00E599] shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">Headquarters</div>
                <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-mono mt-0.5">
                  HSR Layout, Bangalore<br/>
                  Karnataka, India
                </div>
              </div>
            </div>
          </div>

          <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
            <input 
              type="text" 
              placeholder="Your Name" 
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500" 
            />
            <input 
              type="email" 
              placeholder="Your Email" 
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500" 
            />
            <textarea 
              placeholder="Your Message..." 
              rows={3} 
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 resize-none"
            />
            <button className="w-full btn-primary text-xs py-2 rounded-xl">
              <Send className="w-3.5 h-3.5" />
              <span>Send Message</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  const faqs = [
    {
      q: "What defines MarketWave's sentiment score?",
      a: "Our sentiment score ranges from -1.0 (extremely bearish) to +1.0 (extremely bullish). It is compiled across 18 distinct financial topics (Earnings, Layoffs, Product Launches, Regulatory, Restructuring, etc.) using dual-triage NLP models."
    },
    {
      q: "How frequently does the platform refresh data?",
      a: "MarketWave maintains an active WebSocket WSS live feed for real-time article ingestion alongside a scheduled 300-second (5-minute) consistency refresh across all active watchlist equities."
    },
    {
      q: "How does the AI Financial Copilot work?",
      a: "The Copilot runs an autonomous multi-agent hierarchy consisting of a News Researcher, Sentiment Analyst, and Market Correlator that work together in real-time to answer complex financial queries."
    }
  ];

  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in duration-300 py-10 space-y-6">
      <div className="surface-card p-8 space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold dark:text-white text-slate-900">
            Frequently Asked Questions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Key details about MarketWave algorithmic scoring and data pipelines.
          </p>
        </div>

        <div className="space-y-4 pt-2">
          {faqs.map((f, idx) => (
            <div key={idx} className="surface-inset p-4 rounded-xl space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-500 dark:text-[#00E599]" />
                {f.q}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-6">
                {f.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
