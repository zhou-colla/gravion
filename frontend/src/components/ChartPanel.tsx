import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";
import type { StockDetail, StrategyInfo, TradeEntry } from "../types/stock";
import type { Translation } from "../i18n";

type RangeKey = "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "All";
const RANGES: RangeKey[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "All"];
const DAY_MAP: Record<string, number> = { "1M": 30, "3M": 91, "6M": 183, "1Y": 365, "2Y": 730, "5Y": 1825 };

interface ChartPanelProps {
  detail: StockDetail;
  onClose?: () => void;
  strategies: StrategyInfo[];
  selectedStrategy: string;
  onStrategyChange: (name: string) => void;
  onRunBacktest: () => void;
  backtestLoading: boolean;
  highlightedTrade: TradeEntry | null;
  isLoading?: boolean;
  loadingSymbol?: string;
  t: Translation;
}

export default function ChartPanel({
  detail,
  onClose,
  strategies,
  selectedStrategy,
  onStrategyChange,
  onRunBacktest,
  backtestLoading,
  highlightedTrade,
  isLoading = false,
  loadingSymbol,
  t,
}: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const markersRef = useRef<{ detach: () => void } | null>(null);
  const [activeRange, setActiveRange] = useState<RangeKey>("All");

  const applyRange = (key: RangeKey) => {
    if (!chartRef.current) return;
    setActiveRange(key);
    if (key === "All") {
      chartRef.current.timeScale().fitContent();
      return;
    }
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - DAY_MAP[key] * 86400;
    chartRef.current.timeScale().setVisibleRange({
      from: startTs as Time,
      to: endTs as Time,
    });
  };

  useEffect(() => {
    if (!containerRef.current || detail.ohlc.length === 0) return;

    setActiveRange("All");

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#787B86",
        fontFamily: "'Roboto Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#2A2E39" },
        horzLines: { color: "#2A2E39" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: "#2A2E39",
      },
      timeScale: {
        borderColor: "#2A2E39",
        timeVisible: false,
      },
    });

    chartRef.current = chart;

    // Candlestick series (v5 API: addSeries with series type)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#089981",
      downColor: "#F23645",
      borderUpColor: "#089981",
      borderDownColor: "#F23645",
      wickUpColor: "#089981",
      wickDownColor: "#F23645",
    });
    candleSeries.setData(detail.ohlc as any);
    candleSeriesRef.current = candleSeries;

    // 50MA line
    if (detail.ma50.length > 0) {
      const ma50Series = chart.addSeries(LineSeries, {
        color: "#2962FF",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma50Series.setData(detail.ma50 as any);
    }

    // 100MA line
    if (detail.ma100.length > 0) {
      const ma100Series = chart.addSeries(LineSeries, {
        color: "#F6A90E",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma100Series.setData(detail.ma100 as any);
    }

    chart.timeScale().fitContent();

    return () => {
      if (markersRef.current) {
        markersRef.current.detach();
        markersRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [detail]);

  // Update markers when highlightedTrade changes
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Remove previous markers
    if (markersRef.current) {
      markersRef.current.detach();
      markersRef.current = null;
    }

    if (!highlightedTrade) return;

    markersRef.current = createSeriesMarkers(candleSeriesRef.current, [
      {
        time: highlightedTrade.date as any,
        position: highlightedTrade.type === "BUY" ? "belowBar" : "aboveBar",
        color: highlightedTrade.type === "BUY" ? "#089981" : "#F23645",
        shape: highlightedTrade.type === "BUY" ? "arrowUp" : "arrowDown",
        text: highlightedTrade.type,
      },
    ]);
  }, [highlightedTrade]);

  return (
    <div className="flex flex-col border-b border-tv-border" style={{ height: "45%" }}>
      {/* Chart Header */}
      <div className="h-9 border-b border-tv-border flex items-center px-4 justify-between bg-tv-base shrink-0">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <span className="font-bold text-tv-text">{detail.symbol}</span>
          <span className="text-tv-muted text-xs truncate">{detail.company_name}</span>
          {detail.ohlc.length > 0 && (
            <span className="text-tv-text font-mono text-sm shrink-0">
              ${detail.ohlc[detail.ohlc.length - 1].close.toFixed(2)}
            </span>
          )}
          <div className="h-4 w-px bg-tv-border shrink-0" />
          <div className="flex items-center space-x-3 text-xs shrink-0">
            <span className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#2962FF] mr-1" />
              <span className="text-tv-muted">50MA</span>
            </span>
            <span className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#F6A90E] mr-1" />
              <span className="text-tv-muted">100MA</span>
            </span>
            {detail.current_rsi !== null && detail.current_rsi !== undefined && (
              <span className="flex items-center text-tv-muted">
                {t.rsi} <span className={`ml-1 font-mono font-medium ${
                  detail.current_rsi < 30 ? "text-tv-green" : detail.current_rsi > 70 ? "text-tv-red" : "text-tv-text"
                }`}>{detail.current_rsi.toFixed(1)}</span>
              </span>
            )}
          </div>
          {detail.from_cache && (
            <span className="text-[10px] text-tv-muted bg-tv-panel border border-tv-border/50 rounded px-1.5 py-0.5 shrink-0">
              {t.cached}
            </span>
          )}
          <div className="h-4 w-px bg-tv-border shrink-0" />
          {/* Strategy Controls */}
          <select
            value={selectedStrategy}
            onChange={(e) => onStrategyChange(e.target.value)}
            className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue cursor-pointer shrink-0"
          >
            <option value="">{t.strategy}...</option>
            {strategies.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={onRunBacktest}
            disabled={!selectedStrategy || backtestLoading}
            className="bg-tv-green hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white px-2 py-1 rounded text-xs font-medium transition flex items-center cursor-pointer shrink-0"
          >
            {backtestLoading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            )}
          </button>
        </div>

        {/* Range buttons */}
        <div className="flex items-center gap-0.5 mx-2 shrink-0">
          <button
            onClick={() => applyRange("1M")}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${
              activeRange === "1M"
                ? "bg-tv-blue text-white"
                : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
          >
            {t.range1M}
          </button>
          <button
            onClick={() => applyRange("3M")}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${
              activeRange === "3M"
                ? "bg-tv-blue text-white"
                : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
          >
            {t.range3M}
          </button>
          <button
            onClick={() => applyRange("6M")}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${
              activeRange === "6M"
                ? "bg-tv-blue text-white"
                : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
          >
            {t.range6M}
          </button>
          <button
            onClick={() => applyRange("1Y")}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${
              activeRange === "1Y"
                ? "bg-tv-blue text-white"
                : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
          >
            {t.range1Y}
          </button>
          <button
            onClick={() => applyRange("2Y")}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${
              activeRange === "2Y"
                ? "bg-tv-blue text-white"
                : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
          >
            {t.range2Y}
          </button>
          <button
            onClick={() => applyRange("5Y")}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${
              activeRange === "5Y"
                ? "bg-tv-blue text-white"
                : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
          >
            {t.range5Y}
          </button>
          <button
            onClick={() => applyRange("All")}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${
              activeRange === "All"
                ? "bg-tv-blue text-white"
                : "text-tv-muted hover:text-tv-text hover:bg-tv-panel"
            }`}
          >
            {t.rangeAll}
          </button>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-tv-muted hover:text-tv-text transition p-1 cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Chart Container */}
      <div ref={containerRef} className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-tv-base/60 flex items-center justify-center z-10 pointer-events-none">
            <div className="flex items-center space-x-2 bg-tv-panel border border-tv-border rounded px-3 py-2">
              <div className="w-4 h-4 border-2 border-tv-blue border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-tv-muted">{t.loadingChart.replace('{{symbol}}', loadingSymbol || '')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
