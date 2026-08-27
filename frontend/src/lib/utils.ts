import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSentimentColor(score: number | null | undefined, type: 'text' | 'bg' | 'border' = 'text') {
  if (score === null || score === undefined || isNaN(score)) {
    if (type === 'bg') return 'bg-slate-300 dark:bg-white/10';
    if (type === 'border') return 'border-slate-300 dark:border-white/10';
    return 'text-slate-400 dark:text-white/40';
  }

  // Adapted for actual MarketWave sentiment range (-1.0 to 1.0)
  const isBullish = score > 0.15;
  const isBearish = score < -0.15;
  
  if (type === 'bg') {
    if (isBullish) return 'bg-[#00FF94]';
    if (isBearish) return 'bg-[#FF3E3E]';
    return 'bg-white/20';
  }
  
  if (type === 'border') {
    if (isBullish) return 'border-[#00FF94]/20';
    if (isBearish) return 'border-[#FF3E3E]/20';
    return 'border-white/10';
  }

  // text
  if (isBullish) return 'text-[#00FF94]';
  if (isBearish) return 'text-[#FF3E3E]';
  return 'text-slate-600 dark:text-white/60';
}

export function formatPrice(price: number, currency?: string) {
  if (currency === 'INR') {
    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  hasScore: boolean;
} {
  if (score === null || score === undefined || isNaN(score)) {
    return {
      scoreText: 'Score: --',
      labelText: 'DATA PENDING',
      colorClass: 'text-slate-400 dark:text-white/40',
      hasScore: false
    };
  }
  const formatted = score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
  const label = score > 0.15 ? 'BULLISH' : score < -0.15 ? 'BEARISH' : 'NEUTRAL';
  const color = score > 0.15 ? 'text-emerald-500 dark:text-[#00FF94]' : score < -0.15 ? 'text-rose-500 dark:text-[#FF3E3E]' : 'text-slate-600 dark:text-white/70';

  return {
    scoreText: `Score: ${formatted}`,
    labelText: label,
    colorClass: color,
    hasScore: true
  };
}
