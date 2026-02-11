export interface StockRow {
  symbol: string;
  name: string;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number;
  change_percent: number;
  last_fetched: string | null;
  timestamp: string;
  signal: string;
  yoy_growth: number | null;
}

export interface DbInfo {
  path: string;
  size_bytes: number;
  stock_count: number;
}

export interface OhlcDataPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LineDataPoint {
  time: string;
  value: number;
}

export interface Fundamentals {
  pe_ratio: number | null;
  market_cap: number | null;
  earnings_date: string | null;
  sector: string | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
}

export interface StockDetail {
  success: boolean;
  symbol: string;
  company_name: string;
  ohlc: OhlcDataPoint[];
  ma50: LineDataPoint[];
  ma100: LineDataPoint[];
  volume: LineDataPoint[];
  fundamentals: Fundamentals;
}
