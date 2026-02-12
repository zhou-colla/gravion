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

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add a 'signal' column to df with values: 'BUY', 'SELL', or ''."""
        ...
