from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from db import stock_db

app = FastAPI(title="Gravion Backend", version="1.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# fmt: off
NASDAQ_100_SYMBOLS = [
    "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "GOOG", "META", "TSLA",
    "AVGO", "COST", "NFLX", "AMD", "ADBE", "PEP", "CSCO", "TMUS",
    "LIN", "INTC", "INTU", "CMCSA", "AMGN", "TXN", "MU", "QCOM",
    "ISRG", "HON", "AMAT", "BKNG", "LRCX", "VRTX", "REGN", "ADI",
    "KLAC", "PANW", "ADP", "SBUX", "MDLZ", "SNPS", "GILD", "MELI",
    "PYPL", "CDNS", "ASML", "CRWD", "CTAS", "MAR", "ABNB", "ORLY",
    "CSX", "MRVL", "MNST", "NXPI", "FTNT", "PCAR", "WDAY", "CEG",
    "DASH", "ROST", "DXCM", "ODFL", "ROP", "AEP", "CPRT", "FANG",
    "KDP", "FAST", "PAYX", "IDXX", "CTSH", "EA", "KHC", "GEHC",
    "BKR", "VRSK", "EXC", "LULU", "MCHP", "XEL", "ON", "CCEP",
    "TTD", "TEAM", "CDW", "DDOG", "CSGP", "ANSS", "GFS", "BIIB",
    "ZS", "ILMN", "WBD", "MRNA", "SIRI", "DLTR", "MDB", "SMCI",
    "ARM", "COIN", "PDD", "JD",
]
# fmt: on


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


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "gravion-backend", "version": "1.3.0"}


@app.post("/api/fetch")
async def fetch_data():
    """
    Fetch fresh NASDAQ 100 data from yfinance (batch download).
    Saves OHLC + metadata to SQLite. Returns summary only.
    """
    try:
        import yfinance as yf
        from datetime import datetime
        import math

        symbols = NASDAQ_100_SYMBOLS
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
async def screen_stocks():
    """
    Screen stocks from the local database. No external API calls.
    Computes signals and returns data for the UI grid.
    """
    try:
        stocks = stock_db.get_all_stocks()

        results = []
        for stock in stocks:
            stock["signal"] = compute_signal(stock)
            stock["yoy_growth"] = None  # Placeholder for Phase 2.2
            results.append(stock)

        return {
            "success": True,
            "data": results,
            "count": len(results),
            "source": "Yahoo Finance (yfinance)",
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


if __name__ == "__main__":
    print("Gravion Backend v1.3 Running on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
