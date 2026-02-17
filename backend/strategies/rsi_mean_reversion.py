from typing import Any

import pandas as pd

from .base import BaseStrategy
from .indicators import rsi


class RSIMeanReversionStrategy(BaseStrategy):
    def __init__(self, rsi_period: int = 14, oversold: int = 30, overbought: int = 70):
        self._rsi_period = int(rsi_period)
        self._oversold = int(oversold)
        self._overbought = int(overbought)

    @property
    def name(self) -> str:
        return "RSI Mean Reversion"

    @property
    def description(self) -> str:
        return "Buy when RSI(14) drops below 30, sell when RSI(14) rises above 70."

    @property
    def parameters(self) -> dict[str, Any]:
        return {"rsi_period": self._rsi_period, "oversold": self._oversold, "overbought": self._overbought}

    def compute_intensity(self, df: pd.DataFrame) -> str:
        rsi_vals = rsi(df["close"], self._rsi_period).dropna()
        if rsi_vals.empty:
            return "NEUTRAL"
        val = rsi_vals.iloc[-1]
        strong_buy = self._oversold - 10
        strong_sell = self._overbought + 10
        if val < strong_buy:
            return "STRONG BUY"
        elif val < self._oversold:
            return "BUY"
        elif val > strong_sell:
            return "STRONG SELL"
        elif val > self._overbought:
            return "SELL"
        return "NEUTRAL"

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["rsi"] = rsi(df["close"], self._rsi_period)
        df["signal"] = ""

        for i in range(1, len(df)):
            val = df.loc[i, "rsi"]
            prev = df.loc[i - 1, "rsi"]
            if pd.notna(val) and pd.notna(prev):
                if prev >= self._oversold and val < self._oversold:
                    df.loc[i, "signal"] = "BUY"
                elif prev <= self._overbought and val > self._overbought:
                    df.loc[i, "signal"] = "SELL"

        return df
