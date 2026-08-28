export interface Stock {
  ticker: string;
  name: string;
  sentimentScore: number | null; // -1.0 to +1.0 or null if no sentiment data
  price: number;
  changePercent: number;
  currency?: string;
  region?: string;
  volume?: string;
  marketCap?: string;
  sector?: string;
  high52?: number;
  low52?: number;
  peRatio?: number;
  sparkline?: number[];
}

export interface MarketIndex {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
  isPositive: boolean;
}

export interface PortfolioHolding {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  dayChangePercent: number;
  allocationPercent: number;
  sentimentScore: number | null;
  currency: string;
}

export interface AlertItem {
  id: string;
  ticker: string;
  type: 'CRITICAL_DROP' | 'BULLISH_BREAKOUT' | 'HIGH_VOLATILITY' | 'VOLUME_SPIKE';
  title: string;
  message: string;
  sentiment: number;
  timestamp: string | number;
  isRead?: boolean;
}

export interface ArticleItem {
  url: string;
  title?: string;
  content: string;
  date: string;
  source?: string;
  impact?: 'HIGH' | 'MEDIUM' | 'LOW';
  sentiment: Record<string, any> | null;
}

export interface ActivityEvent {
  id: string;
  ticker: string;
  title: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  sentimentScore: number;
  timestamp: number;
}

export interface Sector {
  name: string;
  score: number; // -1.0 to +1.0
  changePercent?: number;
  stockCount?: number;
}

export interface TimelinePoint {
  time: string;
  score: number; // -1.0 to +1.0
}

export interface MarketSentiment {
  overallScore: number;
  trendLabel: 'Bullish' | 'Bearish' | 'Neutral' | 'Strong Bullish' | 'Strong Bearish' | 'Moderate Bullish' | 'Moderate Bearish';
  sectors: Sector[];
  topStocks: Stock[];
  timeline: TimelinePoint[];
  lastUpdated: string;
}

export interface BriefingItem {
  ticker: string;
  bullet: string;
}

export type MainNavTab = 
  | 'dashboard' 
  | 'markets' 
  | 'stocks' 
  | 'watchlist' 
  | 'intelligence' 
  | 'news' 
  | 'analytics' 
  | 'alerts'
  | 'feedback';
