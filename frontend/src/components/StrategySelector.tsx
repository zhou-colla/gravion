import { useState, useRef, useEffect } from "react";
import type { StrategyInfo } from "../types/stock";

interface StrategySelectorProps {
  strategies: StrategyInfo[];
  selectedStrategies: string[];
  onStrategiesChange: (names: string[]) => void;
  label?: string;
}

export default function StrategySelector({
  strategies,
  selectedStrategies,
  onStrategiesChange,
  label = "Signal Strategies",
}: StrategySelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (name: string) => {
    if (selectedStrategies.includes(name)) {
      onStrategiesChange(selectedStrategies.filter((s) => s !== name));
    } else {
      onStrategiesChange([...selectedStrategies, name]);
    }
  };

  return (
    <div className="flex items-center space-x-2" ref={ref}>
      <span className="text-xs text-tv-muted font-medium shrink-0">{label}:</span>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center space-x-1.5 bg-tv-panel border border-tv-border rounded px-2 py-1 text-xs text-tv-text outline-none hover:border-tv-blue transition cursor-pointer min-w-[120px]"
        >
          <span className="flex-1 text-left truncate">
            {selectedStrategies.length === 0
              ? "None"
              : selectedStrategies.length === 1
              ? selectedStrategies[0]
              : `${selectedStrategies.length} strategies`}
          </span>
          <svg className={`w-3 h-3 text-tv-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 bg-tv-panel border border-tv-border rounded shadow-lg z-20 min-w-[180px]">
            {strategies.map((s) => {
              const checked = selectedStrategies.includes(s.name);
              return (
                <button
                  key={s.name}
                  onClick={() => toggle(s.name)}
                  className="w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-tv-text hover:bg-tv-hover transition cursor-pointer text-left"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-tv-blue border-tv-blue" : "border-tv-border"}`}>
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{s.name}</span>
                  {s.builtin && <span className="text-[9px] text-tv-muted ml-auto shrink-0">built-in</span>}
                </button>
              );
            })}
            {strategies.length === 0 && (
              <div className="px-3 py-2 text-xs text-tv-muted">No strategies loaded</div>
            )}
          </div>
        )}
      </div>
      {selectedStrategies.map((name) => (
        <span key={name} className="text-xs text-tv-blue font-medium px-2 py-0.5 rounded bg-tv-blue/10 border border-tv-blue/20 flex items-center space-x-1 shrink-0">
          <span className="truncate max-w-[80px]">{name}</span>
          <button onClick={() => toggle(name)} className="text-tv-blue/60 hover:text-tv-blue cursor-pointer">
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}
