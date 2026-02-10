import { useState, useEffect } from "react";

interface StockRow {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  change_percent: number;
  timestamp: string;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return (vol / 1_000_000_000).toFixed(1) + "B";
  if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + "M";
  if (vol >= 1_000) return (vol / 1_000).toFixed(1) + "K";
  return vol.toString();
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return ts;
  }
}

export default function App() {
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [lastUpdate, setLastUpdate] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockRow | null>(null);

  const runScan = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("http://localhost:8000/api/run-scan");
      const json = await res.json();
      if (json.success && json.data) {
        setStocks(json.data);
        setBackendStatus("connected");
        setLastUpdate(formatTime(new Date().toISOString()));
        if (json.data.length > 0) setSelectedStock(json.data[0]);
      } else {
        setError(json.error || "Scan returned no data");
        setBackendStatus("disconnected");
      }
    } catch {
      setError("Cannot connect to backend. Is the Python server running on port 8000?");
      setBackendStatus("disconnected");
    } finally {
      setLoading(false);
    }
  };

  const checkHealth = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/health");
      const json = await res.json();
      setBackendStatus(json.status === "ok" ? "connected" : "disconnected");
    } catch {
      setBackendStatus("disconnected");
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="bg-tv-base text-tv-text font-sans h-screen flex flex-col overflow-hidden text-sm select-none">
      {/* ─── HEADER ─── */}
      <header className="h-12 bg-tv-base border-b border-tv-border flex items-center px-3">
        {/* Brand + Universe */}
        <div className="flex items-center border-r border-tv-border pr-4 h-full">
          <div className="font-bold text-lg tracking-tight mr-4">Gravion</div>
          <div className="flex items-center bg-tv-base hover:bg-tv-panel cursor-pointer text-tv-text px-2 py-1.5 rounded transition">
            <span className="font-bold mr-2">AAPL</span>
            <span className="text-tv-muted text-xs mr-2">Apple Inc.</span>
            <svg className="w-3 h-3 text-tv-muted" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>

        {/* Timeframe + Buttons */}
        <div className="flex items-center px-4 space-x-1 h-full">
          <button className="px-2 py-1 hover:bg-tv-panel hover:text-tv-blue rounded text-tv-muted transition font-medium">
            1D
          </button>
          <button className="px-2 py-1 bg-tv-panel text-tv-blue rounded font-medium">1W</button>
          <div className="w-px h-5 bg-tv-border mx-2" />
          <button className="flex items-center px-2 py-1 hover:bg-tv-panel rounded text-tv-text transition">
            <svg className="w-4 h-4 mr-1.5 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Indicators
          </button>
          <button className="flex items-center px-2 py-1 hover:bg-tv-panel rounded text-tv-text transition">
            <svg className="w-4 h-4 mr-1.5 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Strategy Settings
          </button>
        </div>

        {/* Right: Run Screener */}
        <div className="ml-auto flex items-center space-x-2">
          <button
            onClick={runScan}
            disabled={loading}
            className="bg-tv-blue hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium transition cursor-pointer"
          >
            {loading ? "Scanning..." : "Run Screener"}
          </button>
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT ICON SIDEBAR ─── */}
        <aside className="w-12 border-r border-tv-border flex flex-col items-center py-4 space-y-4 bg-tv-base">
          <button className="p-2 text-tv-blue bg-tv-panel rounded hover:text-white transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          <button className="p-2 text-tv-muted hover:text-tv-text hover:bg-tv-panel rounded transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          <div className="w-4 h-px bg-tv-border" />
          <button className="p-2 text-tv-muted hover:text-tv-text hover:bg-tv-panel rounded transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </button>
        </aside>

        {/* ─── MAIN CONTENT ─── */}
        <main className="flex-1 flex flex-col bg-tv-base relative">
          {/* Filter Bar */}
          <div className="h-10 border-b border-tv-border flex items-center px-4 space-x-4 bg-tv-base">
            <span className="text-tv-text font-bold text-sm">
              Matches ({stocks.length})
            </span>
            <div className="h-4 w-px bg-tv-border" />
            {stocks.length > 0 && (
              <div className="flex space-x-2">
                <div className="flex items-center bg-tv-blue/10 text-tv-blue px-2 py-0.5 rounded text-xs border border-tv-blue/30">
                  Phase 1: Single Stock
                </div>
                <div className="flex items-center bg-tv-blue/10 text-tv-blue px-2 py-0.5 rounded text-xs border border-tv-blue/30">
                  Source: yfinance
                </div>
              </div>
            )}
            {error && (
              <span className="text-tv-red text-xs ml-2">{error}</span>
            )}
          </div>

          {/* Data Grid */}
          <div className="flex-1 overflow-auto bg-tv-base">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="inline-block w-8 h-8 border-2 border-tv-blue border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-tv-muted">Fetching AAPL data from Yahoo Finance...</p>
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
                  <p className="text-tv-muted mb-4 text-xs">
                    Click <strong className="text-tv-blue">Run Screener</strong> to fetch AAPL data
                  </p>
                  <button
                    onClick={runScan}
                    className="bg-tv-blue hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium transition cursor-pointer"
                  >
                    Run Screener
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-tv-base z-10 text-xs text-tv-muted uppercase font-medium">
                  <tr className="border-b border-tv-border">
                    <th className="px-4 py-2 w-40 border-r border-tv-border/50">Ticker</th>
                    <th className="px-4 py-2 w-24 text-right border-r border-tv-border/50">Price</th>
                    <th className="px-4 py-2 w-24 text-right border-r border-tv-border/50">Chg %</th>
                    <th className="px-4 py-2 border-r border-tv-border/50">Technical Rating</th>
                    <th className="px-4 py-2 text-right border-r border-tv-border/50">YoY Growth</th>
                    <th className="px-4 py-2 w-24 text-right">Volume</th>
                  </tr>
                </thead>
                <tbody className="text-tv-text divide-y divide-tv-border font-medium">
                  {stocks.map((stock) => {
                    const isPositive = stock.change_percent > 0;
                    const isNegative = stock.change_percent < 0;
                    const priceColor = isPositive
                      ? "text-tv-green"
                      : isNegative
                        ? "text-tv-red"
                        : "text-tv-text";
                    const changeColor = isPositive
                      ? "text-tv-green"
                      : isNegative
                        ? "text-tv-red"
                        : "text-tv-muted";

                    return (
                      <tr
                        key={stock.symbol}
                        onClick={() => setSelectedStock(stock)}
                        className={`hover:bg-tv-panel transition group cursor-pointer ${
                          selectedStock?.symbol === stock.symbol ? "bg-tv-panel" : ""
                        }`}
                      >
                        <td className="px-4 py-2 flex items-center">
                          <span className="bg-blue-600/20 text-blue-400 w-5 h-5 flex items-center justify-center rounded text-[10px] mr-2 font-bold">
                            {stock.symbol.charAt(0)}
                          </span>
                          <span className="text-tv-blue font-bold group-hover:underline">
                            {stock.symbol}
                          </span>
                          <span className="text-tv-muted text-xs ml-2 font-normal">US</span>
                        </td>
                        <td className={`px-4 py-2 text-right ${priceColor}`}>
                          {stock.price.toFixed(2)}
                        </td>
                        <td className={`px-4 py-2 text-right ${changeColor}`}>
                          {isPositive ? "+" : ""}
                          {stock.change_percent.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-tv-muted text-xs font-bold tracking-wide">
                            NEUTRAL
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-tv-muted">--</td>
                        <td className="px-4 py-2 text-right text-tv-muted font-mono text-xs">
                          {formatVolume(stock.volume)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer Status Bar */}
          <footer className="h-8 border-t border-tv-border flex items-center px-4 bg-tv-base text-xs text-tv-muted">
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <span
                  className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                    backendStatus === "connected" ? "bg-tv-green" : "bg-tv-red"
                  }`}
                />
                {backendStatus === "connected" ? "Online" : "Offline"}
              </span>
              {lastUpdate && <span>Last Update: {lastUpdate}</span>}
            </div>
            <div className="ml-auto flex items-center space-x-4">
              <span>
                Backend:{" "}
                <span
                  className={
                    backendStatus === "connected" ? "text-tv-green" : "text-tv-red"
                  }
                >
                  {backendStatus === "connected" ? "Connected" : backendStatus === "disconnected" ? "Disconnected" : "Checking..."}
                </span>
              </span>
              <span>Phase 1 | yfinance</span>
            </div>
          </footer>
        </main>

        {/* ─── RIGHT SIDEBAR ─── */}
        <aside className="w-72 bg-tv-base border-l border-tv-border flex flex-col">
          <div className="h-10 border-b border-tv-border flex items-center px-3 justify-between">
            <span className="text-xs font-bold tracking-wider text-tv-text">WATCHLIST</span>
            <button className="text-tv-muted hover:text-tv-text text-lg">+</button>
          </div>

          {/* Watchlist Items */}
          <div className="flex-1 overflow-auto">
            {stocks.length > 0 ? (
              stocks.map((stock) => (
                <div
                  key={stock.symbol}
                  onClick={() => setSelectedStock(stock)}
                  className={`flex items-center justify-between px-3 py-2 border-b border-tv-border hover:bg-tv-panel cursor-pointer ${
                    selectedStock?.symbol === stock.symbol ? "bg-tv-panel" : ""
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">{stock.symbol}</div>
                    <div className="text-xs text-tv-muted">{stock.name}</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm ${
                        stock.change_percent > 0
                          ? "text-tv-green"
                          : stock.change_percent < 0
                            ? "text-tv-red"
                            : "text-tv-text"
                      }`}
                    >
                      {stock.price.toFixed(2)}
                    </div>
                    <div
                      className={`text-xs ${
                        stock.change_percent > 0
                          ? "text-tv-green"
                          : stock.change_percent < 0
                            ? "text-tv-red"
                            : "text-tv-muted"
                      }`}
                    >
                      {stock.change_percent > 0 ? "+" : ""}
                      {stock.change_percent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-32 text-tv-muted text-xs">
                Run a scan to populate watchlist
              </div>
            )}
          </div>

          {/* Key Stats */}
          <div className="h-1/3 border-t border-tv-border p-3">
            {selectedStock ? (
              <>
                <div className="text-xs font-bold text-tv-muted mb-2">
                  KEY STATS ({selectedStock.symbol})
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-tv-muted">Price</span>
                    <span className="text-tv-text">${selectedStock.price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tv-muted">Volume</span>
                    <span className="text-tv-text">{formatVolume(selectedStock.volume)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-tv-muted">Change</span>
                    <span
                      className={
                        selectedStock.change_percent > 0
                          ? "text-tv-green"
                          : selectedStock.change_percent < 0
                            ? "text-tv-red"
                            : "text-tv-text"
                      }
                    >
                      {selectedStock.change_percent > 0 ? "+" : ""}
                      {selectedStock.change_percent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-4 pt-2 border-t border-tv-border">
                    <div className="text-tv-muted mb-1">Data Source</div>
                    <div className="text-tv-blue font-bold">Yahoo Finance</div>
                  </div>
                  <div>
                    <div className="text-tv-muted mb-1">Storage</div>
                    <div className="text-tv-green font-bold">SQLite (local)</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-tv-muted text-xs">
                Select a stock to view details
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
