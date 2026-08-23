export interface Stock {
  ticker: string;
  name: string;
  sentimentScore: number; // -1.0 to +1.0
  price: number;
  changePercent: number;
  currency?: string;
  region?: string;
}

export interface Sector {
  name: string;
  score: number; // -1.0 to +1.0
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
