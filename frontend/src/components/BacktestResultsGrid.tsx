import type { BatchBacktestResult } from "../types/stock";

interface BacktestResultsGridProps {
  results: BatchBacktestResult[];
  errors: { symbol: string; error: string }[];
  selectedSymbol: string | null;
  onSelectSymbol: (symbol: string) => void;
}

export default function BacktestResultsGrid({ results, errors, selectedSymbol, onSelectSymbol }: BacktestResultsGridProps) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 bg-tv-base z-10 text-xs text-tv-muted uppercase font-medium">
          <tr className="border-b border-tv-border">
            <th className="px-4 py-2 w-24 border-r border-tv-border/30">Symbol</th>
            <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">Return %</th>
            <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">Win Rate</th>
            <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">Profit Factor</th>
            <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">Max DD</th>
            <th className="px-4 py-2 w-20 text-right">Trades</th>
          </tr>
        </thead>
        <tbody className="text-tv-text divide-y divide-tv-border font-medium">
          {results.map((r) => {
            const isSelected = selectedSymbol === r.symbol;
            return (
              <tr
                key={r.symbol}
                onClick={() => onSelectSymbol(r.symbol)}
                className={`hover:bg-tv-panel transition cursor-pointer ${
                  isSelected ? "bg-tv-panel border-l-2 border-l-tv-blue" : ""
                }`}
              >
                <td className="px-4 py-2.5">
                  <span className={`font-bold ${isSelected ? "text-tv-blue" : "text-tv-text"}`}>
                    {r.symbol}
                  </span>
                </td>
                <td className={`px-4 py-2.5 text-right font-mono ${r.total_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}`}>
                  {r.total_return_pct >= 0 ? "+" : ""}{r.total_return_pct}%
                </td>
                <td className={`px-4 py-2.5 text-right font-mono ${r.win_rate_pct >= 50 ? "text-tv-green" : "text-tv-red"}`}>
                  {r.win_rate_pct}%
                </td>
                <td className={`px-4 py-2.5 text-right font-mono ${r.profit_factor >= 1 ? "text-tv-green" : "text-tv-red"}`}>
                  {r.profit_factor}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-tv-red">
                  -{r.max_drawdown_pct}%
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-tv-muted">
                  {r.trade_count}
                </td>
              </tr>
            );
          })}
          {errors.map((e) => (
            <tr key={e.symbol} className="opacity-50">
              <td className="px-4 py-2.5">
                <span className="font-bold text-tv-red">{e.symbol}</span>
              </td>
              <td colSpan={5} className="px-4 py-2.5 text-tv-red text-xs">
                {e.error}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
