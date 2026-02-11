import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";
import type { IChartApi } from "lightweight-charts";
import type { StockDetail } from "../types/stock";

interface ChartPanelProps {
  detail: StockDetail;
  onClose: () => void;
}

export default function ChartPanel({ detail, onClose }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || detail.ohlc.length === 0) return;

    const chart = createChart(containerRef.current, {
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

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#089981",
      downColor: "#F23645",
      borderUpColor: "#089981",
      borderDownColor: "#F23645",
      wickUpColor: "#089981",
      wickDownColor: "#F23645",
    });
    candleSeries.setData(detail.ohlc as any);

    // 50MA line
    if (detail.ma50.length > 0) {
      const ma50Series = chart.addLineSeries({
        color: "#2962FF",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma50Series.setData(detail.ma50 as any);
    }

    // 100MA line
    if (detail.ma100.length > 0) {
      const ma100Series = chart.addLineSeries({
        color: "#F6A90E",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma100Series.setData(detail.ma100 as any);
    }

    chart.timeScale().fitContent();

    // Responsive resize
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [detail]);

  return (
    <div className="flex flex-col border-b border-tv-border" style={{ height: "45%" }}>
      {/* Chart Header */}
      <div className="h-9 border-b border-tv-border flex items-center px-4 justify-between bg-tv-base shrink-0">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-tv-text">{detail.symbol}</span>
          <span className="text-tv-muted text-xs">{detail.company_name}</span>
          {detail.ohlc.length > 0 && (
            <span className="text-tv-text font-mono text-sm">
              ${detail.ohlc[detail.ohlc.length - 1].close.toFixed(2)}
            </span>
          )}
          <div className="h-4 w-px bg-tv-border" />
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#2962FF] mr-1" />
              <span className="text-tv-muted">50MA</span>
            </span>
            <span className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#F6A90E] mr-1" />
              <span className="text-tv-muted">100MA</span>
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-tv-muted hover:text-tv-text transition p-1 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Chart Container */}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
