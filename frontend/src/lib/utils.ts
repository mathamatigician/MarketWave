import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const COMPANY_DIRECTORY: Record<string, {
  name: string;
  ticker: string;
  sector: string;
  exchange: string;
  marketCap: string;
  peRatio: number;
  high52: number;
  low52: number;
  basePrice: number;
  currency: string;
}> = {
  "TSLA": { name: "Tesla, Inc.", ticker: "TSLA", sector: "Automotive & Clean Energy", exchange: "NASDAQ", marketCap: "1.12T", peRatio: 84.5, high52: 362.8, low52: 138.8, basePrice: 345.8, currency: "USD" },
  "Tesla": { name: "Tesla, Inc.", ticker: "TSLA", sector: "Automotive & Clean Energy", exchange: "NASDAQ", marketCap: "1.12T", peRatio: 84.5, high52: 362.8, low52: 138.8, basePrice: 345.8, currency: "USD" },
  "AAPL": { name: "Apple Inc.", ticker: "AAPL", sector: "Consumer Electronics", exchange: "NASDAQ", marketCap: "3.48T", peRatio: 34.2, high52: 237.2, low52: 164.1, basePrice: 228.4, currency: "USD" },
  "Apple": { name: "Apple Inc.", ticker: "AAPL", sector: "Consumer Electronics", exchange: "NASDAQ", marketCap: "3.48T", peRatio: 34.2, high52: 237.2, low52: 164.1, basePrice: 228.4, currency: "USD" },
  "GOOG": { name: "Alphabet Inc.", ticker: "GOOG", sector: "Interactive Media & AI", exchange: "NASDAQ", marketCap: "2.14T", peRatio: 24.1, high52: 191.7, low52: 130.6, basePrice: 172.5, currency: "USD" },
  "GOOGL": { name: "Alphabet Inc.", ticker: "GOOGL", sector: "Interactive Media & AI", exchange: "NASDAQ", marketCap: "2.14T", peRatio: 24.1, high52: 191.7, low52: 130.6, basePrice: 172.5, currency: "USD" },
  "Google": { name: "Alphabet Inc.", ticker: "GOOG", sector: "Interactive Media & AI", exchange: "NASDAQ", marketCap: "2.14T", peRatio: 24.1, high52: 191.7, low52: 130.6, basePrice: 172.5, currency: "USD" },
  "MSFT": { name: "Microsoft Corporation", ticker: "MSFT", sector: "Enterprise Software & Cloud", exchange: "NASDAQ", marketCap: "3.20T", peRatio: 36.8, high52: 468.3, low52: 385.2, basePrice: 428.1, currency: "USD" },
  "Microsoft": { name: "Microsoft Corporation", ticker: "MSFT", sector: "Enterprise Software & Cloud", exchange: "NASDAQ", marketCap: "3.20T", peRatio: 36.8, high52: 468.3, low52: 385.2, basePrice: 428.1, currency: "USD" },
  "NVDA": { name: "NVIDIA Corporation", ticker: "NVDA", sector: "Semiconductors & AI Hardware", exchange: "NASDAQ", marketCap: "3.18T", peRatio: 52.4, high52: 140.7, low52: 45.1, basePrice: 128.9, currency: "USD" },
  "Nvidia": { name: "NVIDIA Corporation", ticker: "NVDA", sector: "Semiconductors & AI Hardware", exchange: "NASDAQ", marketCap: "3.18T", peRatio: 52.4, high52: 140.7, low52: 45.1, basePrice: 128.9, currency: "USD" },
  "AMZN": { name: "Amazon.com, Inc.", ticker: "AMZN", sector: "E-Commerce & Cloud Infrastructure", exchange: "NASDAQ", marketCap: "2.05T", peRatio: 41.2, high52: 201.2, low52: 144.0, basePrice: 188.6, currency: "USD" },
  "Amazon": { name: "Amazon.com, Inc.", ticker: "AMZN", sector: "E-Commerce & Cloud Infrastructure", exchange: "NASDAQ", marketCap: "2.05T", peRatio: 41.2, high52: 201.2, low52: 144.0, basePrice: 188.6, currency: "USD" },
  "META": { name: "Meta Platforms, Inc.", ticker: "META", sector: "Social Media & Metaverse", exchange: "NASDAQ", marketCap: "1.45T", peRatio: 27.9, high52: 544.2, low52: 279.4, basePrice: 512.3, currency: "USD" },
  "Meta": { name: "Meta Platforms, Inc.", ticker: "META", sector: "Social Media & Metaverse", exchange: "NASDAQ", marketCap: "1.45T", peRatio: 27.9, high52: 544.2, low52: 279.4, basePrice: 512.3, currency: "USD" },
  "INTC": { name: "Intel Corporation", ticker: "INTC", sector: "Semiconductors", exchange: "NASDAQ", marketCap: "92.4B", peRatio: 18.2, high52: 51.2, low52: 18.8, basePrice: 21.6, currency: "USD" },
  "Intel": { name: "Intel Corporation", ticker: "INTC", sector: "Semiconductors", exchange: "NASDAQ", marketCap: "92.4B", peRatio: 18.2, high52: 51.2, low52: 18.8, basePrice: 21.6, currency: "USD" },
  "RELIANCE.NS": { name: "Reliance Industries Ltd", ticker: "RELIANCE.NS", sector: "Energy & Conglomerate", exchange: "NSE", marketCap: "20.1T ₹", peRatio: 28.4, high52: 3217.9, low52: 2220.3, basePrice: 2980.5, currency: "INR" },
  "Reliance Industries": { name: "Reliance Industries Ltd", ticker: "RELIANCE.NS", sector: "Energy & Conglomerate", exchange: "NSE", marketCap: "20.1T ₹", peRatio: 28.4, high52: 3217.9, low52: 2220.3, basePrice: 2980.5, currency: "INR" },
  "TATAMOTORS.NS": { name: "Tata Motors Limited", ticker: "TATAMOTORS.NS", sector: "Automotive Commercial & EV", exchange: "NSE", marketCap: "3.92T ₹", peRatio: 16.1, high52: 1179.0, low52: 593.5, basePrice: 1045.2, currency: "INR" },
  "Tata Motors": { name: "Tata Motors Limited", ticker: "TATAMOTORS.NS", sector: "Automotive Commercial & EV", exchange: "NSE", marketCap: "3.92T ₹", peRatio: 16.1, high52: 1179.0, low52: 593.5, basePrice: 1045.2, currency: "INR" },
  "INFY.NS": { name: "Infosys Limited", ticker: "INFY.NS", sector: "IT Services & Consulting", exchange: "NSE", marketCap: "7.84T ₹", peRatio: 29.8, high52: 1940.0, low52: 1358.3, basePrice: 1860.0, currency: "INR" },
  "Infosys": { name: "Infosys Limited", ticker: "INFY.NS", sector: "IT Services & Consulting", exchange: "NSE", marketCap: "7.84T ₹", peRatio: 29.8, high52: 1940.0, low52: 1358.3, basePrice: 1860.0, currency: "INR" }
};

export const COMPANY_TICKER_MAP: Record<string, string> = {
  "Tesla": "TSLA",
  "Apple": "AAPL",
  "Google": "GOOG",
  "Alphabet": "GOOG",
  "Microsoft": "MSFT",
  "Nvidia": "NVDA",
  "Amazon": "AMZN",
  "Intel": "INTC",
  "Meta": "META",
  "Reliance Industries": "RELIANCE.NS",
  "Tata Motors": "TATAMOTORS.NS",
  "Infosys": "INFY.NS"
};

export function getSentimentColor(score: number | null | undefined, type: 'text' | 'bg' | 'border' | 'glow' = 'text') {
  if (score === null || score === undefined || isNaN(score)) {
    if (type === 'bg') return 'bg-slate-300 dark:bg-white/10';
    if (type === 'border') return 'border-slate-300 dark:border-white/10';
    if (type === 'glow') return 'shadow-none';
    return 'text-slate-400 dark:text-slate-500';
  }

  const isBullish = score > 0.15;
  const isBearish = score < -0.15;
  
  if (type === 'bg') {
    if (isBullish) return 'bg-[#00E599]';
    if (isBearish) return 'bg-[#FF4757]';
    return 'bg-slate-400/40';
  }
  
  if (type === 'border') {
    if (isBullish) return 'border-[#00E599]/30';
    if (isBearish) return 'border-[#FF4757]/30';
    return 'border-slate-500/20';
  }

  if (type === 'glow') {
    if (isBullish) return 'shadow-[0_0_12px_rgba(0,229,153,0.3)]';
    if (isBearish) return 'shadow-[0_0_12px_rgba(255,71,87,0.3)]';
    return 'shadow-none';
  }

  if (isBullish) return 'text-emerald-500 dark:text-[#00E599]';
  if (isBearish) return 'text-rose-500 dark:text-[#FF4757]';
  return 'text-slate-600 dark:text-slate-400';
}

export function formatPrice(price: number, currency?: string) {
  if (currency === 'INR' || (typeof currency === 'string' && currency.includes('₹'))) {
    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(val: number, includeSign = true) {
  const sign = includeSign && val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export function formatCompactNumber(num: number): string {
  if (Math.abs(num) >= 1.0e12) return (num / 1.0e12).toFixed(2) + "T";
  if (Math.abs(num) >= 1.0e9) return (num / 1.0e9).toFixed(2) + "B";
  if (Math.abs(num) >= 1.0e6) return (num / 1.0e6).toFixed(2) + "M";
  if (Math.abs(num) >= 1.0e3) return (num / 1.0e3).toFixed(1) + "K";
  return num.toFixed(2);
}

/** Extracts the canonical overall_sentiment from an article sentiment object or serialized string. */
export function getArticleSentimentScore(sentiment: any): number | null {
  if (sentiment === null || sentiment === undefined) return null;
  if (typeof sentiment === 'number') {
    return isNaN(sentiment) ? null : sentiment;
  }
  if (typeof sentiment === 'string') {
    try {
      const parsed = JSON.parse(sentiment);
      return getArticleSentimentScore(parsed);
    } catch {
      const num = parseFloat(sentiment);
      return isNaN(num) ? null : num;
    }
  }
  if (typeof sentiment === 'object') {
    if (sentiment.overall_sentiment !== undefined && sentiment.overall_sentiment !== null) {
      const num = Number(sentiment.overall_sentiment);
      return isNaN(num) ? null : num;
    }
    if (sentiment['Overall sentiment'] !== undefined && sentiment['Overall sentiment'] !== null) {
      const num = Number(sentiment['Overall sentiment']);
      return isNaN(num) ? null : num;
    }
    if (sentiment.overallSentiment !== undefined && sentiment.overallSentiment !== null) {
      const num = Number(sentiment.overallSentiment);
      return isNaN(num) ? null : num;
    }
    if (sentiment.score !== undefined && sentiment.score !== null) {
      const num = Number(sentiment.score);
      return isNaN(num) ? null : num;
    }
  }
  return null;
}

/** Formats an article score and its categorical label according to institutional standards. */
export function formatArticleSentiment(score: number | null): {
  scoreText: string;
  labelText: string;
  colorClass: string;
  badgeClass: string;
  hasScore: boolean;
} {
  if (score === null || score === undefined || isNaN(score)) {
    return {
      scoreText: 'Score: --',
      labelText: 'NEUTRAL',
      colorClass: 'text-slate-400 dark:text-slate-500',
      badgeClass: 'badge-neutral',
      hasScore: false
    };
  }
  const formatted = score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
  const isBullish = score > 0.15;
  const isBearish = score < -0.15;
  const label = isBullish ? (score > 0.5 ? 'STRONG BULLISH' : 'BULLISH') : isBearish ? (score < -0.5 ? 'STRONG BEARISH' : 'BEARISH') : 'NEUTRAL';
  const color = isBullish ? 'text-emerald-500 dark:text-[#00E599]' : isBearish ? 'text-rose-500 dark:text-[#FF4757]' : 'text-slate-600 dark:text-slate-400';
  const badge = isBullish ? 'badge-bullish' : isBearish ? 'badge-bearish' : 'badge-neutral';

  return {
    scoreText: `Score: ${formatted}`,
    labelText: label,
    colorClass: color,
    badgeClass: badge,
    hasScore: true
  };
}

export function generateSyntheticSparkline(basePrice: number, changePercent: number): number[] {
  const points = 10;
  const arr: number[] = [];
  const startPrice = basePrice / (1 + changePercent / 100);
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const noise = (Math.sin(i * 1.5) * 0.4 + (Math.random() - 0.5) * 0.3) * (basePrice * 0.01);
    const val = startPrice + (basePrice - startPrice) * progress + noise;
    arr.push(Number(val.toFixed(2)));
  }
  return arr;
}
