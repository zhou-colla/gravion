import { useState, useEffect } from "react";
import type { Portfolio, PortfolioDetail } from "../types/stock";
import type { Translation } from "../i18n";

interface PortfolioManagerProps {
  portfolios: Portfolio[];
  onPortfoliosChanged: () => void;
  t: Translation;
}

export default function PortfolioManager({ portfolios, onPortfoliosChanged, t }: PortfolioManagerProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PortfolioDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [symbolInput, setSymbolInput] = useState("");

  // Auto-select first portfolio
  useEffect(() => {
    if (portfolios.length > 0 && selectedId === null) {
      setSelectedId(portfolios[0].id);
    }
  }, [portfolios, selectedId]);

  // Load detail when selection changes
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`http://localhost:8000/api/portfolios/${selectedId}`);
        const json = await res.json();
        if (json.success) {
          setDetail({
            id: json.id,
            name: json.name,
            is_system: json.is_system,
            symbol_count: json.symbol_count,
            symbols: json.symbols,
          });
        }
      } catch (e) {
        console.error("Failed to load portfolio detail:", e);
      } finally {
        setDetailLoading(false);
      }
    };
    loadDetail();
  }, [selectedId]);

  const createPortfolio = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("http://localhost:8000/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setNewName("");
        onPortfoliosChanged();
        setSelectedId(json.id);
      }
    } catch (e) {
      console.error("Failed to create portfolio:", e);
    } finally {
      setCreating(false);
    }
  };

  const deletePortfolio = async (id: number) => {
    try {
      const res = await fetch(`http://localhost:8000/api/portfolios/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        if (selectedId === id) {
          setSelectedId(null);
          setDetail(null);
        }
        onPortfoliosChanged();
      }
    } catch (e) {
      console.error("Failed to delete portfolio:", e);
    }
  };

  const removeSymbol = async (symbol: string) => {
    if (!detail || detail.is_system) return;
    const newSymbols = detail.symbols.filter((s) => s !== symbol);
    try {
      const res = await fetch(`http://localhost:8000/api/portfolios/${detail.id}/symbols`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: newSymbols }),
      });
      const json = await res.json();
      if (json.success) {
        setDetail((prev) => prev ? { ...prev, symbols: json.symbols, symbol_count: json.symbol_count } : null);
        onPortfoliosChanged();
      }
    } catch (e) {
      console.error("Failed to remove symbol:", e);
    }
  };

  const addSymbols = async () => {
    if (!detail || detail.is_system || !symbolInput.trim()) return;
    const newSymbols = symbolInput
      .toUpperCase()
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s && !detail.symbols.includes(s));
    if (newSymbols.length === 0) {
      setSymbolInput("");
      return;
    }
    const allSymbols = [...detail.symbols, ...newSymbols];
    try {
      const res = await fetch(`http://localhost:8000/api/portfolios/${detail.id}/symbols`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: allSymbols }),
      });
      const json = await res.json();
      if (json.success) {
        setDetail((prev) => prev ? { ...prev, symbols: json.symbols, symbol_count: json.symbol_count } : null);
        setSymbolInput("");
        onPortfoliosChanged();
      }
    } catch (e) {
      console.error("Failed to add symbols:", e);
    }
  };

  return (
    <div className="flex-1 flex bg-tv-base min-w-0 overflow-hidden">
      {/* Left Pane: Portfolio List */}
      <div className="w-72 border-r border-tv-border flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-tv-border">
          <h2 className="text-sm font-bold text-tv-text mb-3">{t.portfolios}</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPortfolio()}
              placeholder={`${t.portfolioName}...`}
              className="flex-1 bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue"
            />
            <button
              onClick={createPortfolio}
              disabled={!newName.trim() || creating}
              className="bg-tv-blue hover:bg-blue-600 disabled:opacity-30 text-white px-3 py-1.5 rounded text-xs font-medium transition cursor-pointer"
            >
              {t.createPortfolio}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {portfolios.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`flex items-center justify-between px-4 py-2.5 cursor-pointer border-b border-tv-border/50 transition ${
                selectedId === p.id ? "bg-tv-panel border-l-2 border-l-tv-blue" : "hover:bg-tv-hover"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {p.is_system ? (
                  <svg className="w-3.5 h-3.5 text-tv-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-tv-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                )}
                <span className="text-xs text-tv-text truncate">{p.name}</span>
                <span className="text-[10px] text-tv-muted">({p.symbol_count})</span>
              </div>
              {!p.is_system && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePortfolio(p.id);
                  }}
                  className="text-tv-muted hover:text-tv-red transition cursor-pointer p-0.5"
                  title={t.delete}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Pane: Portfolio Detail */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-tv-muted text-sm">{t.portfolios}</p>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="inline-block w-6 h-6 border-2 border-tv-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : detail ? (
          <>
            <div className="px-5 py-4 border-b border-tv-border">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-tv-text">{detail.name}</h3>
                {detail.is_system && (
                  <span className="text-[10px] bg-tv-panel border border-tv-border rounded px-1.5 py-0.5 text-tv-muted">
                    System
                  </span>
                )}
                <span className="text-xs text-tv-muted ml-auto">{detail.symbols.length} symbols</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap gap-1.5">
                {detail.symbols.map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center bg-tv-panel text-tv-text text-xs px-2 py-1 rounded border border-tv-border"
                  >
                    {sym}
                    {!detail.is_system && (
                      <button
                        onClick={() => removeSymbol(sym)}
                        className="ml-1.5 text-tv-muted hover:text-tv-red transition cursor-pointer"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
            {!detail.is_system && (
              <div className="px-5 py-3 border-t border-tv-border">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={symbolInput}
                    onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && addSymbols()}
                    placeholder={`${t.addSymbol} (e.g. AAPL, MSFT, TSLA)...`}
                    className="flex-1 bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue"
                  />
                  <button
                    onClick={addSymbols}
                    disabled={!symbolInput.trim()}
                    className="bg-tv-blue hover:bg-blue-600 disabled:opacity-30 text-white px-4 py-2 rounded text-xs font-medium transition cursor-pointer"
                  >
                    {t.addSymbol}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
