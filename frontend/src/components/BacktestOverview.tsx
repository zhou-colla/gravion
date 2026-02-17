import { useEffect, useRef } from "react";
import { createChart, ColorType, LineSeries } from "lightweight-charts";
import type { IChartApi } from "lightweight-charts";
import type { BatchBacktestSummary, EquityCurvePoint } from "../types/stock";

export interface StrategyOverviewData {
  strategyName: string;
  color: string;
  summary: BatchBacktestSummary;
  equityCurve: EquityCurvePoint[];
}

interface BacktestOverviewProps {
  strategies: StrategyOverviewData[];
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

export default function BacktestOverview({ strategies }: BacktestOverviewProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const isMulti = strategies.length > 1;

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const hasCurveData = strategies.some((s) => s.equityCurve.length > 0);
    if (!hasCurveData) return;

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
      rightPriceScale: { borderColor: "#2A2E39" },
      timeScale: { borderColor: "#2A2E39", timeVisible: false },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    for (const s of strategies) {
      if (s.equityCurve.length === 0) continue;
      const series = chart.addSeries(LineSeries, {
        color: s.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: isMulti ? s.strategyName : "",
      });
      series.setData(s.equityCurve as any);
    }

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
  }, [strategies]);

  if (strategies.length === 0) return null;

  return (
    <div className="border-b border-tv-border p-4 shrink-0">
      {isMulti ? (
        /* ── Multi-strategy layout ── */
        <div className="flex gap-4">
          {/* Comparison table */}
          <div className="shrink-0 min-w-[280px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-tv-border">
                  <th className="text-left text-[10px] text-tv-muted uppercase pb-1.5 pr-3">Metric</th>
                  {strategies.map((s) => (
                    <th key={s.strategyName} className="text-right text-[10px] pb-1.5 px-2 whitespace-nowrap" style={{ color: s.color }}>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: s.color }} />
                        {s.strategyName}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border/40">
                {/* Portfolio Return */}
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">Portfolio Return</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className={`py-1.5 px-2 text-right font-mono font-semibold ${s.summary.portfolio_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}`}>
                      {s.summary.portfolio_return_pct >= 0 ? "+" : ""}{s.summary.portfolio_return_pct.toFixed(2)}%
                    </td>
                  ))}
                </tr>
                {/* Avg Win Rate */}
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">Avg Win Rate</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className={`py-1.5 px-2 text-right font-mono ${s.summary.avg_win_rate_pct >= 50 ? "text-tv-green" : "text-tv-red"}`}>
                      {s.summary.avg_win_rate_pct.toFixed(1)}%
                    </td>
                  ))}
                </tr>
                {/* Total Trades */}
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">Total Trades</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className="py-1.5 px-2 text-right font-mono text-tv-text">
                      {s.summary.total_trades}
                    </td>
                  ))}
                </tr>
                {/* Best Ticker */}
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">Best Ticker</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className="py-1.5 px-2 text-right font-mono text-tv-green">
                      {s.summary.best_ticker || "--"}
                    </td>
                  ))}
                </tr>
                {/* Worst Ticker */}
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">Worst Ticker</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className="py-1.5 px-2 text-right font-mono text-tv-red">
                      {s.summary.worst_ticker || "--"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Multi-line equity chart */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">Equity Curves</div>
            <div ref={chartContainerRef} className="h-[140px] rounded border border-tv-border/30" />
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-1.5">
              {strategies.map((s) => (
                <span key={s.strategyName} className="flex items-center gap-1 text-[10px] text-tv-muted">
                  <span className="w-5 h-0.5 inline-block rounded" style={{ backgroundColor: s.color }} />
                  {s.strategyName}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── Single-strategy layout (original) ── */
        <div className="flex gap-4">
          <div className="grid grid-cols-2 gap-2 w-64 shrink-0">
            <MetricCard
              label="Portfolio Return"
              value={`${strategies[0].summary.portfolio_return_pct >= 0 ? "+" : ""}${strategies[0].summary.portfolio_return_pct.toFixed(2)}%`}
              color={strategies[0].summary.portfolio_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}
            />
            <MetricCard
              label="Total Trades"
              value={`${strategies[0].summary.total_trades}`}
            />
            <MetricCard
              label="Best Ticker"
              value={strategies[0].summary.best_ticker || "--"}
              color="text-tv-green"
            />
            <MetricCard
              label="Worst Ticker"
              value={strategies[0].summary.worst_ticker || "--"}
              color="text-tv-red"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">Portfolio Equity Curve</div>
            <div ref={chartContainerRef} className="h-[140px] rounded border border-tv-border/30" />
          </div>
        </div>
      )}
    </div>
  );
}
