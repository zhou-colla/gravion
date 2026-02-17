import { useState } from "react";
import type { StrategyInfo, OptimizeResponse, OptimizeResult } from "../types/stock";

interface ParamSweep {
  param: string;
  values: string; // comma-separated input string
}

interface OptimizerPanelProps {
  strategies: StrategyInfo[];
  availableSymbols: string[];
}

function formatPct(v: number | undefined): string {
  if (v === undefined || v === null) return "--";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

export default function OptimizerPanel({ strategies, availableSymbols }: OptimizerPanelProps) {
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [symbol, setSymbol] = useState("");
  const [period, setPeriod] = useState("1y");
  const [usePeriod, setUsePeriod] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sweeps, setSweeps] = useState<ParamSweep[]>([{ param: "", values: "" }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<keyof OptimizeResult>("total_return_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const addSweep = () => setSweeps((prev) => [...prev, { param: "", values: "" }]);

  const removeSweep = (i: number) => setSweeps((prev) => prev.filter((_, idx) => idx !== i));

  const updateSweep = (i: number, field: keyof ParamSweep, val: string) => {
    setSweeps((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  };

  const runOptimizer = async () => {
    if (!selectedStrategy || !symbol.trim()) return;

    const validSweeps = sweeps.filter((s) => s.param.trim() && s.values.trim());
    if (validSweeps.length === 0) return;

    const param_sweeps = validSweeps.map((s) => ({
      param: s.param.trim(),
      values: s.values
        .split(",")
        .map((v) => parseFloat(v.trim()))
        .filter((v) => !isNaN(v)),
    })).filter((s) => s.values.length > 0);

    if (param_sweeps.length === 0) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const payload: Record<string, unknown> = {
        strategy_name: selectedStrategy,
        param_sweeps,
        initial_capital: 10000,
      };
      if (usePeriod) {
        payload.period = period;
      } else {
        payload.start_date = startDate;
        payload.end_date = endDate;
      }

      const res = await fetch(
        `http://localhost:8000/api/backtest/optimize/${encodeURIComponent(symbol.trim().toUpperCase())}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json: OptimizeResponse = await res.json();
      if (json.success) {
        setResult(json);
      } else {
        setError(json.error || "Optimizer failed");
      }
    } catch {
      setError("Connection error — is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const toggleSort = (key: keyof OptimizeResult) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedResults = result
    ? [...result.results].sort((a, b) => {
        const av = (a[sortKey] as number) ?? -Infinity;
        const bv = (b[sortKey] as number) ?? -Infinity;
        return sortDir === "desc" ? bv - av : av - bv;
      })
    : [];

  const bestReturn = sortedResults[0]?.total_return_pct ?? -Infinity;

  const SortIcon = ({ col }: { col: keyof OptimizeResult }) =>
    sortKey === col ? (
      <span className="ml-1 text-tv-blue">{sortDir === "desc" ? "▼" : "▲"}</span>
    ) : (
      <span className="ml-1 text-tv-border">▼</span>
    );

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Config bar */}
      <div className="border-b border-tv-border bg-tv-panel px-4 py-3 flex flex-wrap items-start gap-4">
        {/* Strategy */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] text-tv-muted uppercase font-medium">Strategy</label>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue cursor-pointer min-w-[160px]"
          >
            <option value="">Select strategy…</option>
            {strategies.filter((s) => s.builtin).map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Symbol */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] text-tv-muted uppercase font-medium">Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            list="opt-symbols"
            className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue w-28"
          />
          <datalist id="opt-symbols">
            {availableSymbols.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>

        {/* Timeframe */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] text-tv-muted uppercase font-medium">Timeframe</label>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setUsePeriod(true)}
              className={`text-xs px-2 py-1 rounded border transition cursor-pointer ${usePeriod ? "bg-tv-blue/10 border-tv-blue text-tv-blue" : "border-tv-border text-tv-muted hover:border-tv-text"}`}
            >
              Period
            </button>
            <button
              onClick={() => setUsePeriod(false)}
              className={`text-xs px-2 py-1 rounded border transition cursor-pointer ${!usePeriod ? "bg-tv-blue/10 border-tv-blue text-tv-blue" : "border-tv-border text-tv-muted hover:border-tv-text"}`}
            >
              Date Range
            </button>
          </div>
          {usePeriod ? (
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue cursor-pointer"
            >
              {["3mo", "6mo", "1y", "2y", "5y"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <div className="flex items-center space-x-1">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue" />
              <span className="text-tv-muted">→</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue" />
            </div>
          )}
        </div>

        {/* Param sweeps */}
        <div className="flex flex-col space-y-1 flex-1 min-w-[280px]">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-tv-muted uppercase font-medium">Parameter Sweeps</label>
            <button
              onClick={addSweep}
              className="text-[10px] text-tv-blue hover:underline cursor-pointer"
            >
              + Add Param
            </button>
          </div>
          <div className="space-y-1">
            {sweeps.map((s, i) => (
              <div key={i} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={s.param}
                  onChange={(e) => updateSweep(i, "param", e.target.value)}
                  placeholder="param name"
                  className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue w-28"
                />
                <span className="text-tv-muted text-xs">=</span>
                <input
                  type="text"
                  value={s.values}
                  onChange={(e) => updateSweep(i, "values", e.target.value)}
                  placeholder="10, 20, 50"
                  className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue flex-1"
                />
                {sweeps.length > 1 && (
                  <button
                    onClick={() => removeSweep(i)}
                    className="text-tv-muted hover:text-tv-red cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Run button */}
        <div className="flex flex-col justify-end">
          <button
            onClick={runOptimizer}
            disabled={loading || !selectedStrategy || !symbol.trim()}
            className="bg-tv-green hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-xs font-semibold transition cursor-pointer flex items-center space-x-2"
          >
            {loading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Running…</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                </svg>
                <span>Optimize</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="m-4 p-3 bg-tv-red/10 border border-tv-red/30 rounded text-tv-red text-xs">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-2 border-tv-blue border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-tv-muted text-xs">Testing parameter combinations…</p>
            </div>
          </div>
        )}

        {!loading && !result && !error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-8">
              <div className="w-16 h-16 bg-tv-panel rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h3 className="text-base font-medium mb-2 text-tv-text">Parameter Optimizer</h3>
              <p className="text-tv-muted text-xs mb-1">
                Select a strategy, enter a symbol, and define parameter sweeps.
              </p>
              <p className="text-tv-muted text-xs">
                All combinations will be tested and ranked by return.
              </p>
            </div>
          </div>
        )}

        {!loading && result && sortedResults.length > 0 && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-tv-text font-semibold text-sm">{result.symbol}</span>
                <span className="text-tv-muted text-xs ml-2">· {result.strategy_name}</span>
                <span className="text-tv-muted text-xs ml-2">· {result.combinations_tested} combinations tested</span>
                <span className="text-tv-muted text-xs ml-2">· {result.date_range.start} → {result.date_range.end}</span>
              </div>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-tv-base z-10 text-tv-muted uppercase font-medium">
                <tr className="border-b border-tv-border">
                  <th className="px-3 py-2 border-r border-tv-border/30">#</th>
                  {/* Dynamic param columns */}
                  {sweeps.filter((s) => s.param.trim()).map((s) => (
                    <th key={s.param} className="px-3 py-2 border-r border-tv-border/30 text-tv-blue/80">
                      {s.param}
                    </th>
                  ))}
                  <th
                    className="px-3 py-2 border-r border-tv-border/30 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("total_return_pct")}
                  >
                    Return <SortIcon col="total_return_pct" />
                  </th>
                  <th
                    className="px-3 py-2 border-r border-tv-border/30 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("win_rate_pct")}
                  >
                    Win Rate <SortIcon col="win_rate_pct" />
                  </th>
                  <th
                    className="px-3 py-2 border-r border-tv-border/30 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("profit_factor")}
                  >
                    Profit Factor <SortIcon col="profit_factor" />
                  </th>
                  <th
                    className="px-3 py-2 border-r border-tv-border/30 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("max_drawdown_pct")}
                  >
                    Max DD <SortIcon col="max_drawdown_pct" />
                  </th>
                  <th
                    className="px-3 py-2 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("trade_count")}
                  >
                    Trades <SortIcon col="trade_count" />
                  </th>
                </tr>
              </thead>
              <tbody className="text-tv-text divide-y divide-tv-border">
                {sortedResults.map((row, i) => {
                  const isBest = row.total_return_pct === bestReturn && i === 0;
                  return (
                    <tr
                      key={i}
                      className={`${isBest ? "bg-tv-green/5 border-l-2 border-l-tv-green" : "hover:bg-tv-panel"} transition`}
                    >
                      <td className="px-3 py-2 text-tv-muted">
                        {isBest ? (
                          <span className="text-tv-green font-bold">★</span>
                        ) : (
                          i + 1
                        )}
                      </td>
                      {sweeps.filter((s) => s.param.trim()).map((s) => (
                        <td key={s.param} className="px-3 py-2 font-mono text-tv-blue/80">
                          {row.params[s.param] ?? "--"}
                        </td>
                      ))}
                      <td className={`px-3 py-2 font-semibold ${row.total_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}`}>
                        {formatPct(row.total_return_pct)}
                      </td>
                      <td className="px-3 py-2">
                        {row.win_rate_pct != null ? row.win_rate_pct.toFixed(1) + "%" : "--"}
                      </td>
                      <td className="px-3 py-2">
                        {row.profit_factor != null ? row.profit_factor.toFixed(2) : "--"}
                      </td>
                      <td className={`px-3 py-2 ${row.max_drawdown_pct < 0 ? "text-tv-red" : "text-tv-muted"}`}>
                        {row.max_drawdown_pct != null ? row.max_drawdown_pct.toFixed(2) + "%" : "--"}
                      </td>
                      <td className="px-3 py-2 text-tv-muted">
                        {row.trade_count ?? "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
