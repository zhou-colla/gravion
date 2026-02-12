import { useEffect, useRef } from "react";
import { createChart, ColorType, LineSeries } from "lightweight-charts";
import type { IChartApi } from "lightweight-charts";
import type { BatchBacktestSummary, EquityCurvePoint } from "../types/stock";

interface BacktestOverviewProps {
  summary: BatchBacktestSummary;
  equityCurve: EquityCurvePoint[];
}

function MetricCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="bg-tv-panel rounded-lg p-3 border border-tv-border/30">
      <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-lg font-bold ${color || "text-tv-text"}`}>{value}</div>
      {sub && <div className="text-[10px] text-tv-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function BacktestOverview({ summary, equityCurve }: BacktestOverviewProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || equityCurve.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1E222D" },
        textColor: "#787B86",
        fontFamily: "'Roboto Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#2A2E39" },
        horzLines: { color: "#2A2E39" },
      },
      rightPriceScale: {
        borderColor: "#2A2E39",
      },
      timeScale: {
        borderColor: "#2A2E39",
        timeVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#2962FF",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    lineSeries.setData(equityCurve as any);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    observer.observe(chartContainerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [equityCurve]);

  return (
    <div className="border-b border-tv-border p-4">
      <div className="flex gap-4">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 gap-2 w-64 shrink-0">
          <MetricCard
            label="Portfolio Return"
            value={`${summary.portfolio_return_pct >= 0 ? "+" : ""}${summary.portfolio_return_pct}%`}
            color={summary.portfolio_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}
          />
          <MetricCard
            label="Total Trades"
            value={`${summary.total_trades}`}
          />
          <MetricCard
            label="Best Ticker"
            value={summary.best_ticker || "--"}
            color="text-tv-green"
          />
          <MetricCard
            label="Worst Ticker"
            value={summary.worst_ticker || "--"}
            color="text-tv-red"
          />
        </div>

        {/* Equity Curve */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">Portfolio Equity Curve</div>
          <div ref={chartContainerRef} className="h-[140px] rounded border border-tv-border/30" />
        </div>
      </div>
    </div>
  );
}
