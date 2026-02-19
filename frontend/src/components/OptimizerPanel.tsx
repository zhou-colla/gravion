import { useState } from "react";
import type { StrategyInfo, OptimizeResponse, OptimizeResult, ParamMeta } from "../types/stock";
import type { Translation } from "../i18n";

interface SweepRow {
  param: string;
  mode: "range" | "values";
  // Range mode
  min: string;
  max: string;
  step: string;
  // Values mode
  values: string;
}

interface OptimizerPanelProps {
  strategies: StrategyInfo[];
  availableSymbols: string[];
  realtime: boolean;
  t: Translation;
}

function rangeToValues(min: number, max: number, step: number): number[] {
  if (isNaN(min) || isNaN(max) || isNaN(step) || step <= 0) return [];
  const vals: number[] = [];
  for (let v = min; v <= max + step * 0.0001; v += step) {
    vals.push(Math.round(v * 100000) / 100000);
  }
  return vals;
}

function sweepRowToValues(row: SweepRow): number[] {
  if (row.mode === "range") {
    return rangeToValues(parseFloat(row.min), parseFloat(row.max), parseFloat(row.step));
  }
  return row.values
    .split(",")
    .map((v) => parseFloat(v.trim()))
    .filter((v) => !isNaN(v));
}

function emptyRow(param = "", meta?: ParamMeta): SweepRow {
  if (meta) {
    return {
      param,
      mode: "range",
      min: String(meta.min),
      max: String(meta.max),
      step: String(meta.step),
      values: "",
    };
  }
  return { param, mode: "values", min: "", max: "", step: "", values: "" };
}

function formatPct(v: number | undefined): string {
  if (v === undefined || v === null) return "--";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

export default function OptimizerPanel({ strategies, availableSymbols, realtime, t }: OptimizerPanelProps) {
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [symbol, setSymbol] = useState("");
  const [period, setPeriod] = useState("1y");
  const [usePeriod, setUsePeriod] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sweeps, setSweeps] = useState<SweepRow[]>([emptyRow()]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<keyof OptimizeResult>("total_return_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleStrategyChange = (name: string) => {
    setSelectedStrategy(name);
    setResult(null);
    setError("");
    const strat = strategies.find((s) => s.name === name);
    if (strat?.param_meta && Object.keys(strat.param_meta).length > 0) {
      setSweeps(
        Object.entries(strat.param_meta).map(([param, meta]) => emptyRow(param, meta))
      );
    } else {
      setSweeps([emptyRow()]);
    }
  };

  const addSweep = () => setSweeps((prev) => [...prev, emptyRow()]);

  const removeSweep = (i: number) => setSweeps((prev) => prev.filter((_, idx) => idx !== i));

  const updateSweep = (i: number, patch: Partial<SweepRow>) => {
    setSweeps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  // Compute total combinations for preview
  const totalCombinations = sweeps.reduce((acc, row) => {
    if (!row.param.trim()) return acc;
    const vals = sweepRowToValues(row);
    return acc * (vals.length || 1);
  }, 1);

  const runOptimizer = async () => {
    if (!selectedStrategy || !symbol.trim()) return;

    const validSweeps = sweeps.filter((s) => s.param.trim());
    const param_sweeps = validSweeps
      .map((s) => ({ param: s.param.trim(), values: sweepRowToValues(s) }))
      .filter((s) => s.values.length > 0);

    if (param_sweeps.length === 0) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const payload: Record<string, unknown> = {
        strategy_name: selectedStrategy,
        param_sweeps,
        initial_capital: 10000,
        realtime,
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

  const selectedStrategyInfo = strategies.find((s) => s.name === selectedStrategy);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Config bar */}
      <div className="border-b border-tv-border bg-tv-panel px-4 py-3 flex flex-wrap items-start gap-4">
        {/* Strategy */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] text-tv-muted uppercase font-medium">{t.strategy}</label>
          <select
            value={selectedStrategy}
            onChange={(e) => handleStrategyChange(e.target.value)}
            className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue cursor-pointer min-w-[160px]"
          >
            <option value="">{t.selectStrategy}</option>
            {strategies.filter((s) => s.builtin).map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Symbol */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] text-tv-muted uppercase font-medium">{t.symbol}</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder={t.symbolExample}
            list="opt-symbols"
            className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue w-28"
          />
          <datalist id="opt-symbols">
            {availableSymbols.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>

        {/* Timeframe */}
        <div className="flex flex-col space-y-1">
          <label className="text-[10px] text-tv-muted uppercase font-medium">{t.timeframe}</label>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setUsePeriod(true)}
              className={`text-xs px-2 py-1 rounded border transition cursor-pointer ${usePeriod ? "bg-tv-blue/10 border-tv-blue text-tv-blue" : "border-tv-border text-tv-muted hover:border-tv-text"}`}
            >
              {t.period}
            </button>
            <button
              onClick={() => setUsePeriod(false)}
              className={`text-xs px-2 py-1 rounded border transition cursor-pointer ${!usePeriod ? "bg-tv-blue/10 border-tv-blue text-tv-blue" : "border-tv-border text-tv-muted hover:border-tv-text"}`}
            >
              {t.dateRange}
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
        <div className="flex flex-col space-y-1 flex-1 min-w-[340px]">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-tv-muted uppercase font-medium">
              {t.parameterSweeps}
              {totalCombinations > 1 && (
                <span className="ml-2 normal-case text-tv-blue">
                  ({totalCombinations} combination{totalCombinations !== 1 ? "s" : ""})
                </span>
              )}
            </label>
            <button
              onClick={addSweep}
              className="text-[10px] text-tv-blue hover:underline cursor-pointer"
            >
              {t.addParam}
            </button>
          </div>
          <div className="space-y-1.5">
            {sweeps.map((row, i) => {
              const meta = selectedStrategyInfo?.param_meta?.[row.param];
              return (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  {/* Param name */}
                  {selectedStrategyInfo?.param_meta && Object.keys(selectedStrategyInfo.param_meta).length > 0 ? (
                    <select
                      value={row.param}
                      onChange={(e) => {
                        const p = e.target.value;
                        const m = selectedStrategyInfo?.param_meta?.[p];
                        updateSweep(i, m ? { param: p, mode: "range", min: String(m.min), max: String(m.max), step: String(m.step) } : { param: p });
                      }}
                      className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue cursor-pointer w-36"
                    >
                      <option value="">{t.selectParam}</option>
                      {Object.entries(selectedStrategyInfo.param_meta).map(([p, m]) => (
                        <option key={p} value={p}>{m.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={row.param}
                      onChange={(e) => updateSweep(i, { param: e.target.value })}
                      placeholder={t.paramName}
                      className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue w-28"
                    />
                  )}

                  {/* Mode toggle */}
                  <div className="flex bg-tv-base rounded border border-tv-border overflow-hidden">
                    <button
                      onClick={() => updateSweep(i, { mode: "range" })}
                      className={`px-2 py-0.5 text-[10px] transition cursor-pointer ${row.mode === "range" ? "bg-tv-blue text-white" : "text-tv-muted hover:text-tv-text"}`}
                    >
                      {t.range}
                    </button>
                    <button
                      onClick={() => updateSweep(i, { mode: "values" })}
                      className={`px-2 py-0.5 text-[10px] transition cursor-pointer ${row.mode === "values" ? "bg-tv-blue text-white" : "text-tv-muted hover:text-tv-text"}`}
                    >
                      {t.values}
                    </button>
                  </div>

                  {/* Inputs */}
                  {row.mode === "range" ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={row.min}
                        onChange={(e) => updateSweep(i, { min: e.target.value })}
                        placeholder={t.min}
                        className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue w-16"
                      />
                      <span className="text-tv-muted text-[10px]">{t.to}</span>
                      <input
                        type="number"
                        value={row.max}
                        onChange={(e) => updateSweep(i, { max: e.target.value })}
                        placeholder={t.max}
                        className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue w-16"
                      />
                      <span className="text-tv-muted text-[10px]">{t.step}</span>
                      <input
                        type="number"
                        value={row.step}
                        onChange={(e) => updateSweep(i, { step: e.target.value })}
                        placeholder={t.step}
                        className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue w-14"
                      />
                      {/* Live count for this row */}
                      {row.param && (
                        <span className="text-[10px] text-tv-muted">
                          ({rangeToValues(parseFloat(row.min), parseFloat(row.max), parseFloat(row.step)).length} vals)
                        </span>
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={row.values}
                      onChange={(e) => updateSweep(i, { values: e.target.value })}
                      placeholder={meta ? `e.g. ${meta.default}, ${meta.default + meta.step}` : t.valuesExampleDefault}
                      className="bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue flex-1 min-w-[120px]"
                    />
                  )}

                  {sweeps.length > 1 && (
                    <button
                      onClick={() => removeSweep(i)}
                      className="text-tv-muted hover:text-tv-red cursor-pointer shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
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
                <span>{t.running}</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                </svg>
                <span>{t.optimize}</span>
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
              <p className="text-tv-muted text-xs">{t.testingCombinations.replace('{count}', totalCombinations.toString()).replace('{plural}', totalCombinations !== 1 ? 's' : '')}</p>
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
              <h3 className="text-base font-medium mb-2 text-tv-text">{t.parameterOptimizer}</h3>
              <p className="text-tv-muted text-xs mb-1">
                {t.optimizerInstructions}
              </p>
              <p className="text-tv-muted text-xs">
                {t.optimizerModeInstructions}
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
                  <th className="px-3 py-2 border-r border-tv-border/30">{t.rank}</th>
                  {/* Dynamic param columns */}
                  {sweeps.filter((s) => s.param.trim()).map((s) => {
                    const meta = selectedStrategyInfo?.param_meta?.[s.param];
                    return (
                      <th key={s.param} className="px-3 py-2 border-r border-tv-border/30 text-tv-blue/80">
                        {meta?.label || s.param}
                      </th>
                    );
                  })}
                  <th
                    className="px-3 py-2 border-r border-tv-border/30 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("total_return_pct")}
                  >
                    {t.return} <SortIcon col="total_return_pct" />
                  </th>
                  <th
                    className="px-3 py-2 border-r border-tv-border/30 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("win_rate_pct")}
                  >
                    {t.winRate} <SortIcon col="win_rate_pct" />
                  </th>
                  <th
                    className="px-3 py-2 border-r border-tv-border/30 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("profit_factor")}
                  >
                    {t.profitFactor} <SortIcon col="profit_factor" />
                  </th>
                  <th
                    className="px-3 py-2 border-r border-tv-border/30 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("max_drawdown_pct")}
                  >
                    {t.maxDrawdown} <SortIcon col="max_drawdown_pct" />
                  </th>
                  <th
                    className="px-3 py-2 cursor-pointer hover:text-tv-text select-none"
                    onClick={() => toggleSort("trade_count")}
                  >
                    {t.trades} <SortIcon col="trade_count" />
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
                          <span className="text-tv-green font-bold">{t.bestResult}</span>
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
