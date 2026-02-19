import type { BatchBacktestResult } from "../types/stock";
import type { Translation } from "../i18n";

interface StrategyResultSet {
  strategyName: string;
  color: string;
  results: BatchBacktestResult[];
  errors: { symbol: string; error: string }[];
}

interface BacktestResultsGridProps {
  allResults: StrategyResultSet[];
  selectedResult: { symbol: string; strategyName: string } | null;
  onSelectResult: (result: { symbol: string; strategyName: string }) => void;
  t: Translation;
}

function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function fmtDateRange(start?: string, end?: string): string {
  if (!start || !end) return "";
  const fmt = (d: string) => {
    const [, m, day] = d.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m) - 1]} ${parseInt(day)}`;
  };
  return `${fmt(start)} → ${fmt(end)}`;
}

export default function BacktestResultsGrid({ allResults, selectedResult, onSelectResult, t }: BacktestResultsGridProps) {
  const isMulti = allResults.length > 1;

  if (!isMulti) {
    /* ── Single-strategy layout (original feel) ── */
    const { strategyName, color, results, errors } = allResults[0];
    return (
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-tv-base z-10 text-xs text-tv-muted uppercase font-medium">
            <tr className="border-b border-tv-border">
              <th className="px-4 py-2 w-24 border-r border-tv-border/30">{t.symbols}</th>
              <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">{t.returnPercent}</th>
              <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">{t.winRate}</th>
              <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">{t.profitFactor}</th>
              <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">{t.maxDrawdown}</th>
              <th className="px-4 py-2 w-20 text-right">{t.trades}</th>
            </tr>
          </thead>
          <tbody className="text-tv-text divide-y divide-tv-border font-medium">
            {results.map((r) => {
              const isSelected = selectedResult?.symbol === r.symbol && selectedResult?.strategyName === strategyName;
              return (
                <tr
                  key={r.symbol}
                  onClick={() => onSelectResult({ symbol: r.symbol, strategyName })}
                  className={`hover:bg-tv-panel transition cursor-pointer ${isSelected ? "bg-tv-panel border-l-2 border-l-tv-blue" : ""}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-start gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: color }} />
                      <div>
                        <div className={`font-bold leading-none ${isSelected ? "text-tv-blue" : "text-tv-text"}`}>{r.symbol}</div>
                        {(r.data_start || r.data_end) && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] text-tv-muted font-normal">{fmtDateRange(r.data_start, r.data_end)}</span>
                            {r.from_cache && (
                              <span className="text-[9px] bg-tv-panel border border-tv-border/50 text-tv-muted rounded px-1">{t.cached}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.total_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}`}>
                    {fmtPct(r.total_return_pct)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.win_rate_pct >= 50 ? "text-tv-green" : "text-tv-red"}`}>
                    {r.win_rate_pct.toFixed(1)}%
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono ${r.profit_factor >= 1 ? "text-tv-green" : "text-tv-red"}`}>
                    {r.profit_factor.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-tv-red">
                    -{r.max_drawdown_pct.toFixed(2)}%
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
                <td colSpan={5} className="px-4 py-2.5 text-tv-red text-xs">{e.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* ── Multi-strategy comparison layout ── */
  // Collect all unique symbols across all strategies
  const allSymbols = Array.from(
    new Set(allResults.flatMap((r) => r.results.map((res) => res.symbol)))
  ).sort();

  // Build lookup: symbol → { strategyName → result }
  const lookup = new Map<string, Map<string, BatchBacktestResult>>();
  for (const run of allResults) {
    for (const res of run.results) {
      if (!lookup.has(res.symbol)) lookup.set(res.symbol, new Map());
      lookup.get(res.symbol)!.set(run.strategyName, res);
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead className="sticky top-0 bg-tv-base z-10 text-tv-muted uppercase font-medium">
          <tr className="border-b border-tv-border">
            <th className="px-4 py-2 border-r border-tv-border/30">{t.symbol}</th>
            {allResults.map((run) => (
              <th
                key={run.strategyName}
                colSpan={3}
                className="px-4 py-2 text-center border-r border-tv-border/30 whitespace-nowrap"
                style={{ color: run.color }}
              >
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: run.color }} />
                  {run.strategyName}
                </span>
              </th>
            ))}
            <th className="px-4 py-2 text-center">{t.winner}</th>
          </tr>
          <tr className="border-b border-tv-border/60 bg-tv-base">
            <th className="px-4 py-1.5" />
            {allResults.flatMap((run) => [
              <th key={run.strategyName + "-ret"} className="px-3 py-1.5 text-right text-[10px]">{t.return}</th>,
              <th key={run.strategyName + "-wr"} className="px-3 py-1.5 text-right text-[10px]">{t.winPercent}</th>,
              <th key={run.strategyName + "-tr"} className="px-3 py-1.5 text-right text-[10px] border-r border-tv-border/30">{t.trades}</th>,
            ])}
            <th className="px-4 py-1.5" />
          </tr>
        </thead>
        <tbody className="text-tv-text divide-y divide-tv-border font-medium">
          {allSymbols.map((symbol) => {
            const symbolMap = lookup.get(symbol)!;

            // Find winner = strategy with best return for this symbol
            let bestReturn = -Infinity;
            let winnerStrategy = "";
            for (const run of allResults) {
              const res = symbolMap.get(run.strategyName);
              if (res && res.total_return_pct > bestReturn) {
                bestReturn = res.total_return_pct;
                winnerStrategy = run.strategyName;
              }
            }

            const isRowSelected = selectedResult?.symbol === symbol;

            return (
              <tr
                key={symbol}
                className={`hover:bg-tv-panel/50 transition ${isRowSelected ? "bg-tv-panel/30" : ""}`}
              >
                <td className="px-4 py-2.5 border-r border-tv-border/20">
                  <div className="font-bold text-tv-text leading-none">{symbol}</div>
                  {(() => {
                    const first = allResults[0].results.find((r) => r.symbol === symbol);
                    return first?.data_start ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-tv-muted">{fmtDateRange(first.data_start, first.data_end)}</span>
                        {first.from_cache && (
                          <span className="text-[9px] bg-tv-panel border border-tv-border/50 text-tv-muted rounded px-1">{t.cached}</span>
                        )}
                      </div>
                    ) : null;
                  })()}
                </td>

                {allResults.map((run) => {
                  const res = symbolMap.get(run.strategyName);
                  const isSelected = selectedResult?.symbol === symbol && selectedResult?.strategyName === run.strategyName;
                  const isWinner = run.strategyName === winnerStrategy && allResults.length > 1;

                  if (!res) {
                    return (
                      <td key={run.strategyName + "-empty"} colSpan={3} className="px-3 py-2.5 text-tv-muted text-center text-[10px] border-r border-tv-border/20">{t.noData}</td>
                    );
                  }

                  return [
                    <td
                      key={run.strategyName + "-ret"}
                      onClick={() => onSelectResult({ symbol, strategyName: run.strategyName })}
                      className={`px-3 py-2.5 text-right font-mono cursor-pointer ${
                        res.total_return_pct >= 0 ? "text-tv-green" : "text-tv-red"
                      } ${isSelected ? "ring-1 ring-inset ring-tv-blue" : "hover:bg-tv-panel"} ${
                        isWinner ? "font-bold" : ""
                      }`}
                    >
                      {isWinner && <span className="text-[9px] mr-0.5">★</span>}
                      {fmtPct(res.total_return_pct)}
                    </td>,
                    <td
                      key={run.strategyName + "-wr"}
                      onClick={() => onSelectResult({ symbol, strategyName: run.strategyName })}
                      className={`px-3 py-2.5 text-right font-mono cursor-pointer ${
                        res.win_rate_pct >= 50 ? "text-tv-green" : "text-tv-red"
                      } ${isSelected ? "ring-1 ring-inset ring-tv-blue" : "hover:bg-tv-panel"}`}
                    >
                      {res.win_rate_pct.toFixed(1)}%
                    </td>,
                    <td
                      key={run.strategyName + "-tr"}
                      onClick={() => onSelectResult({ symbol, strategyName: run.strategyName })}
                      className={`px-3 py-2.5 text-right font-mono text-tv-muted cursor-pointer border-r border-tv-border/20 ${
                        isSelected ? "ring-1 ring-inset ring-tv-blue" : "hover:bg-tv-panel"
                      }`}
                    >
                      {res.trade_count}
                    </td>,
                  ];
                })}

                {/* Winner column */}
                <td className="px-4 py-2.5 text-center">
                  {winnerStrategy ? (
                    <span
                      className="inline-block text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        color: allResults.find((r) => r.strategyName === winnerStrategy)?.color,
                        backgroundColor: (allResults.find((r) => r.strategyName === winnerStrategy)?.color ?? "") + "20",
                      }}
                    >
                      {winnerStrategy}
                    </span>
                  ) : "--"}
                </td>
              </tr>
            );
          })}

          {/* Errors */}
          {allResults.flatMap((run) =>
            run.errors.map((e) => (
              <tr key={`${run.strategyName}-${e.symbol}`} className="opacity-50">
                <td className="px-4 py-2.5 font-bold text-tv-red">{e.symbol}</td>
                <td colSpan={allResults.length * 3 + 1} className="px-4 py-2.5 text-tv-red text-[10px]">
                  [{run.strategyName}] {e.error}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
