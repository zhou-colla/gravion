import type { StockRow } from "../types/stock";

function formatDataTime(lastFetched: string): { text: string; isRealtime: boolean } {
  try {
    const d = new Date(lastFetched);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) {
      return { text: d.toLocaleTimeString("en-US", { hour12: false }), isRealtime: true };
    } else if (d.toDateString() === now.toDateString()) {
      return { text: d.toLocaleTimeString("en-US", { hour12: false }), isRealtime: false };
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        return { text: "Yesterday", isRealtime: false };
      }
      return {
        text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        isRealtime: false,
      };
    }
  } catch {
    return { text: lastFetched || "--", isRealtime: false };
  }
}

function getSignalStyle(signal: string) {
  switch (signal) {
    case "STRONG BUY":
    case "BUY":
      return { bg: "bg-tv-green/10", text: "text-tv-green", border: "border-tv-green/30" };
    case "NEUTRAL":
      return { bg: "bg-tv-panel", text: "text-tv-muted", border: "border-tv-border" };
    case "SELL":
    case "STRONG SELL":
      return { bg: "bg-tv-red/10", text: "text-tv-red", border: "border-tv-red/30" };
    default:
      return { bg: "bg-tv-blue/10", text: "text-tv-blue", border: "border-tv-blue/30" };
  }
}

interface DataGridProps {
  stocks: StockRow[];
  selectedSymbol: string | null;
  onSelectStock: (symbol: string) => void;
}

export default function DataGrid({ stocks, selectedSymbol, onSelectStock }: DataGridProps) {
  return (
    <table className="w-full text-left border-collapse">
      <thead className="sticky top-0 bg-tv-base z-10 text-xs text-tv-muted uppercase font-medium">
        <tr className="border-b border-tv-border">
          <th className="px-4 py-2 w-32 border-r border-tv-border/30">Ticker</th>
          <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">Price</th>
          <th className="px-4 py-2 w-24 text-right border-r border-tv-border/30">Chg %</th>
          <th className="px-4 py-2 w-32 text-right border-r border-tv-border/30 text-tv-blue">Data Time</th>
          <th className="px-4 py-2 border-r border-tv-border/30">Signal Status</th>
          <th className="px-4 py-2 text-right">YoY Growth</th>
        </tr>
      </thead>
      <tbody className="text-tv-text divide-y divide-tv-border font-medium">
        {stocks.map((stock) => {
          const isPositive = stock.change_percent > 0;
          const isNegative = stock.change_percent < 0;
          const priceColor = isPositive ? "text-tv-green" : isNegative ? "text-tv-red" : "text-tv-text";
          const changeColor = isPositive ? "text-tv-green" : isNegative ? "text-tv-red" : "text-tv-muted";
          const dataTime = formatDataTime(stock.last_fetched);
          const signalStyle = getSignalStyle(stock.signal);
          const isSelected = selectedSymbol === stock.symbol;

          return (
            <tr
              key={stock.symbol}
              onClick={() => onSelectStock(stock.symbol)}
              className={`hover:bg-tv-panel transition group cursor-pointer ${
                isSelected ? "bg-tv-panel border-l-2 border-l-tv-blue" : ""
              }`}
            >
              <td className="px-4 py-2.5 flex items-center">
                <div
                  className={`w-1.5 h-1.5 rounded-full mr-2 ${
                    dataTime.isRealtime ? "bg-tv-green animate-pulse" : "bg-tv-muted"
                  }`}
                />
                <span className={`font-bold ${isSelected ? "text-tv-blue" : dataTime.isRealtime ? "text-tv-blue" : "text-tv-text"}`}>
                  {stock.symbol}
                </span>
              </td>
              <td className={`px-4 py-2.5 text-right ${priceColor}`}>
                ${stock.price.toFixed(2)}
              </td>
              <td className={`px-4 py-2.5 text-right ${changeColor}`}>
                {isPositive ? "+" : ""}
                {stock.change_percent.toFixed(2)}%
              </td>
              <td
                className={`px-4 py-2.5 text-right font-mono text-xs ${
                  dataTime.isRealtime ? "text-tv-text" : "text-tv-muted"
                }`}
              >
                {dataTime.text}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={`${signalStyle.bg} ${signalStyle.text} text-xs px-1.5 py-0.5 rounded border ${signalStyle.border}`}
                >
                  {stock.signal}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-tv-muted">--</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
