from typing import Any

import pandas as pd

from .base import BaseStrategy
from .indicators import sma


class GoldenCrossStrategy(BaseStrategy):
    def __init__(self, fast_period: int = 50, slow_period: int = 100):
        self._fast_period = int(fast_period)
        self._slow_period = int(slow_period)

    @property
    def name(self) -> str:
        return "Golden Cross"

    @property
    def description(self) -> str:
        return "Buy when 50MA crosses above 100MA, sell when it crosses below."

    @property
    def parameters(self) -> dict[str, Any]:
        return {"fast_period": self._fast_period, "slow_period": self._slow_period}

    @property
    def param_meta(self) -> dict[str, dict]:
        return {
            "fast_period": {"label": "Fast MA Period", "type": "int", "default": 50, "min": 5, "max": 200, "step": 5},
            "slow_period": {"label": "Slow MA Period", "type": "int", "default": 100, "min": 10, "max": 400, "step": 10},
        }

    def compute_intensity(self, df: pd.DataFrame) -> str:
        fast = sma(df["close"], self._fast_period).dropna()
        slow = sma(df["close"], self._slow_period).dropna()
        if fast.empty or slow.empty:
            return "NEUTRAL"
        f, s = fast.iloc[-1], slow.iloc[-1]
        if s == 0:
            return "NEUTRAL"
        ratio = (f - s) / s * 100
        if ratio > 5:
            return "STRONG BUY"
        elif ratio > 0:
            return "BUY"
        elif ratio < -5:
            return "STRONG SELL"
        elif ratio < 0:
            return "SELL"
        return "NEUTRAL"

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["ma_fast"] = sma(df["close"], self._fast_period)
        df["ma_slow"] = sma(df["close"], self._slow_period)
        df["signal"] = ""

        for i in range(1, len(df)):
            if pd.notna(df.loc[i, "ma_fast"]) and pd.notna(df.loc[i, "ma_slow"]):
                prev_fast = df.loc[i - 1, "ma_fast"]
                prev_slow = df.loc[i - 1, "ma_slow"]
                curr_fast = df.loc[i, "ma_fast"]
                curr_slow = df.loc[i, "ma_slow"]

                if pd.notna(prev_fast) and pd.notna(prev_slow):
                    if prev_fast <= prev_slow and curr_fast > curr_slow:
                        df.loc[i, "signal"] = "BUY"
                    elif prev_fast >= prev_slow and curr_fast < curr_slow:
                        df.loc[i, "signal"] = "SELL"

        return df
