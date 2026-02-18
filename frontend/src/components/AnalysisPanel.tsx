import { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import type { IChartApi, Time } from "lightweight-charts";
import type {
  Portfolio,
  AppSettings,
  StockDetail,
  FinancialsResponse,
  FinancialStatement,
  FinancialSummary,
  YFinanceFundamentals,
} from "../types/stock";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtCny(v: number | null | undefined): string {
  if (v == null) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e8) return `¥${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `¥${(v / 1e4).toFixed(2)}万`;
  return v.toFixed(2);
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toFixed(2)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function pctColor(v: number | null | undefined): string {
  if (v == null) return "text-tv-muted";
  return v >= 0 ? "text-tv-green" : "text-tv-red";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-tv-blue border-t-transparent rounded-full animate-spin" />
  );
}

function SkeletonLine({ width = "w-full" }: { width?: string }) {
  return <div className={`h-3.5 ${width} bg-tv-border/50 rounded animate-pulse`} />;
}

function SkeletonChart({ height = "h-[180px]" }: { height?: string }) {
  return (
    <div className="bg-tv-panel border border-tv-border rounded-lg overflow-hidden">
      <div className="h-8 border-b border-tv-border" />
      <div className={`${height} flex items-end px-4 pb-4 gap-2`}>
        {[60, 90, 50, 110, 80, 95, 70, 105, 85, 65].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-tv-border/40 rounded-t animate-pulse"
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
    </div>
  );
}

function NoDataCard({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="bg-tv-panel border border-tv-border rounded-lg p-6 flex flex-col items-center justify-center text-center h-full min-h-[120px]">
      <svg className="w-8 h-8 text-tv-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p className="text-tv-muted text-xs font-medium">{message}</p>
      {hint && <p className="text-tv-muted/70 text-xs mt-1">{hint}</p>}
    </div>
  );
}

// ── Mini chart card wrapper ────────────────────────────────────────────────

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-tv-panel border border-tv-border rounded-lg overflow-hidden flex flex-col">
      <div className="h-8 border-b border-tv-border flex items-center px-3 shrink-0">
        <span className="text-xs font-medium text-tv-muted">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Revenue bar chart ──────────────────────────────────────────────────────

function RevenueBarChart({ statements }: { statements: FinancialStatement[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current || statements.length === 0) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#1e222d" }, textColor: "#787b86", fontSize: 10 },
      grid: { vertLines: { color: "#2A2E39" }, horzLines: { color: "#2A2E39" } },
      timeScale: { timeVisible: false, borderColor: "#2A2E39" },
      rightPriceScale: { borderColor: "#2A2E39" },
    });
    const series = chart.addSeries(HistogramSeries, {
      color: "#2962ff",
      priceFormat: { type: "volume" },
    });
    series.setData(
      statements
        .filter((s) => s.total_revenue != null)
        .map((s) => ({ time: s.end_date_iso as Time, value: s.total_revenue! }))
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [statements]);
  return <div ref={containerRef} className="flex-1 min-h-[160px]" />;
}

// ── EPS line chart ─────────────────────────────────────────────────────────

function EPSLineChart({ statements }: { statements: FinancialStatement[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current || statements.length === 0) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#1e222d" }, textColor: "#787b86", fontSize: 10 },
      grid: { vertLines: { color: "#2A2E39" }, horzLines: { color: "#2A2E39" } },
      timeScale: { timeVisible: false, borderColor: "#2A2E39" },
      rightPriceScale: { borderColor: "#2A2E39" },
    });
    const basic = statements.filter((s) => s.basic_eps != null);
    if (basic.length > 0) {
      const bs = chart.addSeries(LineSeries, { color: "#089981", lineWidth: 2, priceLineVisible: false });
      bs.setData(basic.map((s) => ({ time: s.end_date_iso as Time, value: s.basic_eps! })));
    }
    const diluted = statements.filter((s) => s.diluted_eps != null);
    if (diluted.length > 0) {
      const ds = chart.addSeries(LineSeries, {
        color: "#2962ff",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ds.setData(diluted.map((s) => ({ time: s.end_date_iso as Time, value: s.diluted_eps! })));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [statements]);
  return <div ref={containerRef} className="flex-1 min-h-[160px]" />;
}

// ── Profit margin chart ────────────────────────────────────────────────────

function ProfitMarginChart({ statements }: { statements: FinancialStatement[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current || statements.length === 0) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#1e222d" }, textColor: "#787b86", fontSize: 10 },
      grid: { vertLines: { color: "#2A2E39" }, horzLines: { color: "#2A2E39" } },
      timeScale: { timeVisible: false, borderColor: "#2A2E39" },
      rightPriceScale: { borderColor: "#2A2E39" },
    });
    const data = statements
      .filter((s) => s.n_income_attr_p != null && s.total_revenue != null && s.total_revenue !== 0)
      .map((s) => {
        const margin = (s.n_income_attr_p! / s.total_revenue!) * 100;
        return {
          time: s.end_date_iso as Time,
          value: margin,
          color: margin >= 20 ? "#089981" : margin >= 10 ? "#F6A90E" : "#F23645",
        };
      });
    if (data.length > 0) {
      const series = chart.addSeries(HistogramSeries, { priceFormat: { type: "percent" } });
      series.setData(data);
      chart.timeScale().fitContent();
    }
    return () => chart.remove();
  }, [statements]);
  return <div ref={containerRef} className="flex-1 min-h-[160px]" />;
}

// ── Key ratios panel ───────────────────────────────────────────────────────

function MetricCard({ label, value, valueClass = "text-tv-text" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-tv-base rounded p-2.5">
      <div className="text-[10px] text-tv-muted mb-1">{label}</div>
      <div className={`text-sm font-mono font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}

function KeyRatiosPanel({ summary }: { summary: FinancialSummary }) {
  return (
    <div className="flex-1 p-3 grid grid-cols-2 gap-2 content-start">
      <MetricCard label="Latest EPS" value={summary.latest_eps?.toFixed(2) ?? "--"} />
      <MetricCard
        label="Revenue Growth (YoY)"
        value={fmtPct(summary.revenue_growth_pct)}
        valueClass={pctColor(summary.revenue_growth_pct)}
      />
      <MetricCard
        label="Profit Growth (YoY)"
        value={fmtPct(summary.profit_growth_pct)}
        valueClass={pctColor(summary.profit_growth_pct)}
      />
      <MetricCard
        label="Avg Profit Margin"
        value={summary.avg_profit_margin_pct != null ? `${summary.avg_profit_margin_pct.toFixed(1)}%` : "--"}
        valueClass={
          summary.avg_profit_margin_pct != null
            ? summary.avg_profit_margin_pct >= 20 ? "text-tv-green"
            : summary.avg_profit_margin_pct >= 10 ? "text-[#F6A90E]"
            : "text-tv-red"
            : "text-tv-muted"
        }
      />
      <MetricCard label="Latest Revenue" value={fmtCny(summary.latest_revenue)} />
      <MetricCard label="Latest Net Profit" value={fmtCny(summary.latest_profit)} />
    </div>
  );
}

// ── US Fundamentals Panel ──────────────────────────────────────────────────

function USFundamentalsPanel({ fundamentals }: { fundamentals: YFinanceFundamentals }) {
  return (
    <div className="col-span-2 bg-tv-panel border border-tv-border rounded-lg overflow-hidden">
      <div className="h-8 border-b border-tv-border flex items-center px-3">
        <span className="text-xs font-medium text-tv-muted">Fundamentals (Yahoo Finance)</span>
        {fundamentals.sector && (
          <span className="ml-2 text-[10px] bg-tv-blue/10 text-tv-blue border border-tv-blue/20 rounded px-1.5 py-0.5">
            {fundamentals.sector}
          </span>
        )}
        {fundamentals.short_name && (
          <span className="ml-auto text-xs text-tv-muted">{fundamentals.short_name}</span>
        )}
      </div>
      <div className="p-3 grid grid-cols-4 gap-2">
        <MetricCard label="P/E Ratio" value={fundamentals.pe_ratio?.toFixed(2) ?? "--"} />
        <MetricCard label="Market Cap" value={fmtUsd(fundamentals.market_cap)} />
        <MetricCard label="Total Revenue" value={fmtUsd(fundamentals.total_revenue)} />
        <MetricCard
          label="Revenue Growth"
          value={fundamentals.revenue_growth != null ? fmtPct(fundamentals.revenue_growth * 100) : "--"}
          valueClass={pctColor(fundamentals.revenue_growth != null ? fundamentals.revenue_growth * 100 : null)}
        />
        <MetricCard
          label="Gross Margin"
          value={fundamentals.gross_margins != null ? `${(fundamentals.gross_margins * 100).toFixed(1)}%` : "--"}
        />
        <MetricCard
          label="Operating Margin"
          value={fundamentals.operating_margins != null ? `${(fundamentals.operating_margins * 100).toFixed(1)}%` : "--"}
          valueClass={
            fundamentals.operating_margins != null
              ? fundamentals.operating_margins >= 0.2 ? "text-tv-green"
              : fundamentals.operating_margins >= 0.1 ? "text-[#F6A90E]"
              : "text-tv-red"
              : "text-tv-muted"
          }
        />
      </div>
    </div>
  );
}

// ── Price chart section (inline lightweight-charts instance) ───────────────

type RangeKey2 = "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "All";
const RANGES2: RangeKey2[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "All"];
const DAY_MAP2: Record<string, number> = { "1M": 30, "3M": 91, "6M": 183, "1Y": 365, "2Y": 730, "5Y": 1825 };

function PriceChartSection({
  detail,
  loading,
  error,
  symbol,
}: {
  detail: StockDetail | null;
  loading: boolean;
  error: string | null;
  symbol: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [activeRange, setActiveRange] = useState<RangeKey2>("All");

  const applyRange = (key: RangeKey2) => {
    if (!chartRef.current) return;
    setActiveRange(key);
    if (key === "All") { chartRef.current.timeScale().fitContent(); return; }
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - DAY_MAP2[key] * 86400;
    chartRef.current.timeScale().setVisibleRange({ from: startTs as Time, to: endTs as Time });
  };

  useEffect(() => {
    if (!containerRef.current || !detail || detail.ohlc.length === 0) return;
    setActiveRange("All");
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#131722" }, textColor: "#787B86", fontSize: 11 },
      grid: { vertLines: { color: "#2A2E39" }, horzLines: { color: "#2A2E39" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#2A2E39" },
      timeScale: { borderColor: "#2A2E39", timeVisible: false },
    });
    chartRef.current = chart;
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: "#089981", downColor: "#F23645",
      borderUpColor: "#089981", borderDownColor: "#F23645",
      wickUpColor: "#089981", wickDownColor: "#F23645",
    });
    cs.setData(detail.ohlc as any);
    if (detail.ma50.length > 0) {
      const m50 = chart.addSeries(LineSeries, { color: "#2962FF", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      m50.setData(detail.ma50 as any);
    }
    if (detail.ma100.length > 0) {
      const m100 = chart.addSeries(LineSeries, { color: "#F6A90E", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      m100.setData(detail.ma100 as any);
    }
    chart.timeScale().fitContent();
    return () => { chart.remove(); chartRef.current = null; };
  }, [detail]);

  return (
    <div className="bg-tv-panel border border-tv-border rounded-lg overflow-hidden flex flex-col mb-4">
      {/* Header */}
      <div className="h-9 border-b border-tv-border flex items-center px-3 gap-3 shrink-0">
        <span className="font-bold text-tv-text text-sm">{symbol || "—"}</span>
        {detail && (
          <>
            <span className="text-tv-muted text-xs truncate">{detail.company_name}</span>
            {detail.ohlc.length > 0 && (
              <span className="text-tv-text font-mono text-sm shrink-0">
                ${detail.ohlc[detail.ohlc.length - 1].close.toFixed(2)}
              </span>
            )}
            <div className="flex items-center gap-3 text-xs text-tv-muted shrink-0">
              <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#2962FF] mr-1" />50MA</span>
              <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-[#F6A90E] mr-1" />100MA</span>
              {detail.current_rsi != null && (
                <span>RSI <span className={`font-mono font-medium ${detail.current_rsi < 30 ? "text-tv-green" : detail.current_rsi > 70 ? "text-tv-red" : "text-tv-text"}`}>{detail.current_rsi.toFixed(1)}</span></span>
              )}
            </div>
            {detail.from_cache && (
              <span className="text-[10px] text-tv-muted bg-tv-base border border-tv-border/50 rounded px-1.5 py-0.5 shrink-0">cached</span>
            )}
          </>
        )}
        {/* Range buttons */}
        <div className="flex items-center gap-0.5 ml-auto shrink-0">
          {RANGES2.map((r) => (
            <button key={r} onClick={() => applyRange(r)}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${
                activeRange === r ? "bg-tv-blue text-white" : "text-tv-muted hover:text-tv-text hover:bg-tv-hover"
              }`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="h-[260px] relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 bg-tv-panel border border-tv-border rounded px-3 py-2">
              <Spinner />
              <span className="text-xs text-tv-muted">Loading chart…</span>
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center text-center p-4">
            <div>
              <p className="text-tv-red text-xs font-medium mb-1">Chart unavailable</p>
              <p className="text-tv-muted text-xs">{error}</p>
            </div>
          </div>
        ) : !detail ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-tv-muted text-xs">Enter a symbol above to load the chart</p>
          </div>
        ) : (
          <div ref={containerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}

// ── Main AnalysisPanel ─────────────────────────────────────────────────────

interface AnalysisPanelProps {
  portfolios: Portfolio[];
  settings: AppSettings & { tushare_api_key?: string };
  realtimeFetch: boolean;
}

export default function AnalysisPanel({ portfolios, settings, realtimeFetch }: AnalysisPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [committedSymbol, setCommittedSymbol] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggBoxRef = useRef<HTMLDivElement>(null);

  const [startDate, setStartDate] = useState(settings.global_start_date || "");
  const [endDate, setEndDate] = useState(settings.global_end_date || "");

  const [priceDetail, setPriceDetail] = useState<StockDetail | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const [financials, setFinancials] = useState<FinancialsResponse | null>(null);
  const [financialsLoading, setFinancialsLoading] = useState(false);
  const [financialsError, setFinancialsError] = useState<string | null>(null);

  const priceAbortRef = useRef<AbortController | null>(null);
  const finAbortRef = useRef<AbortController | null>(null);

  // Collect all symbols from portfolios for autocomplete
  useEffect(() => {
    const syms = new Set<string>();
    portfolios.forEach((p) => {
      if ((p as any).symbols) {
        (p as any).symbols.forEach((s: string) => syms.add(s.toUpperCase()));
      }
    });
    setAllSymbols([...syms].sort());
  }, [portfolios]);

  // Update date defaults if global settings change
  useEffect(() => {
    if (!startDate && settings.global_start_date) setStartDate(settings.global_start_date);
    if (!endDate && settings.global_end_date) setEndDate(settings.global_end_date);
  }, [settings.global_start_date, settings.global_end_date]);

  // Autocomplete filter
  const handleInputChange = (v: string) => {
    setInputValue(v);
    if (v.trim().length > 0) {
      const q = v.toUpperCase();
      setSuggestions(allSymbols.filter((s) => s.startsWith(q)).slice(0, 8));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        suggBoxRef.current && !suggBoxRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAnalyze = useCallback(
    async (sym: string) => {
      const s = sym.trim().toUpperCase();
      if (!s) return;
      setCommittedSymbol(s);
      setInputValue(s);
      setShowSuggestions(false);

      // Abort any ongoing fetches
      if (priceAbortRef.current) priceAbortRef.current.abort();
      if (finAbortRef.current) finAbortRef.current.abort();

      const priceCtrl = new AbortController();
      const finCtrl = new AbortController();
      priceAbortRef.current = priceCtrl;
      finAbortRef.current = finCtrl;

      // Build date params
      const dateSuffix =
        startDate && endDate ? `&start_date=${startDate}&end_date=${endDate}` : "";

      // Fetch price detail
      setPriceLoading(true);
      setPriceError(null);
      setPriceDetail(null);

      // Fetch financials
      setFinancialsLoading(true);
      setFinancialsError(null);
      setFinancials(null);

      // Fire both in parallel
      Promise.all([
        fetch(
          `http://localhost:8000/api/stock/${s}/detail?realtime=${realtimeFetch}`,
          { signal: priceCtrl.signal }
        )
          .then((r) => r.json())
          .then((json) => {
            if (!priceCtrl.signal.aborted) {
              if (json.success) {
                setPriceDetail(json);
              } else {
                setPriceError(json.error || "Failed to load chart data");
              }
            }
          })
          .catch((e) => {
            if (!priceCtrl.signal.aborted) {
              setPriceError("Cannot connect to backend.");
            }
          })
          .finally(() => {
            if (!priceCtrl.signal.aborted) setPriceLoading(false);
          }),

        fetch(
          `http://localhost:8000/api/stock/${s}/financials?realtime=${realtimeFetch}${dateSuffix}`,
          { signal: finCtrl.signal }
        )
          .then((r) => r.json())
          .then((json: FinancialsResponse) => {
            if (!finCtrl.signal.aborted) {
              if (json.success) {
                setFinancials(json);
              } else {
                setFinancialsError(json.error || "Failed to load financial data");
                setFinancials(json); // preserve partial data (e.g. yfinance_fundamentals)
              }
            }
          })
          .catch((e) => {
            if (!finCtrl.signal.aborted) {
              setFinancialsError("Cannot connect to backend.");
            }
          })
          .finally(() => {
            if (!finCtrl.signal.aborted) setFinancialsLoading(false);
          }),
      ]);
    },
    [realtimeFetch, startDate, endDate]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setShowSuggestions(false);
      handleAnalyze(inputValue);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-tv-base min-w-0 overflow-hidden">
      {/* Top bar */}
      <div className="h-12 border-b border-tv-border flex items-center px-4 gap-3 shrink-0 bg-tv-base">
        {/* Symbol input + autocomplete */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => inputValue && setSuggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Symbol (e.g. 600519, AAPL)"
            className="bg-tv-panel text-tv-text text-sm border border-tv-border rounded px-3 py-1.5 outline-none focus:border-tv-blue w-52 placeholder:text-tv-muted/60"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggBoxRef}
              className="absolute top-full left-0 mt-1 bg-tv-panel border border-tv-border rounded shadow-xl z-30 min-w-[160px]"
            >
              {suggestions.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); handleAnalyze(s); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-tv-text hover:bg-tv-hover cursor-pointer transition"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 text-xs text-tv-muted">
          <span>From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue"
            style={{ colorScheme: "dark" }}
          />
          <span>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue"
            style={{ colorScheme: "dark" }}
          />
        </div>

        {/* Analyze button */}
        <button
          onClick={() => handleAnalyze(inputValue)}
          disabled={!inputValue.trim() || priceLoading || financialsLoading}
          className="bg-tv-blue hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
        >
          {(priceLoading || financialsLoading) ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Analyzing…</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Analyze</span>
            </>
          )}
        </button>

        {/* Realtime status */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-tv-muted">
          <div className={`w-1.5 h-1.5 rounded-full ${realtimeFetch ? "bg-tv-green animate-pulse" : "bg-tv-muted"}`} />
          {realtimeFetch ? "Realtime ON" : "Cache only"}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Price chart */}
        <PriceChartSection
          detail={priceDetail}
          loading={priceLoading}
          error={priceError}
          symbol={committedSymbol}
        />

        {/* Financial data section */}
        {!committedSymbol ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 bg-tv-panel border border-tv-border rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-tv-text text-sm font-medium mb-1">Stock Analysis Dashboard</h3>
            <p className="text-tv-muted text-xs max-w-xs">
              Enter a stock symbol above and click Analyze to load the price chart and financial statements.
            </p>
            <p className="text-tv-muted/60 text-xs mt-2">
              CN stocks (e.g. 600519) use Tushare income data · US stocks (e.g. AAPL) use Yahoo Finance fundamentals
            </p>
          </div>
        ) : financialsLoading ? (
          /* Skeleton */
          <div className="grid grid-cols-2 gap-4">
            <SkeletonChart />
            <SkeletonChart />
            <SkeletonChart />
            <div className="bg-tv-panel border border-tv-border rounded-lg overflow-hidden">
              <div className="h-8 border-b border-tv-border" />
              <div className="p-3 grid grid-cols-2 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-tv-base rounded p-2.5">
                    <SkeletonLine width="w-2/3" />
                    <div className="mt-1.5"><SkeletonLine width="w-1/2" /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : financialsError && !financials ? (
          /* Full error */
          <div className="bg-tv-panel border border-tv-red/30 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-4 h-4 text-tv-red shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
            <div>
              <p className="text-tv-red text-xs font-medium">Financial data unavailable</p>
              <p className="text-tv-muted text-xs mt-0.5">{financialsError}</p>
              {!realtimeFetch && (
                <p className="text-tv-muted text-xs mt-1">
                  Enable <strong className="text-tv-text">Realtime Fetch</strong> in the top bar to download data.
                </p>
              )}
            </div>
          </div>
        ) : financials && !financials.is_cn_stock ? (
          /* US stock: yfinance fundamentals */
          <div className="grid grid-cols-2 gap-4">
            {financials.yfinance_fundamentals ? (
              <USFundamentalsPanel fundamentals={financials.yfinance_fundamentals} />
            ) : (
              <div className="col-span-2">
                <NoDataCard
                  message="No fundamentals data"
                  hint={realtimeFetch ? "Yahoo Finance returned no data for this symbol." : "Enable Realtime Fetch to load US stock fundamentals."}
                />
              </div>
            )}
          </div>
        ) : financials && financials.is_cn_stock && financials.statements.length > 0 ? (
          /* CN stock: full financial charts */
          <div className="grid grid-cols-2 gap-4">
            <ChartCard title="Revenue (Quarterly)">
              <RevenueBarChart statements={financials.statements} />
            </ChartCard>
            <ChartCard title="EPS — Basic (green) · Diluted (blue dashed)">
              <EPSLineChart statements={financials.statements} />
            </ChartCard>
            <ChartCard title="Net Profit Margin % — ≥20% green · ≥10% amber · <10% red">
              <ProfitMarginChart statements={financials.statements} />
            </ChartCard>
            <ChartCard title="Key Metrics">
              {financials.summary ? (
                <KeyRatiosPanel summary={financials.summary} />
              ) : (
                <NoDataCard message="No summary data" />
              )}
            </ChartCard>
          </div>
        ) : financials ? (
          /* CN stock: no data */
          <NoDataCard
            message={financials.error || "No financial data available"}
            hint={!realtimeFetch ? "Enable Realtime Fetch to download financial statements." : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}
