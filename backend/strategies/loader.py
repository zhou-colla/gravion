import importlib.util
import os
import inspect

from .base import BaseStrategy
from .golden_cross import GoldenCrossStrategy
from .rsi_mean_reversion import RSIMeanReversionStrategy
from .price_change_momentum import PriceChangeMomentumStrategy


class StrategyLoader:
    def __init__(self) -> None:
        self._strategies: dict[str, BaseStrategy] = {}
        self._register_builtins()

    def _register_builtins(self) -> None:
        for cls in [GoldenCrossStrategy, RSIMeanReversionStrategy, PriceChangeMomentumStrategy]:
            instance = cls()
            self._strategies[instance.name] = instance

    def register(self, strategy: BaseStrategy) -> None:
        self._strategies[strategy.name] = strategy

    def get(self, name: str) -> BaseStrategy | None:
        return self._strategies.get(name)

    def remove(self, name: str) -> bool:
        """Remove a strategy by name. Returns True if removed, False if not found."""
        if name in self._strategies:
            del self._strategies[name]
            return True
        return False

    def list_all(self) -> list[dict]:
        result = []
        builtin_names = {"Golden Cross", "RSI Mean Reversion", "Price Change Momentum"}
        for name, s in self._strategies.items():
            result.append({
                "name": s.name,
                "description": s.description,
                "parameters": s.parameters,
                "builtin": name in builtin_names,
            })
        return result

    def scan_directory(self, path: str) -> int:
        """Discover custom .py files with BaseStrategy subclasses. Returns count loaded."""
        if not os.path.isdir(path):
            return 0

        loaded = 0
        for filename in os.listdir(path):
            if not filename.endswith(".py") or filename.startswith("_"):
                continue
            filepath = os.path.join(path, filename)
            try:
                spec = importlib.util.spec_from_file_location(filename[:-3], filepath)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    for _, obj in inspect.getmembers(module, inspect.isclass):
                        if issubclass(obj, BaseStrategy) and obj is not BaseStrategy:
                            instance = obj()
                            self.register(instance)
                            loaded += 1
            except Exception as e:
                print(f"Failed to load strategy from {filename}: {e}")
        return loaded


strategy_loader = StrategyLoader()
