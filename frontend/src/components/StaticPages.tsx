import { MapPin, Phone, ChevronRight } from 'lucide-react';

export function About() {
  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in duration-500 py-8 sm:py-12">
      <label className="text-[11px] uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-4 sm:mb-6">About the Engine</label>
      <h2 className="text-3xl sm:text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-8 sm:mb-12">MarketWave<span className="text-[#00FF94] dark:text-[#00FF94] text-emerald-500">AI</span></h2>
      
      <div className="grid md:grid-cols-2 gap-8 sm:gap-12 dark:text-white/80 text-slate-700">
        <div className="space-y-6">
          <p className="text-base sm:text-lg leading-relaxed">
            We operate at the intersection of quantitative finance and artificial intelligence, translating the noise of global markets into clear, actionable signals.
          </p>
          <p className="text-sm font-mono dark:text-white/60 text-slate-500 leading-relaxed">
            Built originally for institutional operators, our sentiment engine processes millions of data points per second—from global news feeds, social trends, and market velocity metrics. 
          </p>
        </div>
        
        <div className="border-l-2 dark:border-[#00FF94] border-emerald-500 pl-6 space-y-8">
          <div>
            <div className="text-[10px] uppercase tracking-widest dark:text-[#00FF94] text-emerald-600 mb-2 font-bold">Mission Directive</div>
            <div className="text-xl font-bold uppercase italic tracking-tight">Total Market Clarity</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest dark:text-[#00FF94] text-emerald-600 mb-2 font-bold">Architecture</div>
            <div className="text-xl font-bold uppercase italic tracking-tight">Real-time Transformer Models</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Contact() {
  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in duration-500 py-8 sm:py-12">
      <label className="text-[11px] uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-4 sm:mb-6">Communications</label>
      <h2 className="text-3xl sm:text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-8 sm:mb-12">Contact</h2>
      
      <div className="dark:bg-white/5 bg-slate-50 border dark:border-white/10 border-slate-200 p-5 sm:p-8 rounded-xl grid md:grid-cols-2 gap-8 sm:gap-12">
        <div className="space-y-6 sm:space-y-8">
          <div className="flex items-start gap-4">
            <div className="p-3 dark:bg-white/10 bg-slate-200 rounded-sm shrink-0">
              <Phone className="w-5 h-5 sm:w-6 sm:h-6 dark:text-[#00FF94] text-emerald-600" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest dark:text-white/40 text-slate-500 mb-1 font-bold">Direct Contact (Kiran)</div>
              <a 
                href="tel:+918660682508"
                className="font-mono text-base sm:text-lg font-bold hover:text-emerald-500 dark:hover:text-[#00FF94] transition-colors"
              >
                +91 86606 82508
              </a>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-3 dark:bg-white/10 bg-slate-200 rounded-sm shrink-0">
              <MapPin className="w-5 h-5 sm:w-6 sm:h-6 dark:text-[#00FF94] text-emerald-600" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest dark:text-white/40 text-slate-500 mb-1 font-bold">Headquarters</div>
              <div className="font-mono text-xs sm:text-sm leading-relaxed dark:text-white/80 text-slate-700">
                HSR Layout<br/>
                Bangalore, Karnataka<br/>
                India
              </div>
            </div>
          </div>
        </div>
        
        <div>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <input type="text" placeholder="Operator Name" className="w-full dark:bg-black/50 bg-white border dark:border-white/10 border-slate-300 p-3 text-sm font-mono dark:text-white text-slate-900 dark:placeholder-white/20 placeholder-slate-400 focus:outline-none dark:focus:border-[#00FF94] focus:border-emerald-500 transition-colors rounded-lg" />
            <input type="email" placeholder="Return Address" className="w-full dark:bg-black/50 bg-white border dark:border-white/10 border-slate-300 p-3 text-sm font-mono dark:text-white text-slate-900 dark:placeholder-white/20 placeholder-slate-400 focus:outline-none dark:focus:border-[#00FF94] focus:border-emerald-500 transition-colors rounded-lg" />
            <textarea placeholder="Transmit Message..." rows={4} className="w-full dark:bg-black/50 bg-white border dark:border-white/10 border-slate-300 p-3 text-sm font-mono dark:text-white text-slate-900 dark:placeholder-white/20 placeholder-slate-400 focus:outline-none dark:focus:border-[#00FF94] focus:border-emerald-500 transition-colors resize-none rounded-lg"></textarea>
            <button className="w-full dark:bg-white bg-slate-900 dark:text-black text-white p-3 text-xs font-black uppercase tracking-widest dark:hover:bg-[#00FF94] hover:bg-emerald-500 transition-colors rounded-lg">
              Transmit Message
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
      q: "What defines MarketWaveAI's sentiment score?",
      a: "Our sentiment score ranges from -1.0 (extremely bearish) to +1.0 (extremely bullish). It is compiled by our advanced agentic pipelines (Orchestrator, ResearchAgent, SentimentAnalyst, and MarketCorrelator) reading from Firestore datastores. A score > 0.15 indicates bullish divergence; < -0.15 signals bearish pressure."
    },
    {
      q: "How frequently is the data stream updated?",
      a: "The dashboard runs a near-real-time synchronization loop, invoking our Google Antigravity Agent and pipeline updates to ingest and score recent news."
    },
    {
      q: "Where is the physical infrastructure located?",
      a: "Our core compute clusters operate out of Tier-4 facilities, managed from our central command in HSR Layout, Bangalore."
    },
    {
      q: "Can I integrate the API into my own terminal?",
      a: "Yes. Authenticated operators are granted dedicated endpoints and real-time WebSocket agent connections for raw data streams."
    }
  ];

  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in duration-500 py-12">
      <label className="text-[11px] uppercase tracking-[0.4em] dark:text-white/40 text-slate-500 block mb-6">Knowledge Base</label>
      <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter mb-12">System FAQ</h2>
      
      <div className="space-y-6">
        {faqs.map((faq, i) => (
          <div key={i} className="border dark:border-white/10 border-slate-200 dark:bg-white/5 bg-slate-50 p-6 group dark:hover:border-white/30 hover:border-slate-300 transition-colors">
            <div className="flex gap-4 items-start">
              <div className="mt-1">
                <ChevronRight className="w-5 h-5 dark:text-[#00FF94] text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold uppercase italic tracking-tight mb-3">{faq.q}</h3>
                <p className="text-sm font-mono dark:text-white/60 text-slate-600 leading-relaxed">{faq.a}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
