from typing import Any

import pandas as pd

from .base import BaseStrategy


class USDTPEGStrategy(BaseStrategy):
    def __init__(self, baseline_ratio: float = 1.0, upper_elasticity: float = 0.005, lower_elasticity: float = 0.005, reversion_threshold: float = 0.001):
        self._baseline_ratio = float(baseline_ratio)
        self._upper_elasticity = float(upper_elasticity)
        self._lower_elasticity = float(lower_elasticity)
        self._reversion_threshold = float(reversion_threshold)

    @property
    def name(self) -> str:
        return "USDT Peg Strategy"

    @property
    def description(self) -> str:
        return "Trades USD/USDT price deviations from 1:1 peg using mean reversion."

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "baseline_ratio": self._baseline_ratio,
            "upper_elasticity": self._upper_elasticity,
            "lower_elasticity": self._lower_elasticity,
            "reversion_threshold": self._reversion_threshold
        }

    @property
    def param_meta(self) -> dict[str, dict]:
        return {
            "baseline_ratio": {"label": "Baseline Ratio", "type": "float", "default": 1.0, "min": 0.99, "max": 1.01, "step": 0.001},
            "upper_elasticity": {"label": "Upper Elasticity", "type": "float", "default": 0.005, "min": 0.001, "max": 0.02, "step": 0.001},
            "lower_elasticity": {"label": "Lower Elasticity", "type": "float", "default": 0.005, "min": 0.001, "max": 0.02, "step": 0.001},
            "reversion_threshold": {"label": "Reversion Threshold", "type": "float", "default": 0.001, "min": 0.0005, "max": 0.005, "step": 0.0005},
        }

    def compute_intensity(self, df: pd.DataFrame) -> str:
        if df.empty:
            return "NEUTRAL"
        
        # Use the last close price
        current_price = df["close"].iloc[-1]
        
        # Calculate thresholds
        upper_threshold = self._baseline_ratio + self._upper_elasticity
        lower_threshold = self._baseline_ratio - self._lower_elasticity
        strong_upper_threshold = upper_threshold + self._upper_elasticity
        strong_lower_threshold = lower_threshold - self._lower_elasticity
        
        # Determine signal
        if current_price > strong_upper_threshold:
            return "STRONG SELL"
        elif current_price > upper_threshold:
            return "SELL"
        elif current_price < strong_lower_threshold:
            return "STRONG BUY"
        elif current_price < lower_threshold:
            return "BUY"
        return "NEUTRAL"

    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["signal"] = ""
        
        # Calculate thresholds
        upper_threshold = self._baseline_ratio + self._upper_elasticity
        lower_threshold = self._baseline_ratio - self._lower_elasticity
        
        for i in range(1, len(df)):
            current_price = df.loc[i, "close"]
            prev_price = df.loc[i - 1, "close"]
            
            # Buy signal: price crosses below lower threshold
            if prev_price >= lower_threshold and current_price < lower_threshold:
                df.loc[i, "signal"] = "BUY"
            # Sell signal: price crosses above upper threshold
            elif prev_price <= upper_threshold and current_price > upper_threshold:
                df.loc[i, "signal"] = "SELL"
        
        return df
