import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSentimentColor(score: number, type: 'text' | 'bg' | 'border' = 'text') {
  // Adapted for actual GlobePulse sentiment range (-1.0 to 1.0)
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
  return 'text-white/60';
}

export function formatPrice(price: number, currency?: string) {
  if (currency === 'INR') {
    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
