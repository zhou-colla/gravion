import { useState, useEffect, useRef } from "react";
import type { StockRow, DbInfo, StockDetail, StrategyInfo, BacktestResultData, TradeEntry, JsonStrategyDefinition, AppSettings, Portfolio } from "./types/stock";
import DataGrid from "./components/DataGrid";
import ChartPanel from "./components/ChartPanel";
import DetailInspector from "./components/DetailInspector";
import ExportButton from "./components/ExportButton";
import VisualBuilder from "./components/VisualBuilder";
import BacktestWorkspace from "./components/BacktestWorkspace";
import SettingsPanel from "./components/SettingsPanel";
import PortfolioManager from "./components/PortfolioManager";
import SourceSelector from "./components/SourceSelector";
import type { SourceSelection } from "./components/SourceSelector";
import StrategySelector from "./components/StrategySelector";
import FilterBuilder from "./components/FilterBuilder";
import type { FilterInfo } from "./types/stock";

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(0) + "MB";
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(0) + "KB";
  return bytes + "B";
}

export default function App() {
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [realtimeFetch, setRealtimeFetch] = useState(false);
  const [dbInfo, setDbInfo] = useState<DbInfo>({ path: "gravion.db", size_bytes: 0, stock_count: 0 });

  // Phase 3 state
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [stockDetail, setStockDetail] = useState<StockDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Phase 4 state
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [backtestResult, setBacktestResult] = useState<BacktestResultData | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [highlightedTrade, setHighlightedTrade] = useState<TradeEntry | null>(null);
  const [showVisualBuilder, setShowVisualBuilder] = useState(false);
  const backtestAbortRef = useRef<AbortController | null>(null);

  // View switching
  const [activeView, setActiveView] = useState<"scanner" | "backtest" | "portfolios" | "settings">("scanner");

  // Phase 5 state
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ data_source: "yahoo_finance", global_start_date: "", global_end_date: "" });
  const [scannerSource, setScannerSource] = useState<SourceSelection>({ type: "portfolio", portfolioId: 0, portfolioName: "NASDAQ 100" });
  const [scannerStrategies, setScannerStrategies] = useState<string[]>([]);
  const [comparisonStrategies, setComparisonStrategies] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterInfo[]>([]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [filterOperator, setFilterOperator] = useState<"AND" | "OR">("AND");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);

  const checkHealth = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/health");
      const json = await res.json();
      setBackendStatus(json.status === "ok" ? "connected" : "disconnected");
    } catch {
      setBackendStatus("disconnected");
    }
  };

  const loadDbInfo = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/db-info");
      const json = await res.json();
      if (json.success) setDbInfo(json);
    } catch {
      /* silent */
    }
  };

  const loadStrategies = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/strategies");
      const json = await res.json();
      if (json.strategies) setStrategies(json.strategies);
    } catch {
      /* silent */
    }
  };

  const loadPortfolios = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/portfolios");
      const json = await res.json();
      if (json.portfolios) {
        setPortfolios(json.portfolios);
        // Set default scanner source to system portfolio if current is placeholder (id=0)
        setScannerSource((prev) => {
          if (prev.type === "portfolio" && prev.portfolioId === 0) {
            const system = json.portfolios.find((p: Portfolio) => p.is_system);
            if (system) return { type: "portfolio", portfolioId: system.id, portfolioName: system.name };
          }
          return prev;
        });
      }
    } catch {
      /* silent */
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/settings");
      const json = await res.json();
      setSettings({
        data_source: json.data_source || "yahoo_finance",
        global_start_date: json.global_start_date || "",
        global_end_date: json.global_end_date || "",
      });
    } catch {
      /* silent */
    }
  };

  const loadFilters = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/filters");
      const json = await res.json();
      if (json.filters) setFilters(json.filters);
    } catch { /* silent */ }
  };

  const getSourceBody = (): Record<string, unknown> | undefined => {
    if (scannerSource.type === "portfolio" && scannerSource.portfolioId > 0) {
      return { portfolio_id: scannerSource.portfolioId };
    } else if (scannerSource.type === "manual" && scannerSource.symbols.length > 0) {
      return { symbols: scannerSource.symbols };
    }
    return undefined;
  };

  const fetchData = async () => {
    setFetching(true);
    try {
      const body = getSourceBody();
      const res = await fetch("http://localhost:8000/api/fetch", {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json;
    } finally {
      setFetching(false);
    }
  };

  const screenData = async () => {
    setLoading(true);
    setError("");
    try {
      const sourceBody = getSourceBody();
      const body: Record<string, unknown> = { ...(sourceBody || {}) };
      // Primary signal strategy (first selected)
      if (scannerStrategies.length > 0) body.strategy = scannerStrategies[0];
      // Comparison strategies (all selected, for multi-column view)
      if (scannerStrategies.length > 0) body.strategies = scannerStrategies;
      // Filters
      if (activeFilters.length > 0) body.filters = activeFilters;
      if (activeFilters.length > 1) body.filter_operator = filterOperator;
      const res = await fetch("http://localhost:8000/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setStocks(json.data);
        setFilterTags(json.filter_tags || []);
        setComparisonStrategies(json.comparison_strategies || []);
        setBackendStatus("connected");
      } else {
        setError(json.error || "Screen returned no data");
      }
    } catch {
      setError("Cannot connect to backend. Is the Python server running on port 8000?");
      setBackendStatus("disconnected");
    } finally {
      setLoading(false);
    }
  };

  const runAction = async () => {
    if (realtimeFetch) {
      await fetchData();
      await screenData();
    } else {
      await screenData();
    }
    loadDbInfo();
  };

  const runBacktest = async () => {
    if (!selectedSymbol || !selectedStrategy) return;

    // Cancel any in-flight backtest
    if (backtestAbortRef.current) backtestAbortRef.current.abort();
    const controller = new AbortController();
    backtestAbortRef.current = controller;

    setBacktestLoading(true);
    setBacktestResult(null);
    setHighlightedTrade(null);

    try {
      const res = await fetch(`http://localhost:8000/api/backtest/${selectedSymbol}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_name: selectedStrategy }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!controller.signal.aborted && json.success) {
        setBacktestResult(json.result);
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Backtest failed:", e);
      }
    } finally {
      if (!controller.signal.aborted) {
        setBacktestLoading(false);
      }
    }
  };

  const saveVisualStrategy = async (definition: JsonStrategyDefinition) => {
    try {
      const res = await fetch("http://localhost:8000/api/strategies/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition }),
      });
      const json = await res.json();
      if (json.success) {
        setShowVisualBuilder(false);
        await loadStrategies();
        setSelectedStrategy(json.name);
      }
    } catch (e) {
      console.error("Failed to save strategy:", e);
    }
  };

  const saveFilter = async (filter: { name: string; description: string; conditions: FilterInfo["conditions"] }) => {
    try {
      const res = await fetch("http://localhost:8000/api/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filter),
      });
      const json = await res.json();
      if (json.success) {
        setShowFilterBuilder(false);
        await loadFilters();
        setActiveFilters((prev) => [...prev, json.name]);
      }
    } catch (e) {
      console.error("Failed to save filter:", e);
    }
  };

  const handleTradeClick = (trade: TradeEntry) => {
    setHighlightedTrade(trade);
  };

  const [detailError, setDetailError] = useState<string | null>(null);

  const loadStockDetail = async (symbol: string) => {
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    if (backtestAbortRef.current) backtestAbortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSelectedSymbol(symbol);
    setDetailLoading(true);
    setDetailError(null);
    // Keep stockDetail visible (stale) while loading — don't null it out
    setBacktestResult(null);
    setHighlightedTrade(null);
    setBacktestLoading(false);

    try {
      const params = realtimeFetch ? "?realtime=true" : "";
      const res = await fetch(`http://localhost:8000/api/stock/${symbol}/detail${params}`, {
        signal: controller.signal,
      });
      const json = await res.json();
      if (!controller.signal.aborted) {
        if (json.success) {
          setStockDetail(json);
          setDetailError(null);
        } else {
          setDetailError(json.error || "Failed to load chart data");
          // Keep previous stockDetail if available so chart doesn't disappear
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error("Failed to load detail:", e);
        if (!controller.signal.aborted) {
          setDetailError("Connection error — is the backend running?");
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setDetailLoading(false);
      }
    }
  };

  const closeDetail = () => {
    if (abortRef.current) abortRef.current.abort();
    if (backtestAbortRef.current) backtestAbortRef.current.abort();
    setSelectedSymbol(null);
    setStockDetail(null);
    setDetailLoading(false);
    setDetailError(null);
    setBacktestResult(null);
    setHighlightedTrade(null);
    setBacktestLoading(false);
  };

  useEffect(() => {
    checkHealth();
    loadDbInfo();
    loadStrategies();
    loadPortfolios();
    loadSettings();
    loadFilters();
  }, []);

  const isBusy = loading || fetching;
  const showDetail = selectedSymbol !== null;

  return (
    <div className="bg-tv-base text-tv-text font-sans h-screen flex flex-col overflow-hidden text-sm">
      {/* ─── HEADER ─── */}
      <header className="h-14 bg-tv-base border-b border-tv-border flex items-center px-4 select-none justify-between">
        <div className="flex items-center h-full space-x-4">
          <div className="font-bold text-lg tracking-tight text-white">
            Gravion{" "}
            <span className="text-xs text-tv-blue font-normal ml-1">v2.0</span>
          </div>
          <div className="h-6 w-px bg-tv-border" />
          <SourceSelector
            portfolios={portfolios}
            selectedSource={scannerSource}
            onSourceChange={setScannerSource}
          />
          <div className="h-6 w-px bg-tv-border" />
          <StrategySelector
            strategies={strategies}
            selectedStrategies={scannerStrategies}
            onStrategiesChange={setScannerStrategies}
          />
        </div>

        <div className="flex items-center space-x-6">
          {/* Realtime Fetch Toggle */}
          <div className="flex items-center cursor-pointer group">
            <span className="text-xs text-tv-muted font-medium mr-3 group-hover:text-tv-text transition">
              Realtime Fetch
            </span>
            <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
              <input
                type="checkbox"
                checked={realtimeFetch}
                onChange={(e) => setRealtimeFetch(e.target.checked)}
                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300 left-0"
              />
              <label className="toggle-label block overflow-hidden h-5 rounded-full bg-tv-border cursor-pointer transition-colors duration-300" />
            </div>
          </div>

          {/* Run Button */}
          <button
            onClick={runAction}
            disabled={isBusy}
            className="bg-tv-blue hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md text-sm font-semibold shadow-lg shadow-blue-900/20 transition transform active:scale-95 flex items-center cursor-pointer"
          >
            {isBusy ? (
              <>
                <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {fetching ? "Fetching..." : "Screening..."}
              </>
            ) : realtimeFetch ? (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Fetch &amp; Run
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Run Scanner
              </>
            )}
          </button>
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT ICON SIDEBAR ─── */}
        <aside className="w-12 border-r border-tv-border flex flex-col items-center py-4 space-y-4 bg-tv-base z-10">
          {/* Scanner */}
          <button
            onClick={() => setActiveView("scanner")}
            className={`p-2 rounded transition cursor-pointer ${
              activeView === "scanner" ? "text-tv-blue bg-tv-panel" : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
            title="Scanner"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          {/* Backtest Workspace */}
          <button
            onClick={() => setActiveView("backtest")}
            className={`p-2 rounded transition cursor-pointer ${
              activeView === "backtest" ? "text-tv-blue bg-tv-panel" : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
            title="Backtest Workspace"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </button>
          {/* Portfolios */}
          <button
            onClick={() => setActiveView("portfolios")}
            className={`p-2 rounded transition cursor-pointer ${
              activeView === "portfolios" ? "text-tv-blue bg-tv-panel" : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
            title="Portfolios"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
          {/* Settings */}
          <button
            onClick={() => setActiveView("settings")}
            className={`p-2 rounded transition cursor-pointer ${
              activeView === "settings" ? "text-tv-blue bg-tv-panel" : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {/* Visual Builder Button */}
          <button
            onClick={() => setShowVisualBuilder(true)}
            className="p-2 text-tv-muted hover:text-tv-text hover:bg-tv-panel rounded transition cursor-pointer"
            title="Visual Strategy Builder"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
          </button>
        </aside>

        {/* ─── MAIN CONTENT ─── */}
        {activeView === "scanner" ? (
          <>
            <main className="flex-1 flex flex-col bg-tv-base relative min-w-0">
              {/* Filter Bar */}
              <div className="h-10 border-b border-tv-border flex items-center px-4 space-x-3 bg-tv-base text-xs shrink-0">
                <span className="text-tv-text font-bold shrink-0">Results: {stocks.length}</span>
                <div className="h-4 w-px bg-tv-border" />
                {/* Filter selector + chips */}
                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                  <select
                    value=""
                    onChange={(e) => {
                      const name = e.target.value;
                      if (name && !activeFilters.includes(name)) {
                        setActiveFilters((prev) => [...prev, name]);
                      }
                    }}
                    className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-0.5 outline-none focus:border-tv-blue cursor-pointer"
                  >
                    <option value="">+ Add Filter</option>
                    {filters.filter((f) => !activeFilters.includes(f.name)).map((f) => (
                      <option key={f.name} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowFilterBuilder(true)}
                    className="text-tv-muted hover:text-tv-blue transition cursor-pointer p-0.5"
                    title="Build custom filter"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {/* Active filter chips */}
                  {activeFilters.map((name, i) => (
                    <span key={name} className="flex items-center space-x-1 bg-tv-blue/10 text-tv-blue px-2 py-0.5 rounded border border-tv-blue/20 whitespace-nowrap shrink-0">
                      {i > 0 && (
                        <button
                          onClick={() => setFilterOperator((prev) => prev === "AND" ? "OR" : "AND")}
                          className="text-[9px] text-tv-blue/60 hover:text-tv-blue mr-1 cursor-pointer font-bold"
                          title="Toggle AND/OR"
                        >
                          {filterOperator}
                        </button>
                      )}
                      <span>{name}</span>
                      <button
                        onClick={() => setActiveFilters((prev) => prev.filter((f) => f !== name))}
                        className="text-tv-blue/60 hover:text-tv-blue cursor-pointer ml-0.5"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  {/* Condition tags from last screen */}
                  {filterTags.length > 0 && activeFilters.length > 0 && (
                    <div className="flex items-center space-x-1">
                      {filterTags.map((tag, i) => (
                        <span key={i} className="bg-tv-panel text-tv-muted px-2 py-0.5 rounded border border-tv-border whitespace-nowrap shrink-0 text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {activeFilters.length > 0 && (
                    <button
                      onClick={() => { setActiveFilters([]); setFilterTags([]); }}
                      className="text-tv-muted hover:text-tv-red transition cursor-pointer shrink-0"
                      title="Clear all filters"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {error && <span className="text-tv-red ml-2 shrink-0">{error}</span>}
                <div className="ml-auto flex items-center space-x-4 text-tv-muted shrink-0">
                  <ExportButton stocks={stocks} disabled={isBusy} />
                  <div className="h-4 w-px bg-tv-border" />
                  <span>
                    Source: <span className="text-tv-text font-medium">Yahoo Finance (yfinance)</span>
                  </span>
                </div>
              </div>

              {/* Chart + Grid area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Chart Panel — visible whenever a stock is selected and we have data */}
                {showDetail && stockDetail && (
                  <ChartPanel
                    detail={stockDetail}
                    onClose={closeDetail}
                    strategies={strategies}
                    selectedStrategy={selectedStrategy}
                    onStrategyChange={setSelectedStrategy}
                    onRunBacktest={runBacktest}
                    backtestLoading={backtestLoading}
                    highlightedTrade={highlightedTrade}
                    isLoading={detailLoading}
                    loadingSymbol={selectedSymbol ?? undefined}
                  />
                )}

                {/* Loading state — no previous chart to show yet */}
                {showDetail && !stockDetail && detailLoading && (
                  <div className="border-b border-tv-border flex items-center justify-center" style={{ height: "45%" }}>
                    <div className="text-center">
                      <div className="inline-block w-6 h-6 border-2 border-tv-blue border-t-transparent rounded-full animate-spin mb-2" />
                      <p className="text-tv-muted text-xs">Loading chart for {selectedSymbol}...</p>
                    </div>
                  </div>
                )}

                {/* Error state — data fetch failed and no cache to show */}
                {showDetail && !stockDetail && !detailLoading && detailError && (
                  <div className="border-b border-tv-border flex items-center justify-center" style={{ height: "45%" }}>
                    <div className="text-center px-6">
                      <div className="w-10 h-10 bg-tv-red/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-5 h-5 text-tv-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <p className="text-tv-red text-xs font-medium mb-1">Chart unavailable</p>
                      <p className="text-tv-muted text-xs">{detailError}</p>
                      <p className="text-tv-muted text-xs mt-2">Enable <strong className="text-tv-text">Realtime Fetch</strong> and click <strong className="text-tv-blue">Fetch &amp; Run</strong> to download data.</p>
                    </div>
                  </div>
                )}

                {/* Data Grid */}
                <div className="flex-1 overflow-auto">
                  {isBusy ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="inline-block w-8 h-8 border-2 border-tv-blue border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-tv-muted">
                          {fetching
                            ? "Fetching NASDAQ 100 data from Yahoo Finance..."
                            : "Screening cached data..."}
                        </p>
                      </div>
                    </div>
                  ) : stocks.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-tv-panel rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium mb-2 text-tv-text">No Scan Results</h3>
                        <p className="text-tv-muted mb-1 text-xs">
                          Enable <strong className="text-tv-text">Realtime Fetch</strong> and click{" "}
                          <strong className="text-tv-blue">Fetch &amp; Run</strong> to download fresh data.
                        </p>
                        <p className="text-tv-muted mb-4 text-xs">
                          Or click <strong className="text-tv-blue">Run Scanner</strong> to screen cached data.
                        </p>
                        <button
                          onClick={runAction}
                          className="bg-tv-blue hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium transition cursor-pointer"
                        >
                          {realtimeFetch ? "Fetch & Run" : "Run Scanner"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <DataGrid
                      stocks={stocks}
                      selectedSymbol={selectedSymbol}
                      onSelectStock={loadStockDetail}
                      comparisonStrategies={comparisonStrategies}
                    />
                  )}
                </div>
              </div>

              {/* Footer Status Bar */}
              <footer className="h-8 border-t border-tv-border flex items-center px-4 bg-tv-panel text-xs text-tv-muted select-none justify-between shrink-0">
                <div className="flex items-center space-x-4">
                  <span className="flex items-center">
                    <div
                      className={`w-2 h-2 rounded-full mr-2 ${
                        backendStatus === "connected" ? "bg-tv-green" : "bg-tv-red"
                      }`}
                    />
                    {backendStatus === "connected" ? "Backend Online" : "Backend Offline"}
                  </span>
                  <span>
                    Database: <span className="text-tv-text">{dbInfo.path}</span> ({formatBytes(dbInfo.size_bytes)})
                  </span>
                </div>
                <div>
                  Next Auto-Scan: <span className="text-tv-text">Disabled</span>
                </div>
              </footer>
            </main>

            {/* ─── RIGHT DETAIL INSPECTOR ─── */}
            {showDetail && (
              <DetailInspector
                detail={stockDetail}
                loading={detailLoading}
                onClose={closeDetail}
                backtestResult={backtestResult}
                backtestLoading={backtestLoading}
                onTradeClick={handleTradeClick}
              />
            )}
          </>
        ) : activeView === "backtest" ? (
          <BacktestWorkspace
            strategies={strategies}
            availableSymbols={stocks.map((s) => s.symbol)}
            onOpenVisualBuilder={() => setShowVisualBuilder(true)}
            onStrategiesChanged={loadStrategies}
            portfolios={portfolios}
          />
        ) : activeView === "portfolios" ? (
          <PortfolioManager
            portfolios={portfolios}
            onPortfoliosChanged={loadPortfolios}
          />
        ) : activeView === "settings" ? (
          <SettingsPanel
            settings={settings}
            onSettingsChanged={setSettings}
          />
        ) : null}
      </div>

      {/* ─── VISUAL BUILDER MODAL ─── */}
      {showVisualBuilder && (
        <VisualBuilder
          onSave={saveVisualStrategy}
          onClose={() => setShowVisualBuilder(false)}
        />
      )}

      {showFilterBuilder && (
        <FilterBuilder
          onSave={saveFilter}
          onClose={() => setShowFilterBuilder(false)}
        />
      )}
    </div>
  );
}
