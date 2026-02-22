import { useState, useEffect } from "react";
import type {
  StrategyInfo,
  BatchBacktestResponse,
  EquityCurvePoint,
  BatchBacktestResult,
  Portfolio,
} from "../types/stock";
import BacktestConfigBar, { STRATEGY_COLORS } from "./BacktestConfigBar";
import BacktestOverview from "./BacktestOverview";
import BacktestResultsGrid from "./BacktestResultsGrid";
import BacktestTransactionLog from "./BacktestTransactionLog";
import OptimizerPanel from "./OptimizerPanel";
import type { Translation } from "../i18n";

interface BacktestWorkspaceProps {
  strategies: StrategyInfo[];
  availableSymbols: string[];
  onOpenVisualBuilder: () => void;
  onStrategiesChanged: () => void;
  portfolios: Portfolio[];
  realtime: boolean;
  t: Translation;
}

export interface StrategyRunResult {
  strategyName: string;
  color: string;
  response: BatchBacktestResponse;
}

export default function BacktestWorkspace({
  strategies,
  availableSymbols,
  onOpenVisualBuilder,
  onStrategiesChanged,
  portfolios,
  realtime,
  t,
}: BacktestWorkspaceProps) {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [period, setPeriod] = useState("1y");
  const [usePeriod, setUsePeriod] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [allResults, setAllResults] = useState<StrategyRunResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<{ symbol: string; strategyName: string } | null>(null);
  const [sourceMode, setSourceMode] = useState<"manual" | "portfolio">("manual");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"backtest" | "optimizer">("backtest");
  const [strategyParams, setStrategyParams] = useState<Record<string, Record<string, number>>>({});

  // Initialize params when a new strategy is added — use saved_params if present, else param_meta defaults
  useEffect(() => {
    const updates: Record<string, Record<string, number>> = {};
    for (const name of selectedStrategies) {
      if (!strategyParams[name]) {
        const strat = strategies.find((s) => s.name === name);
        if (strat?.param_meta && Object.keys(strat.param_meta).length > 0) {
          const init: Record<string, number> = {};
          for (const [p, meta] of Object.entries(strat.param_meta)) {
            init[p] = strat.saved_params?.[p] ?? meta.default;
          }
          updates[name] = init;
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      setStrategyParams((prev) => ({ ...prev, ...updates }));
    }
  }, [selectedStrategies, strategies]);

  const handleStrategyParamsChange = (name: string, params: Record<string, number>) => {
    setStrategyParams((prev) => ({ ...prev, [name]: params }));
  };

  // Called from OptimizerPanel — switch to backtest tab and apply selected params
  const handleApplyOptimizerParams = (name: string, params: Record<string, number>) => {
    setStrategyParams((prev) => ({ ...prev, [name]: params }));
    setSelectedStrategies((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setActiveTab("backtest");
  };

  const computeEquityCurve = (results: BatchBacktestResult[], capitalPerStock: number): EquityCurvePoint[] => {
    const events: { time: string; pnl: number }[] = [];
    for (const r of results) {
      for (const t of r.trades) {
        if (t.type === "SELL") events.push({ time: t.date, pnl: t.pnl });
      }
    }
    events.sort((a, b) => a.time.localeCompare(b.time));
    const totalInitial = capitalPerStock * results.length;
    let cum = totalInitial;
    const curve: EquityCurvePoint[] = [{ time: events[0]?.time || "2024-01-01", value: totalInitial }];
    for (const ev of events) {
      cum += ev.pnl;
      curve.push({ time: ev.time, value: Math.round(cum * 100) / 100 });
    }
    const deduped = new Map<string, number>();
    for (const pt of curve) deduped.set(pt.time, pt.value);
    return Array.from(deduped.entries()).map(([time, value]) => ({ time, value }));
  };

  const runBatchBacktest = async () => {
    if (selectedStrategies.length === 0) return;
    if (sourceMode === "manual" && selectedSymbols.length === 0) return;
    if (sourceMode === "portfolio" && !selectedPortfolioId) return;

    setLoading(true);
    setAllResults([]);
    setSelectedResult(null);

    try {
      const basePayload: Record<string, unknown> = { initial_capital_per_stock: 10000, realtime };
      if (sourceMode === "portfolio" && selectedPortfolioId) {
        basePayload.portfolio_id = selectedPortfolioId;
      } else {
        basePayload.symbols = selectedSymbols;
      }
      if (usePeriod) {
        basePayload.period = period;
      } else {
        basePayload.start_date = startDate;
        basePayload.end_date = endDate;
      }

      const runs = await Promise.all(
        selectedStrategies.map(async (strategyName, i) => {
          const params = strategyParams[strategyName];
          const payload: Record<string, unknown> = {
            ...basePayload,
            strategy_name: strategyName,
          };
          // Only send params if they differ from defaults (or always send them)
          if (params && Object.keys(params).length > 0) {
            payload.params = params;
          }
          const res = await fetch("http://localhost:8000/api/backtest/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json: BatchBacktestResponse = await res.json();
          return {
            strategyName,
            color: STRATEGY_COLORS[i % STRATEGY_COLORS.length],
            response: json,
          };
        })
      );

      setAllResults(runs.filter((r) => r.response.success));
    } catch (e) {
      console.error("Batch backtest failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const deleteStrategy = async (name: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/strategies/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setSelectedStrategies((prev) => prev.filter((s) => s !== name));
        onStrategiesChanged();
      }
    } catch (e) {
      console.error("Failed to delete strategy:", e);
    }
  };

  // Build per-strategy equity curves for overview
  const strategyOverviewData = allResults.map((run) => ({
    strategyName: run.strategyName,
    color: run.color,
    summary: run.response.summary,
    equityCurve: run.response.results.length > 0
      ? computeEquityCurve(run.response.results, 10000)
      : [],
  }));

  // Find the selected result object
  const selectedResultData = selectedResult
    ? allResults
        .find((r) => r.strategyName === selectedResult.strategyName)
        ?.response.results.find((r) => r.symbol === selectedResult.symbol) ?? null
    : null;

  const symbolCount = sourceMode === "portfolio"
    ? (allResults[0]?.response.results.length ?? selectedSymbols.length)
    : selectedSymbols.length;

  return (
    <div className="flex-1 flex flex-col bg-tv-base min-w-0 overflow-hidden">
      {/* Tab switcher */}
      <div className="flex items-center border-b border-tv-border bg-tv-base px-4 shrink-0">
        <button
          onClick={() => setActiveTab("backtest")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition cursor-pointer ${
            activeTab === "backtest"
              ? "border-tv-blue text-tv-blue"
              : "border-transparent text-tv-muted hover:text-tv-text"
          }`}
        >
          {t.backtest}
        </button>
        <button
          onClick={() => setActiveTab("optimizer")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition cursor-pointer ${
            activeTab === "optimizer"
              ? "border-tv-blue text-tv-blue"
              : "border-transparent text-tv-muted hover:text-tv-text"
          }`}
        >
          {t.optimizer}
        </button>
      </div>

      {activeTab === "optimizer" ? (
        <OptimizerPanel
          strategies={strategies}
          availableSymbols={availableSymbols}
          realtime={realtime}
          onApplyParams={handleApplyOptimizerParams}
          t={t}
        />
      ) : (
        <>
          {/* Config Bar */}
          <BacktestConfigBar
            selectedSymbols={selectedSymbols}
            onSymbolsChange={setSelectedSymbols}
            availableSymbols={availableSymbols}
            strategies={strategies}
            selectedStrategies={selectedStrategies}
            onStrategiesChange={setSelectedStrategies}
            period={period}
            onPeriodChange={setPeriod}
            usePeriod={usePeriod}
            onUsePeriodChange={setUsePeriod}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            onRun={runBatchBacktest}
            onOpenVisualBuilder={onOpenVisualBuilder}
            onDeleteStrategy={deleteStrategy}
            loading={loading}
            portfolios={portfolios}
            sourceMode={sourceMode}
            onSourceModeChange={setSourceMode}
            selectedPortfolioId={selectedPortfolioId}
            onPortfolioChange={setSelectedPortfolioId}
            strategyParams={strategyParams}
            onStrategyParamsChange={handleStrategyParamsChange}
            t={t}
          />

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Loading state */}
              {loading && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="inline-block w-8 h-8 border-2 border-tv-blue border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-tv-muted text-xs">
                      Running {selectedStrategies.length} strateg{selectedStrategies.length === 1 ? "y" : "ies"} on {symbolCount} symbol{symbolCount !== 1 ? "s" : ""}…
                    </p>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!loading && allResults.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center px-8">
                    <div className="w-16 h-16 bg-tv-panel rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium mb-2 text-tv-text">Backtest Workspace</h3>
                    <p className="text-tv-muted text-xs mb-1">
                      Add tickers, select one or more strategies, then click{" "}
                      <strong className="text-tv-green">Run Backtest</strong>.
                    </p>
                    <p className="text-tv-muted text-xs">
                      Multiple strategies will be compared side-by-side.
                    </p>
                  </div>
                </div>
              )}

              {/* Results */}
              {!loading && allResults.length > 0 && (
                <>
                  <BacktestOverview strategies={strategyOverviewData} t={t} />
                  <BacktestResultsGrid
                    allResults={allResults.map((r) => ({
                      strategyName: r.strategyName,
                      color: r.color,
                      results: r.response.results,
                      errors: r.response.errors,
                    }))}
                    selectedResult={selectedResult}
                    onSelectResult={setSelectedResult}
                    t={t}
                  />
                </>
              )}
            </div>

            {/* Transaction Log Sidebar */}
            {selectedResult && selectedResultData && (
              <BacktestTransactionLog
                result={selectedResultData}
                strategyName={selectedResult.strategyName}
                onClose={() => setSelectedResult(null)}
                t={t}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
