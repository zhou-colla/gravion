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
  signals: Record<string, string>;
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

export interface MacdDataPoint {
  time: string;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerDataPoint {
  time: string;
  upper: number;
  middle: number;
  lower: number;
}

export interface StockDetail {
  success: boolean;
  symbol: string;
  company_name: string;
  from_cache: boolean;
  data_points: number;
  ohlc: OhlcDataPoint[];
  ma50: LineDataPoint[];
  ma100: LineDataPoint[];
  volume: LineDataPoint[];
  rsi: LineDataPoint[];
  current_rsi: number | null;
  macd: MacdDataPoint[];
  bollinger: BollingerDataPoint[];
  fundamentals: Fundamentals;
}

export interface ParamMeta {
  label: string;
  type: "int" | "float";
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface StrategyInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  param_meta?: Record<string, ParamMeta>;
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
  equity_curve: EquityCurvePoint[];
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

export interface BatchBacktestRequest {
  symbols: string[];
  strategy_name?: string;
  strategy_json?: Record<string, unknown>;
  start_date?: string;
  end_date?: string;
  period?: string;
  initial_capital_per_stock?: number;
}

export interface BatchBacktestSummary {
  portfolio_return_pct: number;
  avg_win_rate_pct: number;
  total_trades: number;
  best_ticker: string | null;
  worst_ticker: string | null;
}

export interface BatchBacktestResult {
  symbol: string;
  total_return_pct: number;
  win_rate_pct: number;
  profit_factor: number;
  max_drawdown_pct: number;
  trade_count: number;
  trades: TradeEntry[];
  equity_curve: EquityCurvePoint[];
  data_start?: string;
  data_end?: string;
  from_cache?: boolean;
}

export interface BatchBacktestResponse {
  success: boolean;
  summary: BatchBacktestSummary;
  results: BatchBacktestResult[];
  errors: { symbol: string; error: string }[];
  date_range: { start: string; end: string };
}

export interface EquityCurvePoint {
  time: string;
  value: number;
}

export interface AppSettings {
  data_source: "yahoo_finance" | "moomoo_opend" | "tushare";
  global_start_date: string;
  global_end_date: string;
}

export interface Portfolio {
  id: number;
  name: string;
  is_system: boolean;
  symbol_count: number;
}

export interface PortfolioDetail extends Portfolio {
  symbols: string[];
}

export interface OptimizeParamSweep {
  param: string;
  values: number[];
}

export interface OptimizeResult {
  params: Record<string, number>;
  total_return_pct: number;
  win_rate_pct: number;
  profit_factor: number;
  max_drawdown_pct: number;
  trade_count: number;
  error?: string;
}

export interface OptimizeResponse {
  success: boolean;
  symbol: string;
  strategy_name: string;
  date_range: { start: string; end: string };
  combinations_tested: number;
  results: OptimizeResult[];
  error?: string;
}

export interface FilterCondition {
  indicator: "price" | "ma50" | "ma100" | "rsi" | "change_pct" | "volume";
  comparator: ">" | "<" | ">=" | "<=";
  value: number | "price" | "ma50" | "ma100" | "rsi" | "change_pct" | "volume";
}

export interface FilterInfo {
  name: string;
  description: string;
  builtin: boolean;
  conditions: FilterCondition[];
}
