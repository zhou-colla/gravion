import type { StockDetail } from "../types/stock";

interface DetailInspectorProps {
  detail: StockDetail | null;
  loading: boolean;
  onClose: () => void;
}

function formatMarketCap(value: number | null): string {
  if (value === null || value === undefined) return "--";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

function SkeletonLine({ width = "w-full" }: { width?: string }) {
  return <div className={`h-4 ${width} bg-tv-border/50 rounded animate-pulse`} />;
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-tv-muted text-xs">{label}</span>
      <span className={`font-mono text-xs ${color || "text-tv-text"}`}>{value}</span>
    </div>
  );
}

export default function DetailInspector({ detail, loading, onClose }: DetailInspectorProps) {
  if (loading) {
    return (
      <aside className="w-[280px] border-l border-tv-border bg-tv-base flex flex-col shrink-0">
        <div className="h-9 border-b border-tv-border flex items-center px-4 justify-between shrink-0">
          <SkeletonLine width="w-24" />
        </div>
        <div className="p-4 space-y-4">
          <SkeletonLine width="w-32" />
          <div className="space-y-3">
            <SkeletonLine />
            <SkeletonLine width="w-3/4" />
            <SkeletonLine />
            <SkeletonLine width="w-2/3" />
          </div>
          <div className="h-px bg-tv-border" />
          <div className="space-y-3">
            <SkeletonLine />
            <SkeletonLine width="w-3/4" />
            <SkeletonLine />
          </div>
        </div>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside className="w-[280px] border-l border-tv-border bg-tv-base flex flex-col items-center justify-center shrink-0">
        <div className="text-center px-6">
          <div className="w-12 h-12 bg-tv-panel rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-tv-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-tv-muted text-xs">Select a stock to view details</p>
        </div>
      </aside>
    );
  }

  const f = detail.fundamentals;
  const lastPrice = detail.ohlc.length > 0 ? detail.ohlc[detail.ohlc.length - 1].close : null;

  return (
    <aside className="w-[280px] border-l border-tv-border bg-tv-base flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="h-9 border-b border-tv-border flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="font-bold text-tv-text truncate">{detail.symbol}</span>
          <span className="text-tv-muted text-xs truncate">{detail.company_name}</span>
        </div>
        <button
          onClick={onClose}
          className="text-tv-muted hover:text-tv-text transition p-1 ml-2 shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Fundamentals */}
        <div>
          <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">Fundamentals</h4>
          <div className="divide-y divide-tv-border/30">
            <StatRow label="PE Ratio" value={f.pe_ratio !== null ? f.pe_ratio.toFixed(2) : "--"} />
            <StatRow label="Market Cap" value={formatMarketCap(f.market_cap)} />
            <StatRow label="Next Earnings" value={f.earnings_date || "--"} />
            <StatRow label="Sector" value={f.sector || "--"} />
          </div>
        </div>

        <div className="h-px bg-tv-border" />

        {/* Price Statistics */}
        <div>
          <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">Price Statistics</h4>
          <div className="divide-y divide-tv-border/30">
            <StatRow
              label="52W High"
              value={f.fifty_two_week_high !== null ? `$${f.fifty_two_week_high.toFixed(2)}` : "--"}
              color="text-tv-green"
            />
            <StatRow
              label="52W Low"
              value={f.fifty_two_week_low !== null ? `$${f.fifty_two_week_low.toFixed(2)}` : "--"}
              color="text-tv-red"
            />
            {lastPrice !== null && (
              <StatRow label="Current" value={`$${lastPrice.toFixed(2)}`} />
            )}
          </div>
        </div>

        {/* 52W Range Bar */}
        {f.fifty_two_week_high !== null && f.fifty_two_week_low !== null && lastPrice !== null && (
          <>
            <div className="h-px bg-tv-border" />
            <div>
              <h4 className="text-[10px] text-tv-muted uppercase font-bold tracking-wider mb-2">52 Week Range</h4>
              <div className="relative h-1.5 bg-tv-border rounded-full">
                <div
                  className="absolute h-1.5 bg-tv-blue rounded-full"
                  style={{
                    left: "0%",
                    width: `${Math.min(100, Math.max(0, ((lastPrice - f.fifty_two_week_low) / (f.fifty_two_week_high - f.fifty_two_week_low)) * 100))}%`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-tv-muted">
                <span>${f.fifty_two_week_low.toFixed(0)}</span>
                <span>${f.fifty_two_week_high.toFixed(0)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
