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

export interface ImportantEvents {
  earnings?: string[];
  layoffs?: string[];
  lawsuits?: string[];
  launches?: string[];
  partnerships?: string[];
}

export interface AINewsBrief {
  ticker: string;
  company_name: string;
  executive_summary: string[];
  positive_drivers: string[];
  negative_drivers: string[];
  key_risks: string[];
  important_events: ImportantEvents;
  sentiment_confidence_score: number;
  what_changed_since_yesterday: string;
}
