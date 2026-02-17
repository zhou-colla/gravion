import { useState } from "react";
import type { StockDetail, BacktestResultData, TradeEntry } from "../types/stock";

interface DetailInspectorProps {
  detail: StockDetail | null;
  loading: boolean;
  onClose: () => void;
  backtestResult: BacktestResultData | null;
  backtestLoading: boolean;
  onTradeClick: (trade: TradeEntry) => void;
}

function formatMarketCap(value: number | null): string {
  if (value === null || value === undefined) return "--";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

function SkeletonLine({ width = "w-full" }: { width?: string }) {
  return <div className={`h-4 ${width} bg-tv-border/50 rounded animate-pulse`} />;
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-tv-muted text-xs">{label}</span>
      <span className={`font-mono text-xs ${color || "text-tv-text"}`}>{value}</span>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-tv-panel rounded p-2.5 border border-tv-border/30">
      <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-sm font-bold ${color || "text-tv-text"}`}>{value}</div>
    </div>
  );
}

export default function DetailInspector({ detail, loading, onClose, backtestResult, backtestLoading, onTradeClick }: DetailInspectorProps) {
  const [activeTab, setActiveTab] = useState<"fundamentals" | "backtester">("fundamentals");

  if (loading) {
    return (
      <aside className="w-[280px] border-l border-tv-border bg-tv-base flex flex-col shrink-0">
        <div className="h-9 border-b border-tv-border flex items-center px-4 justify-between shrink-0">
          <SkeletonLine width="w-24" />
        </div>
        <div className="p-4 space-y-4">
          <SkeletonLine width="w-32" />
          <div className="space-y-3">
            <SkeletonLine />
            <SkeletonLine width="w-3/4" />
            <SkeletonLine />
            <SkeletonLine width="w-2/3" />
          </div>
          <div className="h-px bg-tv-border" />
          <div className="space-y-3">
            <SkeletonLine />
            <SkeletonLine width="w-3/4" />
            <SkeletonLine />
          </div>
        </div>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="w-[280px] border-l border-tv-border bg-tv-base flex flex-col items-center justify-center shrink-0">
        <div className="text-center px-6">
          <div className="w-12 h-12 bg-tv-panel rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-tv-muted text-xs">Select a stock to view details</p>
        </div>
      </aside>
    );
  }

  const f = detail.fundamentals;
  const lastPrice = detail.ohlc.length > 0 ? detail.ohlc[detail.ohlc.length - 1].close : null;
  const isFromCache = detail.from_cache;

  return (
    <aside className="w-[280px] border-l border-tv-border bg-tv-base flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="h-9 border-b border-tv-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="font-bold text-tv-text truncate">{detail.symbol}</span>
          <span className="text-tv-muted text-xs truncate">{detail.company_name}</span>
          {isFromCache && (
            <span className="text-[9px] text-tv-muted bg-tv-panel border border-tv-border/50 rounded px-1 shrink-0">cached</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-tv-muted hover:text-tv-text transition p-1 ml-2 shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-tv-border shrink-0">
        <button
          onClick={() => setActiveTab("fundamentals")}
          className={`flex-1 py-2 text-xs font-medium transition cursor-pointer ${
            activeTab === "fundamentals"
              ? "text-tv-blue border-b-2 border-tv-blue"
              : "text-tv-muted hover:text-tv-text"
          }`}
        >
          Fundamentals
        </button>
        <button
          onClick={() => setActiveTab("backtester")}
          className={`flex-1 py-2 text-xs font-medium transition cursor-pointer ${
            activeTab === "backtester"
              ? "text-tv-blue border-b-2 border-tv-blue"
              : "text-tv-muted hover:text-tv-text"
          }`}
        >
          Backtester
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "fundamentals" && (
          <div className="p-4 space-y-4">
            {/* Fundamentals */}
            <div>
              <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">Fundamentals</h4>
              <div className="divide-y divide-tv-border/30">
                <StatRow label="PE Ratio" value={f.pe_ratio !== null ? f.pe_ratio.toFixed(2) : "--"} />
                <StatRow label="Market Cap" value={formatMarketCap(f.market_cap)} />
                <StatRow label="Next Earnings" value={f.earnings_date || "--"} />
                <StatRow label="Sector" value={f.sector || "--"} />
              </div>
            </div>

            <div className="h-px bg-tv-border" />

            {/* Price Statistics */}
            <div>
              <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">Price Statistics</h4>
              <div className="divide-y divide-tv-border/30">
                <StatRow
                  label="52W High"
                  value={f.fifty_two_week_high !== null ? `$${f.fifty_two_week_high.toFixed(2)}` : "--"}
                  color="text-tv-green"
                />
                <StatRow
                  label="52W Low"
                  value={f.fifty_two_week_low !== null ? `$${f.fifty_two_week_low.toFixed(2)}` : "--"}
                  color="text-tv-red"
                />
                {lastPrice !== null && (
                  <StatRow label="Current" value={`$${lastPrice.toFixed(2)}`} />
                )}
                {detail.current_rsi !== null && detail.current_rsi !== undefined && (
                  <StatRow
                    label="RSI(14)"
                    value={detail.current_rsi.toFixed(1)}
                    color={detail.current_rsi < 30 ? "text-tv-green" : detail.current_rsi > 70 ? "text-tv-red" : "text-tv-text"}
                  />
                )}
              </div>
            </div>

            {/* 52W Range Bar */}
            {f.fifty_two_week_high !== null && f.fifty_two_week_low !== null && lastPrice !== null && (
              <>
                <div className="h-px bg-tv-border" />
                <div>
                  <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">52 Week Range</h4>
                  <div className="relative h-1.5 bg-tv-border rounded-full">
                    <div
                      className="absolute h-1.5 bg-tv-blue rounded-full"
                      style={{
                        left: "0%",
                        width: `${Math.min(100, Math.max(0, ((lastPrice - f.fifty_two_week_low) / (f.fifty_two_week_high - f.fifty_two_week_low)) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-tv-muted">
                    <span>${f.fifty_two_week_low.toFixed(0)}</span>
                    <span>${f.fifty_two_week_high.toFixed(0)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "backtester" && (
          <div className="p-4 space-y-4">
            {backtestLoading && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-tv-blue border-t-transparent rounded-full animate-spin mb-2" />
                <p className="text-tv-muted text-xs">Running backtest...</p>
              </div>
            )}

            {!backtestLoading && !backtestResult && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-10 h-10 bg-tv-panel rounded-full flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-tv-muted text-xs text-center">Select a strategy and click Run to see backtest results</p>
              </div>
            )}

            {!backtestLoading && backtestResult && (
              <>
                {/* Performance Summary */}
                <div>
                  <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">
                    {backtestResult.strategy_name}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard
                      label="Total Return"
                      value={`${backtestResult.total_return_pct >= 0 ? "+" : ""}${backtestResult.total_return_pct}%`}
                      color={backtestResult.total_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}
                    />
                    <MetricCard
                      label="Win Rate"
                      value={`${backtestResult.win_rate_pct}%`}
                      color={backtestResult.win_rate_pct >= 50 ? "text-tv-green" : "text-tv-red"}
                    />
                    <MetricCard
                      label="Profit Factor"
                      value={`${backtestResult.profit_factor}`}
                      color={backtestResult.profit_factor >= 1 ? "text-tv-green" : "text-tv-red"}
                    />
                    <MetricCard
                      label="Max Drawdown"
                      value={`-${backtestResult.max_drawdown_pct}%`}
                      color="text-tv-red"
                    />
                  </div>
                </div>

                <div className="h-px bg-tv-border" />

                {/* Transaction Log */}
                <div>
                  <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">
                    Transactions ({backtestResult.trades.length})
                  </h4>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {backtestResult.trades.map((trade, i) => (
                      <button
                        key={i}
                        onClick={() => onTradeClick(trade)}
                        className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-tv-panel transition text-left cursor-pointer"
                      >
                        <div className="flex items-center space-x-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            trade.type === "BUY"
                              ? "bg-tv-green/10 text-tv-green"
                              : "bg-tv-red/10 text-tv-red"
                          }`}>
                            {trade.type}
                          </span>
                          <span className="text-tv-muted text-[10px]">{trade.date}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] text-tv-text">${trade.price.toFixed(2)}</span>
                          {trade.type === "SELL" && (
                            <span className={`font-mono text-[10px] ${trade.pnl >= 0 ? "text-tv-green" : "text-tv-red"}`}>
                              {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                    {backtestResult.trades.length === 0 && (
                      <p className="text-tv-muted text-xs text-center py-2">No trades generated</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
