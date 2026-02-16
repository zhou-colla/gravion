import type { StrategyInfo } from "../types/stock";

interface StrategySelectorProps {
  strategies: StrategyInfo[];
  selectedStrategy: string;
  onStrategyChange: (name: string) => void;
}

export default function StrategySelector({
  strategies,
  selectedStrategy,
  onStrategyChange,
}: StrategySelectorProps) {
  return (
    <div className="flex items-center space-x-2">
      <span className="text-xs text-tv-muted font-medium">Signal Strategy:</span>
      <select
        value={selectedStrategy}
        onChange={(e) => onStrategyChange(e.target.value)}
        className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1 outline-none focus:border-tv-blue cursor-pointer"
      >
        <option value="">Default (Price Change)</option>
        {strategies.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>
      {selectedStrategy && (
        <span className="text-xs text-tv-blue font-medium px-2 py-0.5 rounded bg-tv-blue/10 border border-tv-blue/20">
          {selectedStrategy}
        </span>
      )}
    </div>
  );
}
