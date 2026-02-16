from typing import Any

import pandas as pd

from .base import BaseStrategy
from .indicators import rsi


class RSIMeanReversionStrategy(BaseStrategy):
    @property
    def name(self) -> str:
        return "RSI Mean Reversion"

    @property
    def description(self) -> str:
        return "Buy when RSI(14) drops below 30, sell when RSI(14) rises above 70."

    @property
    def parameters(self) -> dict[str, Any]:
        return {"rsi_period": 14, "oversold": 30, "overbought": 70}

    def compute_intensity(self, df: pd.DataFrame) -> str:
        rsi_vals = rsi(df["close"], 14).dropna()
        if rsi_vals.empty:
            return "NEUTRAL"
        val = rsi_vals.iloc[-1]
        if val < 20:
            return "STRONG BUY"
        elif val < 30:
            return "BUY"
        elif val > 80:
            return "STRONG SELL"
        elif val > 70:
            return "SELL"
        return "NEUTRAL"

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["rsi"] = rsi(df["close"], 14)
        df["signal"] = ""

        for i in range(1, len(df)):
            val = df.loc[i, "rsi"]
            prev = df.loc[i - 1, "rsi"]
            if pd.notna(val) and pd.notna(prev):
                if prev >= 30 and val < 30:
                    df.loc[i, "signal"] = "BUY"
                elif prev <= 70 and val > 70:
                    df.loc[i, "signal"] = "SELL"

        return df
