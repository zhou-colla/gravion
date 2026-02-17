from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from db import stock_db, NASDAQ_100_SYMBOLS
from strategies.loader import strategy_loader
from strategies.json_strategy import JsonStrategy
from strategies.backtest_engine import run_backtest
from filters import filter_registry, evaluate_filter, condition_label

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
    strategy: Optional[str] = None
    filter: Optional[str] = None  # name of filter to apply


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

        # Resolve strategy for signal computation
        screen_strategy = None
        if body and body.strategy:
            screen_strategy = strategy_loader.get(body.strategy)

        # Resolve active filter
        active_filter = None
        active_filter_conditions = []
        if body and body.filter:
            active_filter = filter_registry.get(body.filter)
            if active_filter:
                active_filter_conditions = active_filter.get("conditions", [])

        results = []
        for stock in stocks:
            # Compute signal
            if screen_strategy is not None:
                history = stock_db.get_stock_history(stock["symbol"])
                if history and len(history) >= 2:
                    df = pd.DataFrame(history)
                    try:
                        stock["signal"] = screen_strategy.compute_intensity(df)
                    except Exception:
                        stock["signal"] = compute_signal(stock)
                else:
                    stock["signal"] = compute_signal(stock)
            else:
                stock["signal"] = compute_signal(stock)
            stock["yoy_growth"] = None

            # Apply filter if specified
            if active_filter_conditions:
                history = stock_db.get_stock_history(stock["symbol"])
                if not evaluate_filter(history, active_filter_conditions):
                    continue  # Skip stocks that don't pass the filter

            results.append(stock)

        # Build active filter tag labels for the frontend
        filter_tags = [condition_label(c) for c in active_filter_conditions]

        return {
            "success": True,
            "data": results,
            "count": len(results),
            "source": source_label,
            "active_filter": body.filter if body and body.filter else None,
            "filter_tags": filter_tags,
        }

    except Exception as e:
        print(f"Screen failed: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/db-info")
async def db_info():
    """Returns database metadata for the footer status bar."""
    info = stock_db.get_db_info()
    return {"success": True, **info}


def _fetch_yfinance_history(symbol: str, period: str = "6mo") -> list[dict] | None:
    """Download OHLC history from yfinance and return as list of dicts. Returns None on failure."""
    try:
        import yfinance as yf
        df = yf.download(symbol, period=period, progress=False)
        if df.empty:
            return None
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
        return rows
    except Exception as e:
        print(f"yfinance history fetch failed for {symbol}: {e}")
        return None


def _build_detail_response(symbol: str, history_rows: list[dict], from_cache: bool) -> dict:
    """Build the full detail response from history rows using local indicator calculations."""
    from strategies.indicators import sma, rsi as rsi_fn, macd as macd_fn, bollinger_bands

    ohlc = []
    volume_data = []
    closes_list = []
    dates_list = []
    for r in history_rows:
        if r["close"] is not None:
            ohlc.append({"time": r["date"], "open": r["open"], "high": r["high"], "low": r["low"], "close": r["close"]})
            volume_data.append({"time": r["date"], "value": r["volume"]})
            closes_list.append(r["close"])
            dates_list.append(r["date"])

    if not closes_list:
        return {"success": False, "error": "No valid OHLC data in cache"}

    close_series = pd.Series(closes_list)

    # Moving Averages
    ma50_raw = sma(close_series, 50)
    ma100_raw = sma(close_series, 100)
    ma50 = [{"time": dates_list[i], "value": round(float(ma50_raw.iloc[i]), 2)}
            for i in range(len(dates_list)) if pd.notna(ma50_raw.iloc[i])]
    ma100 = [{"time": dates_list[i], "value": round(float(ma100_raw.iloc[i]), 2)}
             for i in range(len(dates_list)) if pd.notna(ma100_raw.iloc[i])]

    # RSI
    rsi_series = rsi_fn(close_series, 14)
    rsi_data = [{"time": dates_list[i], "value": round(float(rsi_series.iloc[i]), 2)}
                for i in range(len(dates_list)) if pd.notna(rsi_series.iloc[i])]
    current_rsi = round(float(rsi_series.dropna().iloc[-1]), 2) if not rsi_series.dropna().empty else None

    # MACD
    macd_line, signal_line, histogram = macd_fn(close_series)
    macd_data = []
    for i in range(len(dates_list)):
        if pd.notna(macd_line.iloc[i]) and pd.notna(signal_line.iloc[i]):
            macd_data.append({
                "time": dates_list[i],
                "macd": round(float(macd_line.iloc[i]), 4),
                "signal": round(float(signal_line.iloc[i]), 4),
                "histogram": round(float(histogram.iloc[i]), 4),
            })

    # Bollinger Bands
    bb_upper, bb_middle, bb_lower = bollinger_bands(close_series, 20)
    bb_data = []
    for i in range(len(dates_list)):
        if pd.notna(bb_upper.iloc[i]):
            bb_data.append({
                "time": dates_list[i],
                "upper": round(float(bb_upper.iloc[i]), 2),
                "middle": round(float(bb_middle.iloc[i]), 2),
                "lower": round(float(bb_lower.iloc[i]), 2),
            })

    # 52-week high/low from cached data
    cached_high = max(closes_list) if closes_list else None
    cached_low = min(closes_list) if closes_list else None

    return {
        "ohlc": ohlc,
        "ma50": ma50,
        "ma100": ma100,
        "volume": volume_data,
        "rsi": rsi_data,
        "current_rsi": current_rsi,
        "macd": macd_data,
        "bollinger": bb_data,
        "cached_52w_high": round(cached_high, 2) if cached_high else None,
        "cached_52w_low": round(cached_low, 2) if cached_low else None,
        "from_cache": from_cache,
        "data_points": len(closes_list),
    }


@app.get("/api/stock/{symbol}/detail")
async def stock_detail(symbol: str, realtime: bool = False):
    """
    Returns chart data (OHLC + 50MA/100MA + RSI + MACD + Bollinger) and fundamentals.

    Cache-first strategy:
    - If realtime=False (default): serve from cached history immediately; never call yfinance for OHLC.
    - If realtime=True: attempt fresh yfinance download, save to cache, fall back to cache on failure.
    - Fundamentals (PE, market cap, etc.) are always attempted from yfinance but use cached fallbacks.
    """
    try:
        from datetime import datetime

        symbol = symbol.upper()
        cached_rows = stock_db.get_stock_history(symbol)
        has_cache = bool(cached_rows)
        history_rows = None
        from_cache = False

        if realtime:
            fresh = _fetch_yfinance_history(symbol)
            if fresh:
                stock_db.save_stock_history(symbol, fresh)
                history_rows = fresh
                from_cache = False
            elif has_cache:
                history_rows = cached_rows
                from_cache = True
                print(f"Realtime fetch failed for {symbol}; serving from cache")
            else:
                return {"success": False, "error": f"No data for {symbol}. Enable Realtime Fetch and click Fetch & Run first."}
        else:
            if has_cache:
                history_rows = cached_rows
                from_cache = True
            else:
                return {"success": False, "error": f"No cached data for {symbol}. Enable Realtime Fetch and click Fetch & Run first."}

        # Build OHLC + local indicator response
        detail = _build_detail_response(symbol, history_rows, from_cache)
        if not detail.get("success", True):
            return detail

        # Fundamentals: only call yfinance when realtime=True to avoid rate limits
        fundamentals = {
            "pe_ratio": None,
            "market_cap": None,
            "earnings_date": None,
            "sector": None,
            "fifty_two_week_high": detail["cached_52w_high"],
            "fifty_two_week_low": detail["cached_52w_low"],
        }
        company_name = symbol
        if realtime:
            try:
                import yfinance as yf
                ticker = yf.Ticker(symbol)
                info = ticker.info or {}
                fundamentals["pe_ratio"] = info.get("trailingPE")
                fundamentals["market_cap"] = info.get("marketCap")
                fundamentals["sector"] = info.get("sector")
                fw_high = info.get("fiftyTwoWeekHigh")
                fw_low = info.get("fiftyTwoWeekLow")
                if fw_high:
                    fundamentals["fifty_two_week_high"] = fw_high
                if fw_low:
                    fundamentals["fifty_two_week_low"] = fw_low
                company_name = info.get("shortName") or symbol
                ed = info.get("earningsTimestamp")
                if ed:
                    fundamentals["earnings_date"] = datetime.fromtimestamp(ed).strftime("%Y-%m-%d")
            except Exception as e:
                print(f"Fundamentals fetch failed for {symbol} (using cached fallback): {e}")
        else:
            # Use cached stock data for company name and price-derived fields
            cached_stock = stock_db.get_stocks_by_symbols([symbol])
            if cached_stock:
                company_name = cached_stock[0].get("name") or symbol

        return {
            "success": True,
            "symbol": symbol,
            "company_name": company_name,
            "from_cache": detail["from_cache"],
            "data_points": detail["data_points"],
            "ohlc": detail["ohlc"],
            "ma50": detail["ma50"],
            "ma100": detail["ma100"],
            "volume": detail["volume"],
            "rsi": detail["rsi"],
            "current_rsi": detail["current_rsi"],
            "macd": detail["macd"],
            "bollinger": detail["bollinger"],
            "fundamentals": fundamentals,
        }

    except Exception as e:
        print(f"Detail endpoint failed for {symbol}: {e}")
        return {"success": False, "error": str(e)}


class PrecacheRequest(BaseModel):
    portfolio_id: Optional[int] = None
    symbols: Optional[list[str]] = None
    period: str = "6mo"


@app.post("/api/precache")
async def precache_history(body: Optional[PrecacheRequest] = None):
    """
    Pre-cache 6-month historical OHLC data for a set of symbols.
    Processes in small batches to avoid rate limits.
    Call this after /api/fetch to populate chart history without clicking each stock.
    """
    try:
        import asyncio

        if body and body.symbols:
            symbols = [s.upper() for s in body.symbols]
        elif body and body.portfolio_id:
            symbols = stock_db.get_portfolio_symbols(body.portfolio_id)
            if not symbols:
                return {"success": False, "error": "Portfolio not found or has no symbols"}
        else:
            symbols = _get_system_portfolio_symbols()

        period = (body.period if body and body.period else "6mo")
        cached = 0
        skipped = 0
        errors = []

        # Process in batches of 5 to avoid rate limits
        batch_size = 5
        for batch_start in range(0, len(symbols), batch_size):
            batch = symbols[batch_start:batch_start + batch_size]
            for sym in batch:
                try:
                    # Skip if already cached today
                    freshness = stock_db.get_history_freshness(sym)
                    if freshness and freshness["last_fetch"]:
                        from datetime import date
                        if freshness["last_fetch"][:10] == date.today().isoformat():
                            skipped += 1
                            continue
                    rows = _fetch_yfinance_history(sym, period)
                    if rows:
                        stock_db.save_stock_history(sym, rows)
                        cached += 1
                    else:
                        errors.append(f"{sym}: no data returned")
                except Exception as e:
                    errors.append(f"{sym}: {str(e)}")
            # Small delay between batches to be gentle on rate limits
            if batch_start + batch_size < len(symbols):
                await asyncio.sleep(0.5)

        return {
            "success": True,
            "cached": cached,
            "skipped_already_cached": skipped,
            "total": len(symbols),
            "errors": len(errors),
            "error_details": errors[:10],
        }
    except Exception as e:
        print(f"Precache failed: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/stock/{symbol}/signal-details")
async def stock_signal_details(symbol: str, strategy_name: str = ""):
    """Returns signal calculation details for a symbol, useful for hover tooltips."""
    try:
        symbol = symbol.upper()
        history = stock_db.get_stock_history(symbol)
        if not history:
            return {"success": False, "error": f"No history for {symbol}"}

        df = pd.DataFrame(history)

        strategy = strategy_loader.get(strategy_name) if strategy_name else None

        details: dict = {"symbol": symbol, "strategy": strategy_name or "default"}

        if strategy is not None:
            # Strategy-specific details
            if strategy_name == "RSI Mean Reversion":
                from strategies.indicators import rsi as rsi_fn
                rsi_vals = rsi_fn(df["close"], 14).dropna()
                current_rsi = round(float(rsi_vals.iloc[-1]), 2) if not rsi_vals.empty else None
                details["rsi"] = current_rsi
                details["thresholds"] = {"strong_buy": 20, "buy": 30, "sell": 70, "strong_sell": 80}
                details["signal"] = strategy.compute_intensity(df)

            elif strategy_name == "Golden Cross":
                from strategies.indicators import sma as sma_fn
                fast = sma_fn(df["close"], 50).dropna()
                slow = sma_fn(df["close"], 100).dropna()
                f = round(float(fast.iloc[-1]), 2) if not fast.empty else None
                s = round(float(slow.iloc[-1]), 2) if not slow.empty else None
                details["ma50"] = f
                details["ma100"] = s
                details["thresholds"] = {"strong_buy_pct": 5, "strong_sell_pct": -5}
                details["signal"] = strategy.compute_intensity(df)

            elif strategy_name == "Price Change Momentum":
                from strategies.indicators import daily_change_pct as dcp_fn
                chg = dcp_fn(df["close"]).dropna()
                val = round(float(chg.iloc[-1]), 2) if not chg.empty else None
                details["daily_change_pct"] = val
                details["thresholds"] = {"strong_buy": 2.0, "buy": 0.5, "sell": -0.5, "strong_sell": -2.0}
                details["signal"] = strategy.compute_intensity(df)
            else:
                details["signal"] = strategy.compute_intensity(df)
        else:
            # Default: use change_percent from cached stock data
            stock = stock_db.get_stocks_by_symbols([symbol])
            chg = stock[0]["change_percent"] if stock else 0
            details["daily_change_pct"] = chg
            details["thresholds"] = {"strong_buy": 2.0, "buy": 0.5, "sell": -0.5, "strong_sell": -2.0}
            from strategies.indicators import daily_change_pct as dcp_fn
            chg_series = dcp_fn(df["close"]).dropna()
            val = float(chg_series.iloc[-1]) if not chg_series.empty else 0
            if val > 2.0:
                details["signal"] = "STRONG BUY"
            elif val > 0.5:
                details["signal"] = "BUY"
            elif val < -2.0:
                details["signal"] = "STRONG SELL"
            elif val < -0.5:
                details["signal"] = "SELL"
            else:
                details["signal"] = "NEUTRAL"

        return {"success": True, **details}
    except Exception as e:
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


class SaveFilterRequest(BaseModel):
    name: str
    description: str = ""
    conditions: list[dict]


@app.get("/api/filters")
async def list_filters():
    """Return all registered filters (built-in + user-defined)."""
    return {"filters": filter_registry.list_all()}


@app.post("/api/filters")
async def create_filter(body: SaveFilterRequest):
    """Create or update a user-defined filter."""
    try:
        if not body.name.strip():
            return {"success": False, "error": "Filter name cannot be empty"}
        if not body.conditions:
            return {"success": False, "error": "Filter must have at least one condition"}
        filter_def = {
            "name": body.name.strip(),
            "description": body.description.strip(),
            "conditions": body.conditions,
        }
        filter_registry.add(filter_def)
        return {"success": True, "name": filter_def["name"]}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.delete("/api/filters/{name}")
async def delete_filter(name: str):
    """Delete a user-defined filter. Built-in filters cannot be deleted."""
    if filter_registry.get(name) and filter_registry.get(name).get("builtin"):
        return {"success": False, "error": f"Cannot delete built-in filter '{name}'"}
    if filter_registry.remove(name):
        return {"success": True}
    return {"success": False, "error": f"Filter '{name}' not found"}


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
                    "equity_curve": result.equity_curve,
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
                "equity_curve": result.equity_curve,
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
