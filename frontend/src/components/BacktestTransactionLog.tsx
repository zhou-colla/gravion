import type { BatchBacktestResult } from "../types/stock";

interface BacktestTransactionLogProps {
  result: BatchBacktestResult;
  strategyName?: string;
  onClose: () => void;
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-tv-panel rounded p-2.5 border border-tv-border/30">
      <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-sm font-bold ${color || "text-tv-text"}`}>{value}</div>
    </div>
  );
}

export default function BacktestTransactionLog({ result, strategyName, onClose }: BacktestTransactionLogProps) {
  return (
    <aside className="w-[280px] border-l border-tv-border bg-tv-base flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="h-9 border-b border-tv-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-tv-text truncate">{result.symbol}</span>
          {strategyName && (
            <span className="text-[10px] text-tv-muted truncate">· {strategyName}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-tv-muted hover:text-tv-text transition p-1 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Metrics */}
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Return"
            value={`${result.total_return_pct >= 0 ? "+" : ""}${result.total_return_pct}%`}
            color={result.total_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}
          />
          <MetricCard
            label="Win Rate"
            value={`${result.win_rate_pct}%`}
            color={result.win_rate_pct >= 50 ? "text-tv-green" : "text-tv-red"}
          />
          <MetricCard
            label="Profit Factor"
            value={`${result.profit_factor}`}
            color={result.profit_factor >= 1 ? "text-tv-green" : "text-tv-red"}
          />
          <MetricCard
            label="Max Drawdown"
            value={`-${result.max_drawdown_pct}%`}
            color="text-tv-red"
          />
        </div>
      </div>

      <div className="h-px bg-tv-border mx-3" />

      {/* Transaction Log */}
      <div className="flex-1 overflow-y-auto p-3">
        <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">
          Transactions ({result.trades.length})
        </h4>
        <div className="space-y-1">
          {result.trades.map((trade, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-tv-panel transition text-left"
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
            </div>
          ))}
          {result.trades.length === 0 && (
            <p className="text-tv-muted text-xs text-center py-2">No trades generated</p>
          )}
        </div>
      </div>
    </aside>
  );
}
