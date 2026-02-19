from typing import Any

import pandas as pd

from .base import BaseStrategy
from .indicators import daily_change_pct


class PriceChangeMomentumStrategy(BaseStrategy):
    def __init__(self, buy_threshold: float = 2.0, sell_threshold: float = -2.0):
        self._buy_threshold = float(buy_threshold)
        self._sell_threshold = float(sell_threshold)

    @property
    def name(self) -> str:
        return "Price Change Momentum"

    @property
    def description(self) -> str:
        return "Buy when daily change exceeds +2%, sell when it drops below -2%."

    @property
    def parameters(self) -> dict[str, Any]:
        return {"buy_threshold": self._buy_threshold, "sell_threshold": self._sell_threshold}

    @property
    def param_meta(self) -> dict[str, dict]:
        return {
            "buy_threshold": {"label": "Buy Threshold %", "type": "float", "default": 2.0, "min": 0.5, "max": 5.0, "step": 0.5},
            "sell_threshold": {"label": "Sell Threshold %", "type": "float", "default": -2.0, "min": -5.0, "max": -0.5, "step": 0.5},
        }

    def compute_intensity(self, df: pd.DataFrame) -> str:
        chg = daily_change_pct(df["close"]).dropna()
        if chg.empty:
            return "NEUTRAL"
        val = chg.iloc[-1]
        if val > self._buy_threshold:
            return "STRONG BUY"
        elif val > self._buy_threshold / 4:
            return "BUY"
        elif val < self._sell_threshold:
            return "STRONG SELL"
        elif val < self._sell_threshold / 4:
            return "SELL"
        return "NEUTRAL"

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["change_pct"] = daily_change_pct(df["close"])
        df["signal"] = ""

        for i in range(len(df)):
            val = df.loc[i, "change_pct"]
            if pd.notna(val):
                if val > self._buy_threshold:
                    df.loc[i, "signal"] = "BUY"
                elif val < self._sell_threshold:
                    df.loc[i, "signal"] = "SELL"

        return df
