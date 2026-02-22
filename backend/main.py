from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import asyncio

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


def _get_global_date_range():
    """Return (start_date, end_date) from global settings, or (None, None) if not configured."""
    g_start = stock_db.get_setting("global_start_date") or ""
    g_end = stock_db.get_setting("global_end_date") or ""
    return (g_start or None, g_end or None)


def resolve_date_range(start_date: str | None, end_date: str | None, period: str | None):
    """Convert period strings to concrete start/end dates.
    Priority: explicit args > global settings > period fallback.
    Returns (start_str, end_str)."""
    if start_date and end_date:
        return start_date, end_date

    # Fall back to global settings
    g_start, g_end = _get_global_date_range()
    if g_start and g_end:
        return g_start, g_end

    end = date.today()
    period_map = {"6mo": 183, "1y": 365, "2y": 730, "5y": 1825}
    days = period_map.get(period or "1y", 365)
    start = end - timedelta(days=days)
    return start.isoformat(), end.isoformat()


def ensure_history(symbol: str, start_date: str, end_date: str):
    """Fetch only the missing date segments for a symbol using the configured data source."""
    if stock_db.has_history_coverage(symbol, start_date, end_date):
        return True
    data_source = stock_db.get_setting("data_source") or "yahoo_finance"
    segments = _get_missing_segments(symbol, start_date, end_date)
    fetched_any = False
    for seg_start, seg_end in segments:
        try:
            if data_source == "tushare":
                rows = _fetch_tushare_history(symbol, seg_start, seg_end)
            elif data_source == "binance":
                rows = _fetch_binance_history(symbol, seg_start, seg_end)
            else:
                rows = _fetch_yfinance_history(symbol, start_date=seg_start, end_date=seg_end)
            if rows:
                stock_db.save_stock_history(symbol, rows)
                fetched_any = True
        except Exception as e:
            print(f"ensure_history segment {seg_start}–{seg_end} failed for {symbol}: {e}")
    return fetched_any or stock_db.has_history_coverage(symbol, start_date, end_date)


class SettingsUpdateRequest(BaseModel):
    data_source: Optional[str] = None
    global_start_date: Optional[str] = None
    global_end_date: Optional[str] = None
    tushare_api_key: Optional[str] = None
    binance_api_key: Optional[str] = None
    binance_api_secret: Optional[str] = None


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
    # Single strategy (primary signal column)
    strategy: Optional[str] = None
    # Multiple strategies for side-by-side comparison
    strategies: Optional[list[str]] = None
    # Single filter (legacy)
    filter: Optional[str] = None
    # Multiple filters with AND/OR logic between them
    filters: Optional[list[str]] = None
    filter_operator: str = "AND"  # "AND" or "OR"


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
        "tushare_api_key": settings.get("tushare_api_key"),
        "binance_api_key": settings.get("binance_api_key", ""),
        "binance_api_secret": settings.get("binance_api_secret", ""),
    }


@app.put("/api/settings")
async def update_settings(body: SettingsUpdateRequest):
    if body.data_source is not None:
        stock_db.set_setting("data_source", body.data_source)
    if body.global_start_date is not None:
        stock_db.set_setting("global_start_date", body.global_start_date)
    if body.global_end_date is not None:
        stock_db.set_setting("global_end_date", body.global_end_date)
    if body.tushare_api_key is not None:
        stock_db.set_setting("tushare_api_key", body.tushare_api_key)
    if body.binance_api_key is not None:
        stock_db.set_setting("binance_api_key", body.binance_api_key)
    if body.binance_api_secret is not None:
        stock_db.set_setting("binance_api_secret", body.binance_api_secret)
    settings = stock_db.get_all_settings()
    return {
        "success": True,
        "data_source": settings.get("data_source", "yahoo_finance"),
        "global_start_date": settings.get("global_start_date", ""),
        "global_end_date": settings.get("global_end_date", ""),
        "tushare_api_key": settings.get("tushare_api_key"),
        "binance_api_key": settings.get("binance_api_key", ""),
        "binance_api_secret": settings.get("binance_api_secret", ""),
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
        fetched_count = 0
        errors = []

        if data_source == "tushare":
            try:
                import tushare as ts
                api_key = stock_db.get_setting("tushare_api_key")
                if not api_key:
                    return {"success": False, "error": "Tushare API key not configured. Please set tushare_api_key in settings."}
                pro = ts.pro_api(api_key)
                today = datetime.now().strftime("%Y%m%d")
                yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")

                for sym in symbols:
                    try:
                        # Always fetch historical data first, regardless of current price data availability
                        start_date, end_date = resolve_date_range(None, None, "1y")
                        ensure_history(sym, start_date, end_date)
                        
                        ts_code = _to_ts_code(sym)
                        is_cn = _is_cn_stock(sym)
                        if is_cn:
                            price_df = pro.daily(ts_code=ts_code, start_date=yesterday, end_date=today)
                            try:
                                info_df = pro.stock_basic(ts_code=ts_code, fields="ts_code,name")
                                name = info_df.iloc[0]["name"] if not info_df.empty else sym
                            except Exception:
                                name = sym
                        else:
                            price_df = pro.us_daily(ts_code=ts_code, start_date=yesterday, end_date=today)
                            try:
                                info_df = pro.us_basic(ts_code=ts_code, fields="ts_code,enname")
                                name = info_df.iloc[0]["enname"] if not info_df.empty else sym
                            except Exception:
                                name = sym

                        if price_df is None or price_df.empty:
                            errors.append(f"{sym}: no price data from Tushare")
                            continue

                        price_df = price_df.sort_values("trade_date", ascending=False)
                        latest = price_df.iloc[0]
                        close_val = float(latest.get("close", 0) or 0)
                        open_val = float(latest.get("open", 0) or 0)
                        high_val = float(latest.get("high", 0) or 0)
                        low_val = float(latest.get("low", 0) or 0)
                        volume_val = int(latest.get("vol", 0) or 0)

                        if len(price_df) >= 2:
                            prev_close = float(price_df.iloc[1].get("close", 0) or 0)
                            change_pct = round(((close_val - prev_close) / prev_close) * 100, 2) if prev_close else 0.0
                        else:
                            change_pct = 0.0

                        stock_db.save_stock_data(
                            symbol=sym,
                            name=name,
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
                        errors.append(f"{sym}: {str(e)}")

            except Exception as e:
                print(f"Tushare fetch failed: {e}")
                return {"success": False, "error": f"Tushare API error: {str(e)}"}

        elif data_source == "binance":
            for sym in symbols:
                try:
                    start_date, end_date = resolve_date_range(None, None, "1y")
                    ensure_history(sym, start_date, end_date)

                    # Use 24hr ticker for current price, OHLCV, and change %
                    ticker = _get_binance_24hr_ticker(sym)
                    if ticker is None:
                        errors.append(f"{sym}: failed to get ticker data from Binance")
                        continue

                    close_val = float(ticker.get("lastPrice") or 0)
                    open_val = float(ticker.get("openPrice") or 0)
                    high_val = float(ticker.get("highPrice") or 0)
                    low_val = float(ticker.get("lowPrice") or 0)
                    volume_val = int(float(ticker.get("volume") or 0))
                    change_pct = round(float(ticker.get("priceChangePercent") or 0), 2)

                    stock_db.save_stock_data(
                        symbol=sym,
                        name=sym,
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
                    errors.append(f"{sym}: {str(e)}")

        else:
            # Default to yfinance
            import yfinance as yf
            
            # Batch download: single HTTP call for all symbols
            data = yf.download(symbols, period="2d", group_by="ticker", threads=True)

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
            "total": len(symbols) if symbols else fetched_count,
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
        if data_source == "yahoo_finance":
            source_label = "Yahoo Finance (yfinance)"
        elif data_source == "moomoo_opend":
            source_label = "Moomoo OpenD"
        elif data_source == "tushare":
            source_label = "Tushare"
        else:
            source_label = "Unknown"


        # Resolve primary strategy + comparison strategies
        screen_strategy = None
        if body and body.strategy:
            screen_strategy = strategy_loader.get(body.strategy)

        comparison_strategies: list = []
        if body and body.strategies:
            for sname in body.strategies:
                s = strategy_loader.get(sname)
                if s:
                    comparison_strategies.append(s)

        # Resolve filters — merge legacy `filter` and new `filters` list
        filter_names: list[str] = []
        if body:
            if body.filters:
                filter_names = body.filters
            elif body.filter:
                filter_names = [body.filter]
        filter_operator = (body.filter_operator if body else "AND") or "AND"

        # Resolve filter conditions and compute per-filter tags
        filter_conditions_list: list[list[dict]] = []
        all_filter_tags: list[str] = []
        for fname in filter_names:
            f = filter_registry.get(fname)
            if f:
                conds = f.get("conditions", [])
                filter_conditions_list.append(conds)
                tags = [condition_label(c) for c in conds]
                all_filter_tags.extend(tags)

        results = []
        for stock in stocks:
            sym = stock["symbol"]

            # Load history once per stock (shared across signal + filter evaluation)
            history = None
            need_history = screen_strategy is not None or comparison_strategies or filter_conditions_list
            if need_history:
                history = stock_db.get_stock_history(sym)

            # Primary signal
            if screen_strategy is not None and history and len(history) >= 2:
                df = pd.DataFrame(history)
                try:
                    stock["signal"] = screen_strategy.compute_intensity(df)
                except Exception:
                    stock["signal"] = compute_signal(stock)
            else:
                stock["signal"] = compute_signal(stock)

            # Per-strategy comparison signals
            if comparison_strategies and history and len(history) >= 2:
                df = pd.DataFrame(history)
                signals: dict[str, str] = {}
                for cs in comparison_strategies:
                    try:
                        signals[cs.name] = cs.compute_intensity(df)
                    except Exception:
                        signals[cs.name] = "NEUTRAL"
                stock["signals"] = signals
            else:
                stock["signals"] = {}

            stock["yoy_growth"] = None

            # Apply filters
            if filter_conditions_list:
                results_per_filter = []
                for conds in filter_conditions_list:
                    results_per_filter.append(evaluate_filter(history or [], conds))
                if filter_operator.upper() == "OR":
                    passes = any(results_per_filter)
                else:
                    passes = all(results_per_filter)
                if not passes:
                    continue

            results.append(stock)

        return {
            "success": True,
            "data": results,
            "count": len(results),
            "source": source_label,
            "active_filters": filter_names,
            "filter_operator": filter_operator,
            "filter_tags": all_filter_tags,
            "comparison_strategies": [cs.name for cs in comparison_strategies],
        }

    except Exception as e:
        print(f"Screen failed: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/db-info")
async def db_info():
    """Returns database metadata for the footer status bar."""
    info = stock_db.get_db_info()
    return {"success": True, **info}


import re as _re


def _is_cn_stock(symbol: str) -> bool:
    """Return True if symbol is a Chinese A-share (6-digit code, optional .SH/.SZ/.BJ suffix)."""
    s = symbol.strip().upper()
    if "." in s:
        parts = s.rsplit(".", 1)
        return parts[-1] in ("SH", "SZ", "BJ") and bool(_re.match(r"^\d{6}$", parts[0]))
    return bool(_re.match(r"^\d{6}$", s))


def _to_ts_code(symbol: str) -> str:
    """Convert bare 6-digit A-share code to Tushare ts_code (e.g. 600519 -> 600519.SH)."""
    s = symbol.strip().upper()
    if "." in s:
        return s  # already has exchange suffix
    if _re.match(r"^\d{6}$", s):
        first = s[0]
        if first in ("6", "5"):
            return f"{s}.SH"
        elif first in ("4", "8"):
            return f"{s}.BJ"
        else:
            return f"{s}.SZ"
    return s  # US stock or other format


def _get_missing_segments(symbol: str, want_start: str, want_end: str) -> list[tuple[str, str]]:
    """Return list of (start, end) date ranges not yet in cache for the given symbol."""
    cache_min, cache_max = stock_db.get_history_min_max(symbol)
    if not cache_min:
        return [(want_start, want_end)]
    segments = []
    if want_start < cache_min:
        segments.append((want_start, cache_min))
    if want_end > cache_max:
        segments.append((cache_max, want_end))
    return segments


def _fetch_yfinance_history(symbol: str, period: str | None = None,
                             start_date: str | None = None, end_date: str | None = None) -> list[dict] | None:
    """Download OHLC history from yfinance and return as list of dicts. Returns None on failure."""
    try:
        import yfinance as yf
        if start_date and end_date:
            df = yf.download(symbol, start=start_date, end=end_date, progress=False)
        else:
            df = yf.download(symbol, period=period or "1y", progress=False)
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


def _fetch_tushare_history(symbol: str, start_date: str | None = None,
                            end_date: str | None = None) -> list[dict] | None:
    """Download OHLC history from Tushare and return as list of dicts. Returns None on failure."""
    try:
        import tushare as ts
        api_key = stock_db.get_setting("tushare_api_key")
        if not api_key:
            return None
        pro = ts.pro_api(api_key)
        ts_code = _to_ts_code(symbol)
        is_cn = _is_cn_stock(symbol)
        # Convert YYYY-MM-DD to YYYYMMDD for Tushare
        ts_start = start_date.replace("-", "") if start_date else None
        ts_end = end_date.replace("-", "") if end_date else None

        if is_cn:
            df = pro.daily(ts_code=ts_code, start_date=ts_start, end_date=ts_end)
        else:
            df = pro.us_daily(ts_code=ts_code, start_date=ts_start, end_date=ts_end)

        if df is None or df.empty:
            return None
        df = df.sort_values("trade_date", ascending=True)
        rows = []
        for _, row in df.iterrows():
            d = str(row["trade_date"])
            rows.append({
                "date": f"{d[:4]}-{d[4:6]}-{d[6:]}",
                "open": float(row["open"]) if pd.notna(row["open"]) else None,
                "high": float(row["high"]) if pd.notna(row["high"]) else None,
                "low": float(row["low"]) if pd.notna(row["low"]) else None,
                "close": float(row["close"]) if pd.notna(row["close"]) else None,
                "volume": int(row["vol"]) if pd.notna(row["vol"]) else 0,
            })
        return rows if rows else None
    except Exception as e:
        print(f"Tushare history fetch failed for {symbol}: {e}")
        return None


def _fetch_tushare_income(symbol: str, start_date: str, end_date: str) -> list[dict] | None:
    """Fetch quarterly income statements from Tushare for a CN A-share. Returns list of dicts."""
    try:
        import tushare as ts
        api_key = stock_db.get_setting("tushare_api_key")
        if not api_key:
            return None
        pro = ts.pro_api(api_key)
        ts_code = _to_ts_code(symbol)
        df = pro.income(
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fields="ts_code,ann_date,end_date,basic_eps,diluted_eps,total_revenue,"
                   "revenue,total_profit,n_income,n_income_attr_p,operate_profit,"
                   "total_cogs,oper_cost,income_tax",
        )
        if df is None or df.empty:
            return None
        # Drop duplicates by end_date, keep first (most recent announcement)
        df = df.drop_duplicates(subset=["end_date"], keep="first")
        df = df.sort_values("end_date", ascending=True)
        rows = []
        for _, row in df.iterrows():
            def _f(key):
                v = row.get(key)
                return float(v) if v is not None and pd.notna(v) else None
            rows.append({
                "end_date": str(row["end_date"]),
                "ann_date": str(row["ann_date"]) if pd.notna(row.get("ann_date")) else None,
                "total_revenue": _f("total_revenue"),
                "revenue": _f("revenue"),
                "total_profit": _f("total_profit"),
                "n_income": _f("n_income"),
                "n_income_attr_p": _f("n_income_attr_p"),
                "operate_profit": _f("operate_profit"),
                "total_cogs": _f("total_cogs"),
                "oper_cost": _f("oper_cost"),
                "income_tax": _f("income_tax"),
                "basic_eps": _f("basic_eps"),
                "diluted_eps": _f("diluted_eps"),
            })
        return rows if rows else None
    except Exception as e:
        print(f"Tushare income fetch failed for {symbol}: {e}")
        return None


# ── Binance helpers ──

CRYPTO_QUOTE_ASSETS = ["USDT", "BUSD", "USDC", "BTC", "ETH", "BNB", "FDUSD", "TUSD"]


def _is_crypto_symbol(symbol: str) -> bool:
    """Return True if symbol looks like a Binance crypto trading pair (e.g. BTCUSDT)."""
    s = symbol.upper()
    return s.isalpha() and any(s.endswith(q) for q in CRYPTO_QUOTE_ASSETS)


def _fetch_binance_history(symbol: str, start_date: str | None = None,
                            end_date: str | None = None) -> list[dict] | None:
    """Download daily OHLC history from Binance public K-line API. No API key required.
    Returns list of dicts with date, open, high, low, close, volume. Returns None on failure."""
    try:
        import requests

        symbol_upper = symbol.upper()
        base_url = "https://api.binance.com/api/v3/klines"

        def _date_to_ms(d: str) -> int:
            return int(datetime.strptime(d, "%Y-%m-%d").timestamp() * 1000)

        start_ms = _date_to_ms(start_date) if start_date else None
        end_ms = _date_to_ms(end_date) if end_date else int(datetime.now().timestamp() * 1000)

        all_rows: list[dict] = []

        while True:
            params: dict = {"symbol": symbol_upper, "interval": "1d", "limit": 1000}
            if start_ms:
                params["startTime"] = start_ms
            if end_ms:
                params["endTime"] = end_ms

            resp = requests.get(base_url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            if not data:
                break

            for kline in data:
                open_time_ms = kline[0]
                date_str = datetime.utcfromtimestamp(open_time_ms / 1000).strftime("%Y-%m-%d")
                all_rows.append({
                    "date": date_str,
                    "open": float(kline[1]),
                    "high": float(kline[2]),
                    "low": float(kline[3]),
                    "close": float(kline[4]),
                    "volume": int(float(kline[5])),
                })

            if len(data) < 1000:
                break

            # Advance past the last candle's open time
            start_ms = data[-1][0] + 1

        return all_rows if all_rows else None
    except Exception as e:
        print(f"Binance history fetch failed for {symbol}: {e}")
        return None


def _get_binance_24hr_ticker(symbol: str) -> dict | None:
    """Fetch 24hr rolling window stats from Binance. Returns dict with price, change%, OHLCV."""
    try:
        import requests
        resp = requests.get(
            "https://api.binance.com/api/v3/ticker/24hr",
            params={"symbol": symbol.upper()},
            timeout=5,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Binance 24hr ticker failed for {symbol}: {e}")
        return None


def _validate_binance_keys(api_key: str, api_secret: str) -> dict:
    """Test Binance API connectivity and key validity.
    Returns dict with success, message, authenticated."""
    try:
        import requests

        if not api_key:
            # Public connectivity check only
            resp = requests.get("https://api.binance.com/api/v3/ping", timeout=5)
            resp.raise_for_status()
            return {
                "success": True,
                "message": "Binance API is reachable. No API key configured.",
                "authenticated": False,
            }

        # Signed account endpoint requires HMAC-SHA256 signature
        import hmac
        import hashlib
        import time

        ts = int(time.time() * 1000)
        query = f"timestamp={ts}"
        sig = hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()

        headers = {"X-MBX-APIKEY": api_key}
        resp = requests.get(
            f"https://api.binance.com/api/v3/account?{query}&signature={sig}",
            headers=headers,
            timeout=8,
        )

        if resp.status_code == 200:
            return {"success": True, "message": "API key is valid with read access.", "authenticated": True}
        elif resp.status_code == 401:
            return {"success": False, "message": "Invalid API key or secret.", "authenticated": False}
        elif resp.status_code == 403:
            return {"success": False, "message": "API key lacks required permissions.", "authenticated": False}
        else:
            msg = resp.json().get("msg", f"HTTP {resp.status_code}")
            return {"success": False, "message": msg, "authenticated": False}

    except Exception as e:
        return {"success": False, "message": str(e), "authenticated": False}


def _enrich_statements(rows: list[dict]) -> list[dict]:
    """Add end_date_iso and period_label to each financial statement row."""
    month_to_q = {"03": "Q1", "06": "Q2", "09": "Q3", "12": "Q4"}
    enriched = []
    for r in rows:
        d = str(r.get("end_date", ""))
        iso = f"{d[:4]}-{d[4:6]}-{d[6:]}" if len(d) == 8 else d
        q = month_to_q.get(d[4:6], "?") if len(d) >= 6 else "?"
        year = d[:4] if len(d) >= 4 else "?"
        enriched.append({**r, "end_date_iso": iso, "period_label": f"{q} {year}"})
    return enriched


def _build_financials_summary(statements: list[dict]) -> dict:
    """Compute aggregate summary metrics from a list of financial statement rows."""
    if not statements:
        return {
            "latest_eps": None, "latest_revenue": None, "latest_profit": None,
            "revenue_growth_pct": None, "profit_growth_pct": None,
            "avg_profit_margin_pct": None, "periods_available": 0,
        }
    latest = statements[-1]
    latest_eps = latest.get("basic_eps")
    latest_revenue = latest.get("total_revenue")
    latest_profit = latest.get("n_income_attr_p")

    # YoY growth: last 4 quarters vs prior 4 quarters
    revenue_growth = profit_growth = None
    if len(statements) >= 8:
        recent_rev = sum(s.get("total_revenue") or 0 for s in statements[-4:])
        prior_rev = sum(s.get("total_revenue") or 0 for s in statements[-8:-4])
        if prior_rev:
            revenue_growth = round((recent_rev - prior_rev) / abs(prior_rev) * 100, 2)
        recent_prof = sum(s.get("n_income_attr_p") or 0 for s in statements[-4:])
        prior_prof = sum(s.get("n_income_attr_p") or 0 for s in statements[-8:-4])
        if prior_prof:
            profit_growth = round((recent_prof - prior_prof) / abs(prior_prof) * 100, 2)

    # Average profit margin
    margins = []
    for s in statements:
        rev = s.get("total_revenue")
        prof = s.get("n_income_attr_p")
        if rev and prof and rev != 0:
            margins.append(prof / rev * 100)
    avg_margin = round(sum(margins) / len(margins), 2) if margins else None

    return {
        "latest_eps": latest_eps,
        "latest_revenue": latest_revenue,
        "latest_profit": latest_profit,
        "revenue_growth_pct": revenue_growth,
        "profit_growth_pct": profit_growth,
        "avg_profit_margin_pct": avg_margin,
        "periods_available": len(statements),
    }


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
            # Use global date range if configured, otherwise default 1 year
            g_start, g_end = _get_global_date_range()
            fetch_start = g_start or (date.today() - timedelta(days=365)).isoformat()
            fetch_end = g_end or date.today().isoformat()
            # Incremental fetch: only downloads missing segments
            ensure_history(symbol, fetch_start, fetch_end)
            history_rows = (
                stock_db.get_stock_history_range(symbol, fetch_start, fetch_end)
                or stock_db.get_stock_history(symbol)
            )
            from_cache = bool(history_rows)
            if not history_rows:
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
        if realtime and (stock_db.get_setting("data_source") or "yahoo_finance") != "tushare":
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


@app.get("/api/stock/{symbol}/financials")
async def stock_financials(
    symbol: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    realtime: bool = False,
):
    """
    Returns quarterly financial statements for a stock.
    - CN A-shares: uses Tushare income API (cached for 90 days)
    - US stocks: returns yfinance fundamentals snapshot (PE, market cap, margins, etc.)
    """
    try:
        from datetime import datetime as _dt
        symbol = symbol.upper()
        is_cn = _is_cn_stock(symbol)

        if not is_cn:
            # US stock: return yfinance snapshot fundamentals
            yf_data: dict = {}
            if realtime:
                try:
                    import yfinance as yf
                    info = yf.Ticker(symbol).info or {}
                    yf_data = {
                        "short_name": info.get("shortName"),
                        "sector": info.get("sector"),
                        "pe_ratio": info.get("trailingPE"),
                        "market_cap": info.get("marketCap"),
                        "total_revenue": info.get("totalRevenue"),
                        "revenue_growth": info.get("revenueGrowth"),
                        "gross_margins": info.get("grossMargins"),
                        "operating_margins": info.get("operatingMargins"),
                    }
                except Exception as e:
                    print(f"yfinance fundamentals failed for {symbol}: {e}")
            return {
                "success": True,
                "symbol": symbol,
                "is_cn_stock": False,
                "statements": [],
                "yfinance_fundamentals": yf_data if yf_data else None,
            }

        # CN stock: use Tushare income data
        data_source = stock_db.get_setting("data_source") or "yahoo_finance"
        if data_source != "tushare":
            # Check if we have any cached data regardless of source setting
            cached = stock_db.get_financial_statements(symbol)
            if not cached:
                return {
                    "success": False,
                    "symbol": symbol,
                    "is_cn_stock": True,
                    "error": "Financial data requires Tushare data source. Switch to Tushare in Settings.",
                    "statements": [],
                }

        resolved_start, resolved_end = resolve_date_range(start_date, end_date, None)
        ts_start = resolved_start.replace("-", "")
        ts_end = resolved_end.replace("-", "")

        from_cache = True
        if realtime and not stock_db.has_fresh_financials(symbol):
            rows = _fetch_tushare_income(symbol, ts_start, ts_end)
            if rows:
                stock_db.save_financial_statements(symbol, rows)
                from_cache = False
            elif not stock_db.get_financial_statements(symbol):
                # Detect quota errors (already printed in _fetch_tushare_income)
                return {
                    "success": False,
                    "symbol": symbol,
                    "is_cn_stock": True,
                    "error": "Failed to fetch financial data. Check Tushare API key and available points.",
                    "code": "tushare_fetch_failed",
                    "statements": [],
                }

        statements = stock_db.get_financial_statements(symbol, ts_start, ts_end)
        if not statements:
            if not realtime:
                return {
                    "success": False,
                    "symbol": symbol,
                    "is_cn_stock": True,
                    "error": "No cached financial data. Enable Realtime Fetch to download.",
                    "statements": [],
                }
            return {
                "success": False,
                "symbol": symbol,
                "is_cn_stock": True,
                "error": f"No financial data found for {symbol} in the selected date range.",
                "statements": [],
            }

        enriched = _enrich_statements(statements)
        summary = _build_financials_summary(statements)
        return {
            "success": True,
            "symbol": symbol,
            "is_cn_stock": True,
            "from_cache": from_cache,
            "statements": enriched,
            "summary": summary,
        }

    except Exception as e:
        print(f"Financials endpoint failed for {symbol}: {e}")
        return {"success": False, "error": str(e), "statements": []}


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

        # Resolve date range: global settings > period fallback
        g_start, g_end = _get_global_date_range()
        period = body.period if body and body.period else "1y"
        if g_start and g_end:
            fetch_start, fetch_end = g_start, g_end
        else:
            fetch_start, fetch_end = resolve_date_range(None, None, period)
        cached = 0
        skipped = 0
        errors = []

        # Process in batches of 5 to avoid rate limits
        batch_size = 5
        for batch_start in range(0, len(symbols), batch_size):
            batch = symbols[batch_start:batch_start + batch_size]
            for sym in batch:
                try:
                    # Skip if cache already fully covers the requested range
                    if stock_db.has_history_coverage(sym, fetch_start, fetch_end):
                        skipped += 1
                        continue
                    ok = ensure_history(sym, fetch_start, fetch_end)
                    if ok:
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
    realtime: bool = False  # False = cache-first (no yfinance calls)


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


class OptimizeRequest(BaseModel):
    strategy_name: str
    param_sweeps: list[dict]  # [{param: str, values: [v1, v2, ...]}]
    start_date: str | None = None
    end_date: str | None = None
    period: str | None = None
    initial_capital: float = 10000.0
    realtime: bool = False  # False = cache-first (no yfinance calls)


@app.post("/api/backtest/optimize/{symbol}")
async def optimize_backtest(symbol: str, body: OptimizeRequest):
    """
    Run a parameter sweep backtest for a single symbol.
    Tries every combination of param_sweeps values (cartesian product).
    Returns results sorted by total_return_pct descending.
    """
    try:
        import itertools
        symbol = symbol.upper()

        start_date, end_date = resolve_date_range(body.start_date, body.end_date, body.period)
        if body.realtime:
            await asyncio.sleep(0.25)
            ensure_history(symbol, start_date, end_date)
        history = stock_db.get_stock_history_range(symbol, start_date, end_date)
        if not history:
            history = stock_db.get_stock_history(symbol) or []
        if not history:
            hint = "" if body.realtime else " (enable Realtime to fetch fresh data)"
            return {"success": False, "error": f"No historical data for {symbol}{hint}"}

        df = pd.DataFrame(history)

        param_names = [s["param"] for s in body.param_sweeps]
        param_value_lists = [s["values"] for s in body.param_sweeps]

        results = []
        for combo in itertools.product(*param_value_lists):
            params = dict(zip(param_names, combo))
            strategy = strategy_loader.instantiate_with_params(body.strategy_name, params)
            if strategy is None:
                continue
            try:
                result = run_backtest(strategy, df, initial_capital=body.initial_capital)
                results.append({
                    "params": params,
                    "total_return_pct": result.total_return_pct,
                    "win_rate_pct": result.win_rate_pct,
                    "profit_factor": result.profit_factor,
                    "max_drawdown_pct": result.max_drawdown_pct,
                    "trade_count": len(result.trades),
                })
            except Exception as e:
                results.append({"params": params, "error": str(e)})

        results.sort(key=lambda r: r.get("total_return_pct", float("-inf")), reverse=True)

        return {
            "success": True,
            "symbol": symbol,
            "strategy_name": body.strategy_name,
            "date_range": {"start": start_date, "end": end_date},
            "combinations_tested": len(results),
            "results": results,
        }

    except Exception as e:
        print(f"Optimize failed for {symbol}: {e}")
        return {"success": False, "error": str(e)}


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

        import asyncio as _asyncio

        start_date, end_date = resolve_date_range(body.start_date, body.end_date, body.period)

        results = []
        errors = []

        for i, sym in enumerate(symbols):
            sym = sym.upper()
            try:
                from_cache = True

                if body.realtime:
                    # Throttle to avoid yfinance rate limits (250ms between requests)
                    if i > 0:
                        await _asyncio.sleep(0.25)
                    fetched = ensure_history(sym, start_date, end_date)
                    from_cache = not fetched

                # Try requested date range first
                history = stock_db.get_stock_history_range(sym, start_date, end_date)

                # Fallback: use all cached history (ignoring date range)
                if not history:
                    history = stock_db.get_stock_history(sym)
                    if history:
                        from_cache = True  # definitely from cache

                if not history:
                    hint = "" if body.realtime else " (enable Realtime to fetch fresh data)"
                    errors.append({"symbol": sym, "error": f"No historical data available{hint}"})
                    continue

                actual_start = history[0]["date"]
                actual_end = history[-1]["date"]

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
                    "data_start": actual_start,
                    "data_end": actual_end,
                    "from_cache": from_cache,
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


# ── Binance API endpoints ──

@app.post("/api/binance/validate")
async def validate_binance():
    """Test Binance API connectivity and validate stored API key credentials."""
    api_key = stock_db.get_setting("binance_api_key") or ""
    api_secret = stock_db.get_setting("binance_api_secret") or ""
    result = _validate_binance_keys(api_key, api_secret)
    return result


@app.get("/api/binance/symbols")
async def list_binance_symbols(q: Optional[str] = None):
    """Return Binance spot trading pairs, optionally filtered by query string."""
    try:
        import requests
        resp = requests.get("https://api.binance.com/api/v3/exchangeInfo", timeout=15)
        resp.raise_for_status()
        data = resp.json()

        symbols = [
            s["symbol"]
            for s in data.get("symbols", [])
            if s.get("status") == "TRADING" and s.get("isSpotTradingAllowed")
        ]

        if q:
            q_upper = q.upper()
            symbols = [s for s in symbols if q_upper in s]

        # Common USDT pairs first for better UX
        usdt = [s for s in symbols if s.endswith("USDT")]
        other = [s for s in symbols if not s.endswith("USDT")]
        ordered = usdt + other

        return {"success": True, "symbols": ordered[:200], "total": len(symbols)}
    except Exception as e:
        return {"success": False, "symbols": [], "error": str(e)}


if __name__ == "__main__":
    print("Gravion Backend v2.0 Running on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
