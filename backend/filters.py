"""
Filter registry for stock screening.

A filter is a named set of conditions. Each condition compares an indicator
(left-hand side) against a value or another indicator (right-hand side) using
a comparator (>, <, >=, <=).

Supported indicators:
  "price"       – most recent close price
  "ma50"        – 50-period simple moving average of close
  "ma100"       – 100-period simple moving average of close
  "rsi"         – 14-period RSI of close
  "change_pct"  – latest daily percentage change
  "volume"      – most recent volume

Condition value can be:
  - A number  (e.g. 30)
  - A string matching an indicator name (e.g. "ma50" → price vs MA50)

All conditions in a filter are combined with AND logic.

Built-in filters are stored in BUILTIN_FILTERS. User filters are persisted to
filters.json next to this file.
"""

import json
import os
import pandas as pd
from typing import Any

from strategies.indicators import sma, rsi as rsi_fn, daily_change_pct

_FILTERS_FILE = os.path.join(os.path.dirname(__file__), "filters.json")

BUILTIN_FILTERS: list[dict] = [
    {
        "name": "Golden Cross",
        "description": "50MA above 100MA (uptrend)",
        "builtin": True,
        "conditions": [
            {"indicator": "ma50", "comparator": ">", "value": "ma100"},
        ],
    },
    {
        "name": "RSI Oversold",
        "description": "RSI(14) below 30 — potential buy zone",
        "builtin": True,
        "conditions": [
            {"indicator": "rsi", "comparator": "<", "value": 30},
        ],
    },
    {
        "name": "RSI Overbought",
        "description": "RSI(14) above 70 — potential sell zone",
        "builtin": True,
        "conditions": [
            {"indicator": "rsi", "comparator": ">", "value": 70},
        ],
    },
    {
        "name": "Price Above 50MA",
        "description": "Price trading above the 50-day moving average",
        "builtin": True,
        "conditions": [
            {"indicator": "price", "comparator": ">", "value": "ma50"},
        ],
    },
    {
        "name": "Strong Momentum",
        "description": "Price above 50MA and 50MA above 100MA",
        "builtin": True,
        "conditions": [
            {"indicator": "price", "comparator": ">", "value": "ma50"},
            {"indicator": "ma50", "comparator": ">", "value": "ma100"},
        ],
    },
]


class FilterRegistry:
    def __init__(self) -> None:
        self._filters: dict[str, dict] = {}
        for f in BUILTIN_FILTERS:
            self._filters[f["name"]] = f
        self._load_user_filters()

    def _load_user_filters(self) -> None:
        if os.path.exists(_FILTERS_FILE):
            try:
                with open(_FILTERS_FILE) as fp:
                    user = json.load(fp)
                for f in user:
                    if f.get("name") and f["name"] not in {b["name"] for b in BUILTIN_FILTERS}:
                        f["builtin"] = False
                        self._filters[f["name"]] = f
            except Exception as e:
                print(f"Failed to load user filters: {e}")

    def _save_user_filters(self) -> None:
        user = [f for f in self._filters.values() if not f.get("builtin")]
        try:
            with open(_FILTERS_FILE, "w") as fp:
                json.dump(user, fp, indent=2)
        except Exception as e:
            print(f"Failed to save user filters: {e}")

    def list_all(self) -> list[dict]:
        return list(self._filters.values())

    def get(self, name: str) -> dict | None:
        return self._filters.get(name)

    def add(self, filter_def: dict) -> None:
        name = filter_def["name"]
        filter_def["builtin"] = False
        self._filters[name] = filter_def
        self._save_user_filters()

    def remove(self, name: str) -> bool:
        f = self._filters.get(name)
        if not f:
            return False
        if f.get("builtin"):
            return False
        del self._filters[name]
        self._save_user_filters()
        return True


filter_registry = FilterRegistry()


def _compute_indicators(history_rows: list[dict]) -> dict[str, Any] | None:
    """Compute all supported indicator values from history rows. Returns None if insufficient data."""
    if not history_rows or len(history_rows) < 2:
        return None

    df = pd.DataFrame(history_rows)
    closes = df["close"].dropna()
    volumes = df["volume"].dropna()

    if closes.empty:
        return None

    values: dict[str, Any] = {}
    values["price"] = float(closes.iloc[-1])
    values["volume"] = float(volumes.iloc[-1]) if not volumes.empty else None

    ma50_s = sma(closes, 50)
    values["ma50"] = float(ma50_s.dropna().iloc[-1]) if not ma50_s.dropna().empty else None

    ma100_s = sma(closes, 100)
    values["ma100"] = float(ma100_s.dropna().iloc[-1]) if not ma100_s.dropna().empty else None

    rsi_s = rsi_fn(closes, 14)
    values["rsi"] = float(rsi_s.dropna().iloc[-1]) if not rsi_s.dropna().empty else None

    chg = daily_change_pct(closes).dropna()
    values["change_pct"] = float(chg.iloc[-1]) if not chg.empty else None

    return values


def evaluate_filter(history_rows: list[dict], conditions: list[dict]) -> bool:
    """Return True if a stock's history satisfies all filter conditions (AND logic)."""
    if not conditions:
        return True

    values = _compute_indicators(history_rows)
    if values is None:
        return False

    comparators = {
        ">": lambda a, b: a > b,
        "<": lambda a, b: a < b,
        ">=": lambda a, b: a >= b,
        "<=": lambda a, b: a <= b,
        "==": lambda a, b: abs(a - b) < 1e-9,
    }

    for cond in conditions:
        left_key = cond.get("indicator")
        right_raw = cond.get("value")
        comp = cond.get("comparator", ">")

        left = values.get(left_key)
        if left is None:
            return False

        # Right side can be a string (indicator name) or a numeric value
        if isinstance(right_raw, str):
            right = values.get(right_raw)
        else:
            right = right_raw

        if right is None:
            return False

        fn = comparators.get(comp)
        if fn is None or not fn(left, right):
            return False

    return True


def condition_label(cond: dict) -> str:
    """Human-readable label for a single filter condition."""
    indicator_labels = {
        "price": "Price",
        "ma50": "50MA",
        "ma100": "100MA",
        "rsi": "RSI(14)",
        "change_pct": "Chg%",
        "volume": "Volume",
    }
    left = indicator_labels.get(cond.get("indicator", ""), cond.get("indicator", "?"))
    comp = cond.get("comparator", "?")
    right_raw = cond.get("value")
    if isinstance(right_raw, str):
        right = indicator_labels.get(right_raw, right_raw)
    else:
        right = str(right_raw)
    return f"{left} {comp} {right}"
