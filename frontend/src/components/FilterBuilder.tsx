import { useState } from "react";
import type { FilterCondition, FilterInfo } from "../types/stock";

interface FilterBuilderProps {
  onSave: (filter: { name: string; description: string; conditions: FilterCondition[] }) => void;
  onClose: () => void;
}

const INDICATORS = [
  { value: "price", label: "Price" },
  { value: "ma50", label: "50MA" },
  { value: "ma100", label: "100MA" },
  { value: "rsi", label: "RSI(14)" },
  { value: "change_pct", label: "Change %" },
  { value: "volume", label: "Volume" },
] as const;

const COMPARATORS = [
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
] as const;

const VALUE_INDICATORS = [
  { value: "price", label: "Price" },
  { value: "ma50", label: "50MA" },
  { value: "ma100", label: "100MA" },
  { value: "rsi", label: "RSI(14)" },
  { value: "change_pct", label: "Change %" },
] as const;

function blankCondition(): FilterCondition {
  return { indicator: "price", comparator: ">", value: "ma50" };
}

type RightSideType = "indicator" | "number";

export default function FilterBuilder({ onSave, onClose }: FilterBuilderProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [conditions, setConditions] = useState<FilterCondition[]>([blankCondition()]);
  const [rightTypes, setRightTypes] = useState<RightSideType[]>(["indicator"]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addCondition = () => {
    setConditions((prev) => [...prev, blankCondition()]);
    setRightTypes((prev) => [...prev, "indicator"]);
  };

  const removeCondition = (i: number) => {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
    setRightTypes((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateCondition = (i: number, patch: Partial<FilterCondition>) => {
    setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const toggleRightType = (i: number, type: RightSideType) => {
    setRightTypes((prev) => prev.map((t, idx) => (idx === i ? type : t)));
    // Reset value to a sensible default
    if (type === "indicator") {
      updateCondition(i, { value: "ma50" });
    } else {
      updateCondition(i, { value: 0 });
    }
  };

  const handleSave = async () => {
    setError("");
    if (!name.trim()) { setError("Filter name is required"); return; }
    if (conditions.length === 0) { setError("Add at least one condition"); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), conditions });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-tv-panel border border-tv-border rounded-lg w-[560px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="h-11 border-b border-tv-border flex items-center justify-between px-4 shrink-0">
          <span className="font-semibold text-tv-text text-sm">Custom Filter Builder</span>
          <button onClick={onClose} className="text-tv-muted hover:text-tv-text transition p-1 cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Name & Description */}
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-tv-muted uppercase tracking-wider block mb-1">Filter Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Breakout Setup"
                className="w-full bg-tv-base border border-tv-border rounded px-3 py-1.5 text-sm text-tv-text outline-none focus:border-tv-blue"
              />
            </div>
            <div>
              <label className="text-[10px] text-tv-muted uppercase tracking-wider block mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full bg-tv-base border border-tv-border rounded px-3 py-1.5 text-sm text-tv-text outline-none focus:border-tv-blue"
              />
            </div>
          </div>

          <div className="h-px bg-tv-border" />

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] text-tv-muted uppercase tracking-wider">Conditions (ALL must match)</label>
              <button
                onClick={addCondition}
                className="text-xs text-tv-blue hover:text-blue-400 transition cursor-pointer flex items-center space-x-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Add condition</span>
              </button>
            </div>

            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2 bg-tv-base rounded p-2 border border-tv-border/50">
                  {/* Left indicator */}
                  <select
                    value={cond.indicator}
                    onChange={(e) => updateCondition(i, { indicator: e.target.value as FilterCondition["indicator"] })}
                    className="bg-tv-panel border border-tv-border rounded px-2 py-1 text-xs text-tv-text outline-none focus:border-tv-blue cursor-pointer"
                  >
                    {INDICATORS.map((ind) => (
                      <option key={ind.value} value={ind.value}>{ind.label}</option>
                    ))}
                  </select>

                  {/* Comparator */}
                  <select
                    value={cond.comparator}
                    onChange={(e) => updateCondition(i, { comparator: e.target.value as FilterCondition["comparator"] })}
                    className="bg-tv-panel border border-tv-border rounded px-2 py-1 text-xs text-tv-text outline-none focus:border-tv-blue cursor-pointer w-12"
                  >
                    {COMPARATORS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>

                  {/* Right side toggle */}
                  <div className="flex rounded overflow-hidden border border-tv-border text-[10px]">
                    <button
                      onClick={() => toggleRightType(i, "indicator")}
                      className={`px-2 py-1 cursor-pointer transition ${rightTypes[i] === "indicator" ? "bg-tv-blue text-white" : "bg-tv-panel text-tv-muted hover:text-tv-text"}`}
                    >
                      Indicator
                    </button>
                    <button
                      onClick={() => toggleRightType(i, "number")}
                      className={`px-2 py-1 cursor-pointer transition ${rightTypes[i] === "number" ? "bg-tv-blue text-white" : "bg-tv-panel text-tv-muted hover:text-tv-text"}`}
                    >
                      Number
                    </button>
                  </div>

                  {/* Right value */}
                  {rightTypes[i] === "indicator" ? (
                    <select
                      value={typeof cond.value === "string" ? cond.value : "ma50"}
                      onChange={(e) => updateCondition(i, { value: e.target.value as FilterCondition["value"] })}
                      className="bg-tv-panel border border-tv-border rounded px-2 py-1 text-xs text-tv-text outline-none focus:border-tv-blue cursor-pointer flex-1"
                    >
                      {VALUE_INDICATORS.map((ind) => (
                        <option key={ind.value} value={ind.value}>{ind.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={typeof cond.value === "number" ? cond.value : 0}
                      onChange={(e) => updateCondition(i, { value: parseFloat(e.target.value) || 0 })}
                      className="bg-tv-panel border border-tv-border rounded px-2 py-1 text-xs text-tv-text outline-none focus:border-tv-blue flex-1 min-w-0"
                    />
                  )}

                  {/* Remove */}
                  {conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(i)}
                      className="text-tv-muted hover:text-tv-red transition cursor-pointer shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {conditions.length > 0 && (
            <div className="bg-tv-base rounded p-3 border border-tv-border/50">
              <p className="text-[10px] text-tv-muted uppercase tracking-wider mb-1">Preview</p>
              <p className="text-xs text-tv-text">
                Show stocks where{" "}
                {conditions.map((c, i) => {
                  const left = INDICATORS.find((x) => x.value === c.indicator)?.label || c.indicator;
                  const right = typeof c.value === "string"
                    ? (VALUE_INDICATORS.find((x) => x.value === c.value)?.label || c.value)
                    : c.value;
                  return (
                    <span key={i}>
                      {i > 0 && <span className="text-tv-blue font-medium"> AND </span>}
                      <span className="font-mono text-tv-text">{left} {c.comparator} {right}</span>
                    </span>
                  );
                })}
              </p>
            </div>
          )}

          {error && <p className="text-tv-red text-xs">{error}</p>}
        </div>

        {/* Footer */}
        <div className="border-t border-tv-border px-4 py-3 flex justify-end space-x-2 shrink-0">
          <button
            onClick={onClose}
            className="text-tv-muted hover:text-tv-text text-sm px-4 py-1.5 border border-tv-border rounded transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-tv-blue hover:bg-blue-600 disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded transition cursor-pointer"
          >
            {saving ? "Saving..." : "Save Filter"}
          </button>
        </div>
      </div>
    </div>
  );
}
