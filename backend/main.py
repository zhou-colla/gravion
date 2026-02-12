from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from db import stock_db, NASDAQ_100_SYMBOLS
from strategies.loader import strategy_loader
from strategies.json_strategy import JsonStrategy
from strategies.backtest_engine import run_backtest

import os
import pandas as pd
from datetime import datetime, date, timedelta
from typing import Optional

app = FastAPI(title="Gravion Backend", version="2.0.0")

# Scan user strategies directory at startup
_user_dir = os.path.join(os.path.dirname(__file__), "strategies", "user")
strategy_loader.scan_directory(_user_dir)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _get_system_portfolio_symbols():
    """Get symbols from the NASDAQ 100 system portfolio, falling back to constant."""
    portfolios = stock_db.get_all_portfolios()
    for p in portfolios:
        if p.get("is_system"):
            syms = stock_db.get_portfolio_symbols(p["id"])
            if syms:
                return syms
    return NASDAQ_100_SYMBOLS


def compute_signal(stock: dict) -> str:
    """Placeholder signal based on daily change %. Real MA signals in Phase 2.2."""
    chg = stock.get("change_percent") or 0
    if chg > 2.0:
        return "STRONG BUY"
    elif chg > 0.5:
        return "BUY"
    elif chg > -0.5:
        return "NEUTRAL"
    elif chg > -2.0:
        return "SELL"
    else:
        return "STRONG SELL"


def resolve_date_range(start_date: str | None, end_date: str | None, period: str | None):
    """Convert period strings to concrete start/end dates. Returns (start_str, end_str)."""
    if start_date and end_date:
        return start_date, end_date

    end = date.today()
    period_map = {"6mo": 183, "1y": 365, "2y": 730, "5y": 1825}
    days = period_map.get(period or "1y", 365)
    start = end - timedelta(days=days)
    return start.isoformat(), end.isoformat()


def ensure_history(symbol: str, start_date: str, end_date: str):
    """Check DB coverage for a symbol's date range; fetch from yfinance if missing."""
    if stock_db.has_history_coverage(symbol, start_date, end_date):
        return True
    try:
        import yfinance as yf

        df = yf.download(symbol, start=start_date, end=end_date, progress=False)
        if df.empty:
            return False

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        rows = []
        for idx, row in df.iterrows():
            rows.append({
                "date": idx.strftime("%Y-%m-%d"),
                "open": float(row["Open"]) if pd.notna(row["Open"]) else None,
                "high": float(row["High"]) if pd.notna(row["High"]) else None,
                "low": float(row["Low"]) if pd.notna(row["Low"]) else None,
                "close": float(row["Close"]) if pd.notna(row["Close"]) else None,
                "volume": int(row["Volume"]) if pd.notna(row["Volume"]) else 0,
            })
        stock_db.save_stock_history(symbol, rows)
        return True
    except Exception as e:
        print(f"ensure_history failed for {symbol}: {e}")
        return False


class SettingsUpdateRequest(BaseModel):
    data_source: Optional[str] = None
    global_start_date: Optional[str] = None
    global_end_date: Optional[str] = None


class CreatePortfolioRequest(BaseModel):
    name: str


class UpdatePortfolioSymbolsRequest(BaseModel):
    symbols: list[str]


class FetchRequest(BaseModel):
    portfolio_id: Optional[int] = None
    symbols: Optional[list[str]] = None


class ScreenRequest(BaseModel):
    portfolio_id: Optional[int] = None
    symbols: Optional[list[str]] = None


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "gravion-backend", "version": "2.0.0"}


# ── Settings endpoints ──

@app.get("/api/settings")
async def get_settings():
    settings = stock_db.get_all_settings()
    return {
        "data_source": settings.get("data_source", "yahoo_finance"),
        "global_start_date": settings.get("global_start_date", ""),
        "global_end_date": settings.get("global_end_date", ""),
    }


@app.put("/api/settings")
async def update_settings(body: SettingsUpdateRequest):
    if body.data_source is not None:
        stock_db.set_setting("data_source", body.data_source)
    if body.global_start_date is not None:
        stock_db.set_setting("global_start_date", body.global_start_date)
    if body.global_end_date is not None:
        stock_db.set_setting("global_end_date", body.global_end_date)
    settings = stock_db.get_all_settings()
    return {
        "success": True,
        "data_source": settings.get("data_source", "yahoo_finance"),
        "global_start_date": settings.get("global_start_date", ""),
        "global_end_date": settings.get("global_end_date", ""),
    }


# ── Portfolio endpoints ──

@app.get("/api/portfolios")
async def list_portfolios():
    return {"portfolios": stock_db.get_all_portfolios()}


@app.post("/api/portfolios")
async def create_portfolio(body: CreatePortfolioRequest):
    new_id = stock_db.create_portfolio(body.name)
    if new_id is None:
        return {"success": False, "error": f"Portfolio '{body.name}' already exists"}
    return {"success": True, "id": new_id, "name": body.name}


@app.get("/api/portfolios/{portfolio_id}")
async def get_portfolio(portfolio_id: int):
    portfolio = stock_db.get_portfolio(portfolio_id)
    if not portfolio:
        return {"success": False, "error": "Portfolio not found"}
    return {"success": True, **portfolio}


@app.delete("/api/portfolios/{portfolio_id}")
async def delete_portfolio(portfolio_id: int):
    portfolio = stock_db.get_portfolio(portfolio_id)
    if not portfolio:
        return {"success": False, "error": "Portfolio not found"}
    if portfolio["is_system"]:
        return {"success": False, "error": "Cannot delete system portfolio"}
    result = stock_db.delete_portfolio(portfolio_id)
    return {"success": result}


@app.put("/api/portfolios/{portfolio_id}/symbols")
async def update_portfolio_symbols(portfolio_id: int, body: UpdatePortfolioSymbolsRequest):
    portfolio = stock_db.get_portfolio(portfolio_id)
    if not portfolio:
        return {"success": False, "error": "Portfolio not found"}
    if portfolio["is_system"]:
        return {"success": False, "error": "Cannot modify system portfolio symbols"}
    result = stock_db.set_portfolio_symbols(portfolio_id, body.symbols)
    if result:
        updated = stock_db.get_portfolio(portfolio_id)
        return {"success": True, "symbols": updated["symbols"], "symbol_count": updated["symbol_count"]}
    return {"success": False, "error": "Failed to update symbols"}


@app.post("/api/fetch")
async def fetch_data(body: Optional[FetchRequest] = None):
    """
    Fetch stock data from configured data source (batch download).
    Accepts optional body with portfolio_id or symbols list.
    Saves OHLC + metadata to SQLite. Returns summary only.
    """
    try:
        # Check data source setting
        data_source = stock_db.get_setting("data_source") or "yahoo_finance"
        if data_source == "moomoo_opend":
            return {"success": False, "error": "Moomoo OpenD gateway is not configured. Please install and connect the Moomoo OpenD gateway first."}

        import yfinance as yf
        from datetime import datetime
        import math

        # Resolve symbols from body
        if body and body.symbols:
            symbols = [s.upper() for s in body.symbols]
        elif body and body.portfolio_id:
            symbols = stock_db.get_portfolio_symbols(body.portfolio_id)
            if not symbols:
                return {"success": False, "error": "Portfolio not found or has no symbols"}
        else:
            symbols = _get_system_portfolio_symbols()

        fetch_time = datetime.now().isoformat()

        # Batch download: single HTTP call for all symbols
        data = yf.download(symbols, period="2d", group_by="ticker", threads=True)

        fetched_count = 0
        errors = []

        for symbol in symbols:
            try:
                # Extract per-symbol data from the multi-level DataFrame
                if len(symbols) == 1:
                    hist = data
                else:
                    hist = data[symbol]

                if hist.empty or hist["Close"].dropna().empty:
                    errors.append(f"{symbol}: no data")
                    continue

                close_val = float(hist["Close"].dropna().iloc[-1])
                open_val = float(hist["Open"].dropna().iloc[-1])
                high_val = float(hist["High"].dropna().iloc[-1])
                low_val = float(hist["Low"].dropna().iloc[-1])
                volume_val = int(hist["Volume"].dropna().iloc[-1])

                # Calculate daily change percent
                close_series = hist["Close"].dropna()
                if len(close_series) >= 2:
                    prev_close = float(close_series.iloc[-2])
                    if prev_close != 0:
                        change_pct = round(((close_val - prev_close) / prev_close) * 100, 2)
                    else:
                        change_pct = 0.0
                else:
                    change_pct = 0.0

                # Skip NaN values
                if math.isnan(close_val):
                    errors.append(f"{symbol}: NaN price")
                    continue

                stock_db.save_stock_data(
                    symbol=symbol,
                    name=symbol,  # Use symbol as name; enrichment comes later
                    price=close_val,
                    volume=volume_val,
                    change_percent=change_pct,
                    open_price=open_val,
                    high_price=high_val,
                    low_price=low_val,
                    close_price=close_val,
                    last_fetched=fetch_time,
                )
                fetched_count += 1

            except Exception as e:
                errors.append(f"{symbol}: {str(e)}")

        return {
            "success": True,
            "fetched": fetched_count,
            "total": len(symbols),
            "errors": len(errors),
            "error_details": errors[:10],
            "fetch_time": fetch_time,
        }

    except Exception as e:
        print(f"Fetch failed: {e}")
        return {"success": False, "error": str(e)}


@app.post("/api/screen")
async def screen_stocks(body: Optional[ScreenRequest] = None):
    """
    Screen stocks from the local database. No external API calls.
    Accepts optional body with portfolio_id or symbols list.
    Computes signals and returns data for the UI grid.
    """
    try:
        # Resolve symbols from body
        if body and body.symbols:
            symbols = [s.upper() for s in body.symbols]
            stocks = stock_db.get_stocks_by_symbols(symbols)
        elif body and body.portfolio_id:
            symbols = stock_db.get_portfolio_symbols(body.portfolio_id)
            if symbols:
                stocks = stock_db.get_stocks_by_symbols(symbols)
            else:
                stocks = []
        else:
            stocks = stock_db.get_all_stocks()

        data_source = stock_db.get_setting("data_source") or "yahoo_finance"
        source_label = "Yahoo Finance (yfinance)" if data_source == "yahoo_finance" else "Moomoo OpenD"

        results = []
        for stock in stocks:
            stock["signal"] = compute_signal(stock)
            stock["yoy_growth"] = None
            results.append(stock)

        return {
            "success": True,
            "data": results,
            "count": len(results),
            "source": source_label,
        }

    except Exception as e:
        print(f"Screen failed: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/db-info")
async def db_info():
    """Returns database metadata for the footer status bar."""
    info = stock_db.get_db_info()
    return {"success": True, **info}


@app.get("/api/stock/{symbol}/detail")
async def stock_detail(symbol: str):
    """
    Returns chart data (6mo OHLC + 50MA/100MA) and fundamentals for a single stock.
    Uses cached stock_history if fetched today; otherwise fetches fresh data.
    """
    try:
        import yfinance as yf
        import pandas as pd
        from datetime import datetime, date

        symbol = symbol.upper()

        # Check cache freshness
        freshness = stock_db.get_history_freshness(symbol)
        use_cache = False
        if freshness and freshness["last_fetch"]:
            fetched_date = freshness["last_fetch"][:10]  # YYYY-MM-DD
            if fetched_date == date.today().isoformat():
                use_cache = True

        if use_cache:
            history_rows = stock_db.get_stock_history(symbol)
        else:
            # Fetch 6 months of daily data
            df = yf.download(symbol, period="6mo", progress=False)
            if df.empty:
                return {"success": False, "error": f"No data found for {symbol}"}

            # Flatten MultiIndex columns if present (yfinance returns MultiIndex for single ticker too)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            rows = []
            for idx, row in df.iterrows():
                rows.append({
                    "date": idx.strftime("%Y-%m-%d"),
                    "open": float(row["Open"]) if pd.notna(row["Open"]) else None,
                    "high": float(row["High"]) if pd.notna(row["High"]) else None,
                    "low": float(row["Low"]) if pd.notna(row["Low"]) else None,
                    "close": float(row["Close"]) if pd.notna(row["Close"]) else None,
                    "volume": int(row["Volume"]) if pd.notna(row["Volume"]) else 0,
                })
            stock_db.save_stock_history(symbol, rows)
            history_rows = rows

        # Build OHLC series
        ohlc = []
        volume_data = []
        closes = []
        dates = []
        for r in history_rows:
            if r["close"] is not None:
                ohlc.append({"time": r["date"], "open": r["open"], "high": r["high"], "low": r["low"], "close": r["close"]})
                volume_data.append({"time": r["date"], "value": r["volume"]})
                closes.append(r["close"])
                dates.append(r["date"])

        # Compute Moving Averages
        ma50 = []
        ma100 = []
        for i in range(len(closes)):
            if i >= 49:
                avg = sum(closes[i - 49 : i + 1]) / 50
                ma50.append({"time": dates[i], "value": round(avg, 2)})
            if i >= 99:
                avg = sum(closes[i - 99 : i + 1]) / 100
                ma100.append({"time": dates[i], "value": round(avg, 2)})

        # Fetch fundamentals via yfinance Ticker
        fundamentals = {
            "pe_ratio": None,
            "market_cap": None,
            "earnings_date": None,
            "sector": None,
            "fifty_two_week_high": None,
            "fifty_two_week_low": None,
        }
        company_name = symbol
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}
            fundamentals["pe_ratio"] = info.get("trailingPE")
            fundamentals["market_cap"] = info.get("marketCap")
            fundamentals["sector"] = info.get("sector")
            fundamentals["fifty_two_week_high"] = info.get("fiftyTwoWeekHigh")
            fundamentals["fifty_two_week_low"] = info.get("fiftyTwoWeekLow")
            company_name = info.get("shortName") or symbol

            # Earnings date
            ed = info.get("earningsTimestamp")
            if ed:
                fundamentals["earnings_date"] = datetime.fromtimestamp(ed).strftime("%Y-%m-%d")
        except Exception:
            pass

        return {
            "success": True,
            "symbol": symbol,
            "company_name": company_name,
            "ohlc": ohlc,
            "ma50": ma50,
            "ma100": ma100,
            "volume": volume_data,
            "fundamentals": fundamentals,
        }

    except Exception as e:
        print(f"Detail endpoint failed for {symbol}: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/export")
async def export_csv():
    """Returns all cached stock data as CSV text."""
    try:
        stocks = stock_db.get_all_stocks()
        if not stocks:
            return {"success": False, "error": "No data to export"}

        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Ticker", "Name", "Price", "Open", "High", "Low", "Close", "Volume", "Change %", "Last Fetched"])
        for s in stocks:
            writer.writerow([
                s["symbol"], s["name"], s["price"], s["open"], s["high"],
                s["low"], s["close"], s["volume"], s["change_percent"], s["last_fetched"],
            ])

        from fastapi.responses import Response
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=gravion_export.csv"},
        )
    except Exception as e:
        return {"success": False, "error": str(e)}


class BacktestRequest(BaseModel):
    strategy_name: str | None = None
    strategy_json: dict | None = None
    start_date: str | None = None
    end_date: str | None = None
    period: str | None = None


class BatchBacktestRequest(BaseModel):
    symbols: Optional[list[str]] = None
    portfolio_id: Optional[int] = None
    strategy_name: str | None = None
    strategy_json: dict | None = None
    start_date: str | None = None
    end_date: str | None = None
    period: str | None = None
    initial_capital_per_stock: float = 10000


class SaveStrategyRequest(BaseModel):
    definition: dict


BUILTIN_STRATEGY_NAMES = {"Golden Cross", "RSI Mean Reversion", "Price Change Momentum"}


@app.get("/api/strategies")
async def list_strategies():
    """Returns all registered strategies (built-in + user)."""
    return {"strategies": strategy_loader.list_all()}


@app.delete("/api/strategies/{name}")
async def delete_strategy(name: str):
    """Delete a user-defined strategy. Built-in strategies cannot be deleted."""
    if name in BUILTIN_STRATEGY_NAMES:
        return {"success": False, "error": f"Cannot delete built-in strategy '{name}'"}
    if strategy_loader.remove(name):
        return {"success": True}
    return {"success": False, "error": f"Strategy '{name}' not found"}


@app.post("/api/backtest/batch")
async def batch_backtest(body: BatchBacktestRequest):
    """Run a backtest across multiple symbols and return aggregated results."""
    try:
        # Resolve strategy
        if body.strategy_name:
            strategy = strategy_loader.get(body.strategy_name)
            if not strategy:
                return {"success": False, "error": f"Strategy '{body.strategy_name}' not found"}
        elif body.strategy_json:
            strategy = JsonStrategy(body.strategy_json)
        else:
            return {"success": False, "error": "Provide strategy_name or strategy_json"}

        # Resolve symbols
        symbols = body.symbols or []
        if not symbols and body.portfolio_id:
            symbols = stock_db.get_portfolio_symbols(body.portfolio_id)
        if not symbols:
            return {"success": False, "error": "No symbols provided. Use symbols list or portfolio_id."}

        start_date, end_date = resolve_date_range(body.start_date, body.end_date, body.period)

        results = []
        errors = []

        for sym in symbols:
            sym = sym.upper()
            try:
                ensure_history(sym, start_date, end_date)
                history = stock_db.get_stock_history_range(sym, start_date, end_date)
                if not history:
                    errors.append({"symbol": sym, "error": "No historical data available"})
                    continue

                df = pd.DataFrame(history)
                result = run_backtest(strategy, df, initial_capital=body.initial_capital_per_stock)
                result.symbol = sym

                results.append({
                    "symbol": sym,
                    "total_return_pct": result.total_return_pct,
                    "win_rate_pct": result.win_rate_pct,
                    "profit_factor": result.profit_factor,
                    "max_drawdown_pct": result.max_drawdown_pct,
                    "trade_count": len(result.trades),
                    "trades": [
                        {"date": t.date, "type": t.type, "price": t.price, "shares": t.shares, "pnl": t.pnl}
                        for t in result.trades
                    ],
                })
            except Exception as e:
                errors.append({"symbol": sym, "error": str(e)})

        # Aggregate summary
        if results:
            total_return = sum(r["total_return_pct"] for r in results) / len(results)
            avg_win_rate = sum(r["win_rate_pct"] for r in results) / len(results)
            total_trades = sum(r["trade_count"] for r in results)
            best = max(results, key=lambda r: r["total_return_pct"])
            worst = min(results, key=lambda r: r["total_return_pct"])
            summary = {
                "portfolio_return_pct": round(total_return, 2),
                "avg_win_rate_pct": round(avg_win_rate, 2),
                "total_trades": total_trades,
                "best_ticker": best["symbol"],
                "worst_ticker": worst["symbol"],
            }
        else:
            summary = {
                "portfolio_return_pct": 0,
                "avg_win_rate_pct": 0,
                "total_trades": 0,
                "best_ticker": None,
                "worst_ticker": None,
            }

        return {
            "success": True,
            "summary": summary,
            "results": results,
            "errors": errors,
            "date_range": {"start": start_date, "end": end_date},
        }

    except Exception as e:
        print(f"Batch backtest failed: {e}")
        return {"success": False, "error": str(e)}


@app.post("/api/backtest/{symbol}")
async def backtest(symbol: str, body: BacktestRequest):
    """Run a backtest for a strategy on a stock's historical data."""
    try:
        symbol = symbol.upper()

        # Resolve strategy
        if body.strategy_name:
            strategy = strategy_loader.get(body.strategy_name)
            if not strategy:
                return {"success": False, "error": f"Strategy '{body.strategy_name}' not found"}
        elif body.strategy_json:
            strategy = JsonStrategy(body.strategy_json)
        else:
            return {"success": False, "error": "Provide strategy_name or strategy_json"}

        # Get historical data — use date range if provided
        if body.start_date or body.end_date or body.period:
            start_date, end_date = resolve_date_range(body.start_date, body.end_date, body.period)
            ensure_history(symbol, start_date, end_date)
            history = stock_db.get_stock_history_range(symbol, start_date, end_date)
        else:
            history = stock_db.get_stock_history(symbol)

        if not history:
            return {"success": False, "error": f"No historical data for {symbol}. Load the stock detail first."}

        df = pd.DataFrame(history)

        result = run_backtest(strategy, df)
        result.symbol = symbol

        return {
            "success": True,
            "result": {
                "strategy_name": result.strategy_name,
                "symbol": result.symbol,
                "total_return_pct": result.total_return_pct,
                "win_rate_pct": result.win_rate_pct,
                "profit_factor": result.profit_factor,
                "max_drawdown_pct": result.max_drawdown_pct,
                "trades": [
                    {"date": t.date, "type": t.type, "price": t.price, "shares": t.shares, "pnl": t.pnl}
                    for t in result.trades
                ],
            },
        }

    except Exception as e:
        print(f"Backtest failed for {symbol}: {e}")
        return {"success": False, "error": str(e)}


@app.post("/api/strategies/save")
async def save_strategy(body: SaveStrategyRequest):
    """Save a JSON-defined strategy and register it in the loader."""
    try:
        strat = JsonStrategy(body.definition)
        strategy_loader.register(strat)
        return {"success": True, "name": strat.name}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    print("Gravion Backend v2.0 Running on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
