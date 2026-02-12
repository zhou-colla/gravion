import { useState } from "react";
import type {
  StrategyInfo,
  BatchBacktestResponse,
  EquityCurvePoint,
  BatchBacktestResult,
  Portfolio,
} from "../types/stock";
import BacktestConfigBar from "./BacktestConfigBar";
import BacktestOverview from "./BacktestOverview";
import BacktestResultsGrid from "./BacktestResultsGrid";
import BacktestTransactionLog from "./BacktestTransactionLog";

interface BacktestWorkspaceProps {
  strategies: StrategyInfo[];
  availableSymbols: string[];
  onOpenVisualBuilder: () => void;
  onStrategiesChanged: () => void;
  portfolios: Portfolio[];
}

export default function BacktestWorkspace({
  strategies,
  availableSymbols,
  onOpenVisualBuilder,
  onStrategiesChanged,
  portfolios,
}: BacktestWorkspaceProps) {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [period, setPeriod] = useState("1y");
  const [usePeriod, setUsePeriod] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchBacktestResponse | null>(null);
  const [selectedResultSymbol, setSelectedResultSymbol] = useState<string | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityCurvePoint[]>([]);
  const [sourceMode, setSourceMode] = useState<"manual" | "portfolio">("manual");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);

  const computeEquityCurve = (results: BatchBacktestResult[], capitalPerStock: number): EquityCurvePoint[] => {
    // Merge all trade events across symbols chronologically
    const events: { time: string; symbol: string; pnl: number }[] = [];

    for (const r of results) {
      for (const t of r.trades) {
        if (t.type === "SELL") {
          events.push({ time: t.date, symbol: r.symbol, pnl: t.pnl });
        }
      }
    }

    events.sort((a, b) => a.time.localeCompare(b.time));

    const totalInitial = capitalPerStock * results.length;
    let cumulativeValue = totalInitial;
    const curve: EquityCurvePoint[] = [{ time: events[0]?.time || "2024-01-01", value: totalInitial }];

    for (const ev of events) {
      cumulativeValue += ev.pnl;
      curve.push({ time: ev.time, value: Math.round(cumulativeValue * 100) / 100 });
    }

    // Deduplicate same-day entries (keep last)
    const deduped = new Map<string, number>();
    for (const pt of curve) {
      deduped.set(pt.time, pt.value);
    }
    return Array.from(deduped.entries()).map(([time, value]) => ({ time, value }));
  };

  const runBatchBacktest = async () => {
    if (!selectedStrategy) return;
    if (sourceMode === "manual" && selectedSymbols.length === 0) return;
    if (sourceMode === "portfolio" && !selectedPortfolioId) return;

    setLoading(true);
    setBatchResult(null);
    setSelectedResultSymbol(null);
    setEquityCurve([]);

    try {
      const payload: Record<string, unknown> = {
        strategy_name: selectedStrategy,
        initial_capital_per_stock: 10000,
      };

      if (sourceMode === "portfolio" && selectedPortfolioId) {
        payload.portfolio_id = selectedPortfolioId;
      } else {
        payload.symbols = selectedSymbols;
      }

      if (usePeriod) {
        payload.period = period;
      } else {
        payload.start_date = startDate;
        payload.end_date = endDate;
      }

      const res = await fetch("http://localhost:8000/api/backtest/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: BatchBacktestResponse = await res.json();

      if (json.success) {
        setBatchResult(json);
        if (json.results.length > 0) {
          setEquityCurve(computeEquityCurve(json.results, 10000));
        }
      }
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
        setSelectedStrategy("");
        onStrategiesChanged();
      }
    } catch (e) {
      console.error("Failed to delete strategy:", e);
    }
  };

  const selectedResult: BatchBacktestResult | undefined = batchResult?.results.find(
    (r) => r.symbol === selectedResultSymbol
  );

  return (
    <div className="flex-1 flex flex-col bg-tv-base min-w-0 overflow-hidden">
      {/* Config Bar */}
      <BacktestConfigBar
        selectedSymbols={selectedSymbols}
        onSymbolsChange={setSelectedSymbols}
        availableSymbols={availableSymbols}
        strategies={strategies}
        selectedStrategy={selectedStrategy}
        onStrategyChange={setSelectedStrategy}
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
                  Running backtest on {selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? "s" : ""}...
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !batchResult && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-8">
                <div className="w-16 h-16 bg-tv-panel rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium mb-2 text-tv-text">Backtest Workspace</h3>
                <p className="text-tv-muted text-xs mb-1">
                  Add tickers, select a strategy and timeframe, then click{" "}
                  <strong className="text-tv-green">Run Backtest</strong>.
                </p>
                <p className="text-tv-muted text-xs">
                  Results will show per-stock performance and an aggregated portfolio view.
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && batchResult && (
            <>
              <BacktestOverview summary={batchResult.summary} equityCurve={equityCurve} />
              <BacktestResultsGrid
                results={batchResult.results}
                errors={batchResult.errors}
                selectedSymbol={selectedResultSymbol}
                onSelectSymbol={setSelectedResultSymbol}
              />
            </>
          )}
        </div>

        {/* Transaction Log Sidebar */}
        {selectedResult && (
          <BacktestTransactionLog
            result={selectedResult}
            onClose={() => setSelectedResultSymbol(null)}
          />
        )}
      </div>
    </div>
  );
}
