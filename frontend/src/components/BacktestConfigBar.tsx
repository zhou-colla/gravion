import { useState, useRef, useEffect } from "react";
import type { StrategyInfo, Portfolio } from "../types/stock";

interface BacktestConfigBarProps {
  selectedSymbols: string[];
  onSymbolsChange: (symbols: string[]) => void;
  availableSymbols: string[];
  strategies: StrategyInfo[];
  selectedStrategy: string;
  onStrategyChange: (name: string) => void;
  period: string;
  onPeriodChange: (period: string) => void;
  usePeriod: boolean;
  onUsePeriodChange: (usePeriod: boolean) => void;
  startDate: string;
  onStartDateChange: (date: string) => void;
  endDate: string;
  onEndDateChange: (date: string) => void;
  onRun: () => void;
  onOpenVisualBuilder: () => void;
  onDeleteStrategy: (name: string) => void;
  loading: boolean;
  portfolios: Portfolio[];
  sourceMode: "manual" | "portfolio";
  onSourceModeChange: (mode: "manual" | "portfolio") => void;
  selectedPortfolioId: number | null;
  onPortfolioChange: (id: number | null) => void;
}

export default function BacktestConfigBar({
  selectedSymbols,
  onSymbolsChange,
  availableSymbols,
  strategies,
  selectedStrategy,
  onStrategyChange,
  period,
  onPeriodChange,
  usePeriod,
  onUsePeriodChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onRun,
  onOpenVisualBuilder,
  onDeleteStrategy,
  loading,
  portfolios,
  sourceMode,
  onSourceModeChange,
  selectedPortfolioId,
  onPortfolioChange,
}: BacktestConfigBarProps) {
  const [symbolInput, setSymbolInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredSymbols = symbolInput.trim()
    ? availableSymbols.filter(
        (s) =>
          s.toLowerCase().includes(symbolInput.toLowerCase()) &&
          !selectedSymbols.includes(s)
      ).slice(0, 8)
    : [];

  const addSymbol = (symbol: string) => {
    const sym = symbol.toUpperCase().trim();
    if (sym && !selectedSymbols.includes(sym)) {
      onSymbolsChange([...selectedSymbols, sym]);
    }
    setSymbolInput("");
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeSymbol = (symbol: string) => {
    onSymbolsChange(selectedSymbols.filter((s) => s !== symbol));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && symbolInput.trim()) {
      e.preventDefault();
      if (filteredSymbols.length > 0) {
        addSymbol(filteredSymbols[0]);
      } else {
        addSymbol(symbolInput);
      }
    } else if (e.key === "Backspace" && !symbolInput && selectedSymbols.length > 0) {
      removeSymbol(selectedSymbols[selectedSymbols.length - 1]);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handlePortfolioSelect = async (id: number) => {
    onPortfolioChange(id);
    // Load portfolio symbols to populate the chip display
    try {
      const res = await fetch(`http://localhost:8000/api/portfolios/${id}`);
      const json = await res.json();
      if (json.success && json.symbols) {
        onSymbolsChange(json.symbols);
      }
    } catch {
      /* silent */
    }
  };

  const selectedStrategyInfo = strategies.find((s) => s.name === selectedStrategy);
  const canDelete = selectedStrategyInfo && !selectedStrategyInfo.builtin;
  const canRun =
    ((sourceMode === "manual" && selectedSymbols.length > 0) ||
      (sourceMode === "portfolio" && selectedPortfolioId !== null)) &&
    !!selectedStrategy &&
    !loading;

  return (
    <div className="border-b border-tv-border bg-tv-base px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Manual / Portfolio Toggle */}
        <div className="flex bg-tv-panel rounded border border-tv-border overflow-hidden">
          <button
            onClick={() => onSourceModeChange("manual")}
            className={`px-2 py-1 text-xs transition cursor-pointer ${
              sourceMode === "manual" ? "bg-tv-blue text-white" : "text-tv-muted hover:text-tv-text"
            }`}
          >
            Manual
          </button>
          <button
            onClick={() => onSourceModeChange("portfolio")}
            className={`px-2 py-1 text-xs transition cursor-pointer ${
              sourceMode === "portfolio" ? "bg-tv-blue text-white" : "text-tv-muted hover:text-tv-text"
            }`}
          >
            Portfolio
          </button>
        </div>

        {/* Portfolio Dropdown (when portfolio mode) */}
        {sourceMode === "portfolio" ? (
          <select
            value={selectedPortfolioId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val) handlePortfolioSelect(Number(val));
              else onPortfolioChange(null);
            }}
            className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue cursor-pointer min-w-[180px]"
          >
            <option value="">Select portfolio...</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.symbol_count})
              </option>
            ))}
          </select>
        ) : null}

        {/* Ticker Selector (manual mode) */}
        <div className={`relative flex-1 min-w-[280px] ${sourceMode === "portfolio" ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="flex flex-wrap items-center gap-1 bg-tv-panel border border-tv-border rounded px-2 py-1 min-h-[32px]">
            {selectedSymbols.map((sym) => (
              <span
                key={sym}
                className="inline-flex items-center bg-tv-blue/10 text-tv-blue text-xs px-2 py-0.5 rounded border border-tv-blue/20"
              >
                {sym}
                <button
                  onClick={() => removeSymbol(sym)}
                  className="ml-1 text-tv-blue/60 hover:text-tv-blue cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={symbolInput}
              onChange={(e) => {
                setSymbolInput(e.target.value.toUpperCase());
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleKeyDown}
              placeholder={selectedSymbols.length === 0 ? "Add tickers (e.g. AAPL, MSFT)..." : "Add more..."}
              className="bg-transparent text-tv-text text-xs outline-none flex-1 min-w-[100px] py-0.5"
            />
          </div>
          {/* Autocomplete Dropdown */}
          {showDropdown && filteredSymbols.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 bg-tv-panel border border-tv-border rounded shadow-lg z-20 max-h-48 overflow-y-auto"
            >
              {filteredSymbols.map((sym) => (
                <button
                  key={sym}
                  onClick={() => addSymbol(sym)}
                  className="w-full text-left px-3 py-1.5 text-xs text-tv-text hover:bg-tv-hover transition cursor-pointer"
                >
                  {sym}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeline Picker */}
        <div className="flex items-center gap-2">
          <div className="flex bg-tv-panel rounded border border-tv-border overflow-hidden">
            <button
              onClick={() => onUsePeriodChange(true)}
              className={`px-2 py-1 text-xs transition cursor-pointer ${
                usePeriod ? "bg-tv-blue text-white" : "text-tv-muted hover:text-tv-text"
              }`}
            >
              Period
            </button>
            <button
              onClick={() => onUsePeriodChange(false)}
              className={`px-2 py-1 text-xs transition cursor-pointer ${
                !usePeriod ? "bg-tv-blue text-white" : "text-tv-muted hover:text-tv-text"
              }`}
            >
              Range
            </button>
          </div>

          {usePeriod ? (
            <select
              value={period}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue cursor-pointer"
            >
              <option value="6mo">6 Months</option>
              <option value="1y">1 Year</option>
              <option value="2y">2 Years</option>
              <option value="5y">5 Years</option>
            </select>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue"
                style={{ colorScheme: "dark" }}
              />
              <span className="text-tv-muted text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue"
                style={{ colorScheme: "dark" }}
              />
            </div>
          )}
        </div>

        {/* Strategy Selector */}
        <div className="flex items-center gap-1">
          <select
            value={selectedStrategy}
            onChange={(e) => onStrategyChange(e.target.value)}
            className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue cursor-pointer"
          >
            <option value="">Strategy...</option>
            {strategies.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Create Strategy */}
          <button
            onClick={onOpenVisualBuilder}
            className="p-1.5 text-tv-muted hover:text-tv-blue hover:bg-tv-panel rounded transition cursor-pointer"
            title="Create Strategy"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Delete Strategy */}
          {canDelete && (
            <button
              onClick={() => onDeleteStrategy(selectedStrategy)}
              className="p-1.5 text-tv-muted hover:text-tv-red hover:bg-tv-panel rounded transition cursor-pointer"
              title="Delete Strategy"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>

        {/* Run Button */}
        <button
          onClick={onRun}
          disabled={!canRun}
          className="bg-tv-green hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-xs font-semibold transition flex items-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              Run Backtest
            </>
          )}
        </button>
      </div>
    </div>
  );
}
