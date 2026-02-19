import { useState, useRef, useEffect } from "react";
import type { Portfolio } from "../types/stock";
import type { Translation } from "../i18n";

export type SourceSelection =
  | { type: "portfolio"; portfolioId: number; portfolioName: string }
  | { type: "manual"; symbols: string[] };

interface SourceSelectorProps {
  portfolios: Portfolio[];
  selectedSource: SourceSelection;
  onSourceChange: (source: SourceSelection) => void;
  t?: Translation;
}

export default function SourceSelector({ portfolios, selectedSource, onSourceChange, t }: SourceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const label =
    selectedSource.type === "portfolio"
      ? selectedSource.portfolioName
      : `Manual (${selectedSource.symbols.length})`;

  const handlePortfolioSelect = (p: Portfolio) => {
    onSourceChange({ type: "portfolio", portfolioId: p.id, portfolioName: p.name });
    setOpen(false);
  };

  const handleManualSelect = () => {
    onSourceChange({ type: "manual", symbols: selectedSource.type === "manual" ? selectedSource.symbols : [] });
    setOpen(false);
  };

  const handleManualSubmit = () => {
    if (!manualInput.trim()) return;
    const symbols = manualInput
      .toUpperCase()
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const unique = [...new Set([...(selectedSource.type === "manual" ? selectedSource.symbols : []), ...symbols])];
    onSourceChange({ type: "manual", symbols: unique });
    setManualInput("");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center bg-tv-panel hover:bg-tv-hover cursor-pointer px-3 py-1.5 rounded transition border border-transparent hover:border-tv-border"
      >
        <span className="mr-2 text-lg">
          {selectedSource.type === "portfolio" ? "\ud83d\udcca" : "\u270d\ufe0f"}
        </span>
        <span className="font-bold mr-2 text-sm">{label}</span>
        <svg className={`w-3 h-3 text-tv-muted transition ${open ? "rotate-180" : ""}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-tv-panel border border-tv-border rounded-lg shadow-xl z-30 min-w-[220px] overflow-hidden">
          <div className="py-1">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-muted font-semibold">
              Portfolios
            </div>
            {portfolios.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePortfolioSelect(p)}
                className={`w-full text-left px-3 py-2 text-xs transition cursor-pointer flex items-center justify-between ${
                  selectedSource.type === "portfolio" && selectedSource.portfolioId === p.id
                    ? "bg-tv-blue/10 text-tv-blue"
                    : "text-tv-text hover:bg-tv-hover"
                }`}
              >
                <span className="flex items-center gap-2">
                  {p.is_system && (
                    <svg className="w-3 h-3 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                  {p.name}
                </span>
                <span className="text-tv-muted text-[10px]">{p.symbol_count}</span>
              </button>
            ))}
            <div className="border-t border-tv-border my-1" />
            <button
              onClick={handleManualSelect}
              className={`w-full text-left px-3 py-2 text-xs transition cursor-pointer ${
                selectedSource.type === "manual"
                  ? "bg-tv-blue/10 text-tv-blue"
                  : "text-tv-text hover:bg-tv-hover"
              }`}
            >
              Manual Input...
            </button>
          </div>

          {selectedSource.type === "manual" && (
            <div className="border-t border-tv-border px-3 py-2">
              <div className="flex gap-1.5 flex-wrap mb-2">
                {selectedSource.symbols.map((s) => (
                  <span key={s} className="inline-flex items-center bg-tv-blue/10 text-tv-blue text-[10px] px-1.5 py-0.5 rounded border border-tv-blue/20">
                    {s}
                    <button
                      onClick={() => {
                        const filtered = selectedSource.symbols.filter((sym) => sym !== s);
                        onSourceChange({ type: "manual", symbols: filtered });
                      }}
                      className="ml-1 text-tv-blue/50 hover:text-tv-blue cursor-pointer"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                  placeholder="AAPL, MSFT..."
                  className="flex-1 bg-tv-base text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue"
                  autoFocus
                />
                <button
                  onClick={handleManualSubmit}
                  disabled={!manualInput.trim()}
                  className="bg-tv-blue hover:bg-blue-600 disabled:opacity-30 text-white px-2 py-1 rounded text-[10px] font-medium transition cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
