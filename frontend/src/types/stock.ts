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

export interface StrategyInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  builtin: boolean;
}

export interface TradeEntry {
  date: string;
  type: "BUY" | "SELL";
  price: number;
  shares: number;
  pnl: number;
}

export interface BacktestResultData {
  strategy_name: string;
  symbol: string;
  total_return_pct: number;
  win_rate_pct: number;
  profit_factor: number;
  max_drawdown_pct: number;
  trades: TradeEntry[];
}

export interface StrategyCondition {
  indicator: string;
  period: number;
  comparator: string;
  value: number;
}

export interface JsonStrategyDefinition {
  name: string;
  description: string;
  buy_conditions: StrategyCondition[];
  sell_conditions: StrategyCondition[];
}
