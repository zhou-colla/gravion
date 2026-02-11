import type { StockRow } from "../types/stock";

interface ExportButtonProps {
  stocks: StockRow[];
  disabled: boolean;
}

export default function ExportButton({ stocks, disabled }: ExportButtonProps) {
  const handleExport = () => {
    if (stocks.length === 0) return;

    const headers = ["Ticker", "Name", "Price", "Open", "High", "Low", "Close", "Volume", "Change %", "Signal", "Last Fetched"];
    const rows = stocks.map((s) => [
      s.symbol,
      s.name,
      s.price,
      s.open ?? "",
      s.high ?? "",
      s.low ?? "",
      s.close ?? "",
      s.volume,
      s.change_percent,
      s.signal,
      s.last_fetched ?? "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

    const link = document.createElement("a");
    link.href = url;
    link.download = `gravion_scan_${ts}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || stocks.length === 0}
      className="flex items-center text-tv-muted hover:text-tv-text disabled:opacity-30 disabled:cursor-not-allowed transition text-xs cursor-pointer"
      title="Export to CSV"
    >
      <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Export CSV
    </button>
  );
}
