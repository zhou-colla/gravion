from typing import Any

import pandas as pd

from .base import BaseStrategy
from .indicators import sma, ema, rsi, daily_change_pct


INDICATOR_MAP: dict[str, Any] = {
    "SMA": lambda df, period: sma(df["close"], int(period)),
    "EMA": lambda df, period: ema(df["close"], int(period)),
    "RSI": lambda df, period: rsi(df["close"], int(period)),
    "Price": lambda df, _: df["close"],
    "Volume": lambda df, _: df["volume"].astype(float),
    "Daily Change %": lambda df, _: daily_change_pct(df["close"]),
}

COMPARATORS: dict[str, Any] = {
    "<": lambda a, b: a < b,
    ">": lambda a, b: a > b,
    "<=": lambda a, b: a <= b,
    ">=": lambda a, b: a >= b,
    "crosses_above": None,  # special handling
    "crosses_below": None,  # special handling
}


class JsonStrategy(BaseStrategy):
    def __init__(self, definition: dict) -> None:
        self._name = definition.get("name", "Custom Strategy")
        self._description = definition.get("description", "")
        self._buy_conditions = definition.get("buy_conditions", [])
        self._sell_conditions = definition.get("sell_conditions", [])

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "buy_conditions": len(self._buy_conditions),
            "sell_conditions": len(self._sell_conditions),
        }

    def _evaluate_conditions(self, df: pd.DataFrame, conditions: list[dict]) -> pd.Series:
        """Evaluate a list of conditions and AND them together."""
        if not conditions:
            return pd.Series(False, index=df.index)

        result = pd.Series(True, index=df.index)
        for cond in conditions:
            indicator_name = cond.get("indicator", "Price")
            period = cond.get("period", 14)
            comparator = cond.get("comparator", ">")
            value = float(cond.get("value", 0))

            indicator_fn = INDICATOR_MAP.get(indicator_name)
            if indicator_fn is None:
                continue

            series = indicator_fn(df, period)

            if comparator == "crosses_above":
                crossed = (series.shift(1) <= value) & (series > value)
                result = result & crossed
            elif comparator == "crosses_below":
                crossed = (series.shift(1) >= value) & (series < value)
                result = result & crossed
            else:
                comp_fn = COMPARATORS.get(comparator)
                if comp_fn:
                    result = result & comp_fn(series, value)

        return result

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        buy_mask = self._evaluate_conditions(df, self._buy_conditions)
        sell_mask = self._evaluate_conditions(df, self._sell_conditions)

        df["signal"] = ""
        df.loc[buy_mask, "signal"] = "BUY"
        df.loc[sell_mask, "signal"] = "SELL"
        # SELL takes priority on same bar
        df.loc[buy_mask & sell_mask, "signal"] = "SELL"

        return df
