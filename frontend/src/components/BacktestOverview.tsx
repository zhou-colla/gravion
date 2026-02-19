import { useEffect, useRef } from "react";
import { createChart, ColorType, LineSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { BatchBacktestSummary, EquityCurvePoint } from "../types/stock";
import type { Translation } from "../i18n";

export interface StrategyOverviewData {
  strategyName: string;
  color: string;
  summary: BatchBacktestSummary;
  equityCurve: EquityCurvePoint[];
}

interface BacktestOverviewProps {
  strategies: StrategyOverviewData[];
  t: Translation;
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

function fmtMoney(v: number): string {
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BacktestOverview({ strategies, t }: BacktestOverviewProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
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
      crosshair: {
        vertLine: { color: "#787B86", style: 2, width: 1 },
        horzLine: { color: "#787B86", style: 2, width: 1 },
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    // Add series and track them for tooltip
    const seriesEntries: Array<{ name: string; color: string; series: ISeriesApi<"Line"> }> = [];
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
      seriesEntries.push({ name: s.strategyName, color: s.color, series });
    }

    chart.timeScale().fitContent();

    // ── Synchronized crosshair tooltip ──
    const tooltipEl = tooltipRef.current;
    const containerEl = chartContainerRef.current;

    if (tooltipEl && containerEl) {
      chart.subscribeCrosshairMove((param) => {
        if (
          !param.point ||
          param.point.x < 0 ||
          param.point.y < 0 ||
          !param.time
        ) {
          tooltipEl.style.display = "none";
          return;
        }

        // Gather values for each series
        const rows: string[] = [];
        for (const { name, color, series } of seriesEntries) {
          const dataPoint = param.seriesData.get(series) as
            | { value?: number }
            | undefined;
          if (dataPoint?.value !== undefined) {
            rows.push(
              `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap">` +
              `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>` +
              `<span style="color:#787B86;flex:1">${name}</span>` +
              `<span style="color:${color};font-weight:600;margin-left:8px">${fmtMoney(dataPoint.value)}</span>` +
              `</div>`
            );
          }
        }

        if (rows.length === 0) {
          tooltipEl.style.display = "none";
          return;
        }

        // Format date
        const timeStr = String(param.time); // "YYYY-MM-DD"
        let dateLabel = timeStr;
        try {
          const [y, m, d] = timeStr.split("-").map(Number);
          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          dateLabel = `${months[m - 1]} ${d}, ${y}`;
        } catch {
          // keep raw string
        }

        tooltipEl.innerHTML =
          `<div style="color:#787B86;font-size:10px;margin-bottom:4px;border-bottom:1px solid #2A2E39;padding-bottom:3px">${dateLabel}</div>` +
          rows.join("");
        tooltipEl.style.display = "block";

        // Position: follow cursor, clamp to container bounds
        const containerWidth = containerEl.offsetWidth;
        const tooltipWidth = tooltipEl.offsetWidth || 190;
        let left = param.point.x + 14;
        if (left + tooltipWidth > containerWidth - 8) {
          left = param.point.x - tooltipWidth - 14;
        }
        let top = param.point.y - 12;
        if (top < 0) top = 4;

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
      });
    }

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
      if (tooltipEl) tooltipEl.style.display = "none";
    };
  }, [strategies]);

  if (strategies.length === 0) return null;

  // Shared chart block (reused in both layouts)
  const chartBlock = (label: string) => (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">{label}</div>
      {/* Wrapper is relative so the tooltip absolute-positions correctly */}
      <div className="relative">
        <div ref={chartContainerRef} className="h-[140px] rounded border border-tv-border/30" />
        {/* Crosshair tooltip */}
        <div
          ref={tooltipRef}
          style={{
            display: "none",
            position: "absolute",
            zIndex: 20,
            backgroundColor: "#1E222D",
            border: "1px solid #363A45",
            borderRadius: "4px",
            padding: "7px 10px",
            fontFamily: "'Roboto Mono', monospace",
            fontSize: "11px",
            lineHeight: "1.7",
            pointerEvents: "none",
            minWidth: "190px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        />
      </div>
      {isMulti && (
        <div className="flex flex-wrap gap-3 mt-1.5">
          {strategies.map((s) => (
            <span key={s.strategyName} className="flex items-center gap-1 text-[10px] text-tv-muted">
              <span className="w-5 h-0.5 inline-block rounded" style={{ backgroundColor: s.color }} />
              {s.strategyName}
            </span>
          ))}
        </div>
      )}
    </div>
  );

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
                  <th className="text-left text-[10px] text-tv-muted uppercase pb-1.5 pr-3">{t.metric}</th>
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
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">{t.portfolioReturn}</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className={`py-1.5 px-2 text-right font-mono font-semibold ${s.summary.portfolio_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}`}>
                      {s.summary.portfolio_return_pct >= 0 ? "+" : ""}{s.summary.portfolio_return_pct.toFixed(2)}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">{t.avgWinRate}</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className={`py-1.5 px-2 text-right font-mono ${s.summary.avg_win_rate_pct >= 50 ? "text-tv-green" : "text-tv-red"}`}>
                      {s.summary.avg_win_rate_pct.toFixed(1)}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">{t.totalTrades}</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className="py-1.5 px-2 text-right font-mono text-tv-text">
                      {s.summary.total_trades}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">{t.bestTicker}</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className="py-1.5 px-2 text-right font-mono text-tv-green">
                      {s.summary.best_ticker || "--"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-tv-muted">{t.worstTicker}</td>
                  {strategies.map((s) => (
                    <td key={s.strategyName} className="py-1.5 px-2 text-right font-mono text-tv-red">
                      {s.summary.worst_ticker || "--"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {chartBlock(t.equityCurves)}
        </div>
      ) : (
        /* ── Single-strategy layout ── */
        <div className="flex gap-4">
          <div className="grid grid-cols-2 gap-2 w-64 shrink-0">
            <MetricCard
              label={t.portfolioReturn}
              value={`${strategies[0].summary.portfolio_return_pct >= 0 ? "+" : ""}${strategies[0].summary.portfolio_return_pct.toFixed(2)}%`}
              color={strategies[0].summary.portfolio_return_pct >= 0 ? "text-tv-green" : "text-tv-red"}
            />
            <MetricCard label={t.totalTrades} value={`${strategies[0].summary.total_trades}`} />
            <MetricCard label={t.bestTicker} value={strategies[0].summary.best_ticker || "--"} color="text-tv-green" />
            <MetricCard label={t.worstTicker} value={strategies[0].summary.worst_ticker || "--"} color="text-tv-red" />
          </div>
          {chartBlock(t.portfolioEquityCurve)}
        </div>
      )}
    </div>
  );
}
