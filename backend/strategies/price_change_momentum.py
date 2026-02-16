from typing import Any

import pandas as pd

from .base import BaseStrategy
from .indicators import daily_change_pct


class PriceChangeMomentumStrategy(BaseStrategy):
    @property
    def name(self) -> str:
        return "Price Change Momentum"

    @property
    def description(self) -> str:
        return "Buy when daily change exceeds +2%, sell when it drops below -2%."

    @property
    def parameters(self) -> dict[str, Any]:
        return {"buy_threshold": 2.0, "sell_threshold": -2.0}

    def compute_intensity(self, df: pd.DataFrame) -> str:
        chg = daily_change_pct(df["close"]).dropna()
        if chg.empty:
            return "NEUTRAL"
        val = chg.iloc[-1]
        if val > 2.0:
            return "STRONG BUY"
        elif val > 0.5:
            return "BUY"
        elif val < -2.0:
            return "STRONG SELL"
        elif val < -0.5:
            return "SELL"
        return "NEUTRAL"

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["change_pct"] = daily_change_pct(df["close"])
        df["signal"] = ""

        for i in range(len(df)):
            val = df.loc[i, "change_pct"]
            if pd.notna(val):
                if val > 2.0:
                    df.loc[i, "signal"] = "BUY"
                elif val < -2.0:
                    df.loc[i, "signal"] = "SELL"

        return df
