import pandas as pd

from .base import BacktestResult, BaseStrategy, Trade


def run_backtest(
    strategy: BaseStrategy,
    df: pd.DataFrame,
    initial_capital: float = 10000.0,
) -> BacktestResult:
    """
    Single-position long-only backtest engine.
    Expects df with columns: date, open, high, low, close, volume.
    """
    df = df.copy()
    df = df.sort_values("date").reset_index(drop=True)
    df = strategy.generate_signals(df)

    trades: list[Trade] = []
    position_open = False
    entry_price = 0.0
    shares = 0.0
    capital = initial_capital
    peak_capital = initial_capital
    max_drawdown = 0.0

    for _, row in df.iterrows():
        signal = row.get("signal", "")
        price = row["close"]

        if signal == "BUY" and not position_open and capital > 0:
            shares = capital / price
            entry_price = price
            position_open = True
            trades.append(Trade(date=row["date"], type="BUY", price=price, shares=round(shares, 4)))
            capital = 0.0

        elif signal == "SELL" and position_open:
            sell_value = shares * price
            pnl = sell_value - (shares * entry_price)
            capital = sell_value
            trades.append(Trade(date=row["date"], type="SELL", price=price, shares=round(shares, 4), pnl=round(pnl, 2)))
            position_open = False
            shares = 0.0

        # Track drawdown
        current_value = capital if not position_open else shares * price
        if current_value > peak_capital:
            peak_capital = current_value
        if peak_capital > 0:
            dd = (peak_capital - current_value) / peak_capital * 100
            if dd > max_drawdown:
                max_drawdown = dd

    # If still in position, mark-to-market using last close
    if position_open and len(df) > 0:
        final_value = shares * df.iloc[-1]["close"]
    else:
        final_value = capital

    total_return_pct = ((final_value - initial_capital) / initial_capital) * 100

    # Win rate & profit factor
    sell_trades = [t for t in trades if t.type == "SELL"]
    wins = [t for t in sell_trades if t.pnl > 0]
    losses = [t for t in sell_trades if t.pnl <= 0]
    win_rate = (len(wins) / len(sell_trades) * 100) if sell_trades else 0.0
    gross_profit = sum(t.pnl for t in wins)
    gross_loss = abs(sum(t.pnl for t in losses))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (float("inf") if gross_profit > 0 else 0.0)

    return BacktestResult(
        strategy_name=strategy.name,
        symbol="",
        total_return_pct=round(total_return_pct, 2),
        win_rate_pct=round(win_rate, 2),
        profit_factor=round(profit_factor, 2) if profit_factor != float("inf") else 999.99,
        max_drawdown_pct=round(max_drawdown, 2),
        trades=trades,
    )
