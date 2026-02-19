import { useState } from "react";
import type { StrategyCondition, JsonStrategyDefinition } from "../types/stock";
import type { Translation } from "../i18n";

interface VisualBuilderProps {
  onSave: (definition: JsonStrategyDefinition) => void;
  onClose: () => void;
  t: Translation;
}

const INDICATORS = ["SMA", "EMA", "RSI", "Price", "Volume", "Daily Change %"];
const COMPARATORS = ["<", ">", "<=", ">=", "crosses_above", "crosses_below"];

function emptyCondition(): StrategyCondition {
  return { indicator: "RSI", period: 14, comparator: "<", value: 30 };
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
  t,
}: {
  condition: StrategyCondition;
  onChange: (c: StrategyCondition) => void;
  onRemove: () => void;
  t: Translation;
}) {
  return (
    <div className="flex items-center space-x-2 mb-2">
      <select
        value={condition.indicator}
        onChange={(e) => onChange({ ...condition, indicator: e.target.value })}
        className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue flex-1 cursor-pointer"
      >
        {INDICATORS.map((ind) => (
          <option key={ind} value={ind}>{ind}</option>
        ))}
      </select>
      <input
        type="number"
        value={condition.period}
        onChange={(e) => onChange({ ...condition, period: Number(e.target.value) })}
        className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue w-16 font-mono"
        placeholder={t.period}
      />
      <select
        value={condition.comparator}
        onChange={(e) => onChange({ ...condition, comparator: e.target.value })}
        className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue flex-1 cursor-pointer"
      >
        {COMPARATORS.map((comp) => (
          <option key={comp} value={comp}>{comp}</option>
        ))}
      </select>
      <input
        type="number"
        step="any"
        value={condition.value}
        onChange={(e) => onChange({ ...condition, value: Number(e.target.value) })}
        className="bg-tv-panel text-tv-text text-xs border border-tv-border rounded px-2 py-1.5 outline-none focus:border-tv-blue w-20 font-mono"
        placeholder="Value"
      />
      <button
        onClick={onRemove}
        className="text-tv-muted hover:text-tv-red transition p-1 cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function VisualBuilder({ onSave, onClose, t }: VisualBuilderProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [buyConditions, setBuyConditions] = useState<StrategyCondition[]>([emptyCondition()]);
  const [sellConditions, setSellConditions] = useState<StrategyCondition[]>([
    { indicator: "RSI", period: 14, comparator: ">", value: 70 },
  ]);

  const updateBuy = (index: number, cond: StrategyCondition) => {
    const next = [...buyConditions];
    next[index] = cond;
    setBuyConditions(next);
  };

  const updateSell = (index: number, cond: StrategyCondition) => {
    const next = [...sellConditions];
    next[index] = cond;
    setSellConditions(next);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      buy_conditions: buyConditions,
      sell_conditions: sellConditions,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-tv-base border border-tv-border rounded-lg shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-tv-border shrink-0">
          <h2 className="text-tv-text font-bold text-sm">{t.visualStrategyBuilder}</h2>
          <button onClick={onClose} className="text-tv-muted hover:text-tv-text transition cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name & Description */}
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.strategy}
              className="w-full bg-tv-panel text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`${t.strategyDescription}`}
              className="w-full bg-tv-panel text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue"
            />
          </div>

          {/* BUY conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-tv-green uppercase tracking-wider">{t.buyWhen}</h3>
              <button
                onClick={() => setBuyConditions([...buyConditions, emptyCondition()])}
                className="text-[10px] text-tv-blue hover:text-blue-400 transition cursor-pointer"
              >
                + Add Condition
              </button>
            </div>
            {buyConditions.map((cond, i) => (
              <ConditionRow
                key={i}
                condition={cond}
                onChange={(c) => updateBuy(i, c)}
                onRemove={() => setBuyConditions(buyConditions.filter((_, j) => j !== i))}
                t={t}
              />
            ))}
            {buyConditions.length === 0 && (
              <p className="text-tv-muted text-xs py-2">No buy conditions</p>
            )}
          </div>

          {/* SELL conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-tv-red uppercase tracking-wider">{t.sellWhen}</h3>
              <button
                onClick={() => setSellConditions([...sellConditions, emptyCondition()])}
                className="text-[10px] text-tv-blue hover:text-blue-400 transition cursor-pointer"
              >
                + Add Condition
              </button>
            </div>
            {sellConditions.map((cond, i) => (
              <ConditionRow
                key={i}
                condition={cond}
                onChange={(c) => updateSell(i, c)}
                onRemove={() => setSellConditions(sellConditions.filter((_, j) => j !== i))}
                t={t}
              />
            ))}
            {sellConditions.length === 0 && (
              <p className="text-tv-muted text-xs py-2">No sell conditions</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-5 py-3 border-t border-tv-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-tv-muted hover:text-tv-text border border-tv-border rounded transition cursor-pointer"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-1.5 text-xs text-white bg-tv-blue hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed rounded font-medium transition cursor-pointer"
          >
            {t.saveStrategy}
          </button>
        </div>
      </div>
    </div>
  );
}
