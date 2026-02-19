from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import pandas as pd


@dataclass
class Trade:
    date: str
    type: str  # "BUY" or "SELL"
    price: float
    shares: float
    pnl: float = 0.0


@dataclass
class BacktestResult:
    strategy_name: str
    symbol: str
    total_return_pct: float
    win_rate_pct: float
    profit_factor: float
    max_drawdown_pct: float
    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[dict] = field(default_factory=list)


class BaseStrategy(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def description(self) -> str: ...

    @property
    def parameters(self) -> dict[str, Any]:
        return {}

    @property
    def param_meta(self) -> dict[str, dict]:
        """Parameter metadata for the optimizer UI.
        Keys are param names; values have: label, type, default, min, max, step."""
        return {}

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add a 'signal' column to df with values: 'BUY', 'SELL', or ''."""
        ...

    def compute_intensity(self, df: pd.DataFrame) -> str:
        """Compute current signal intensity from historical data.
        Returns one of: 'STRONG BUY', 'BUY', 'NEUTRAL', 'SELL', 'STRONG SELL'.
        Default implementation returns 'NEUTRAL'."""
        return "NEUTRAL"
