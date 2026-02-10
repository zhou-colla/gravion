from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from db import stock_db

app = FastAPI(title="Gravion Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "gravion-backend"}


@app.get("/api/test-connection")
async def test_connection():
    """Quick connectivity test: fetches AAPL price via yfinance."""
    try:
        import yfinance as yf

        stock = yf.Ticker("AAPL")
        hist = stock.history(period="1d")
        price = float(hist["Close"].iloc[-1])

        return {"status": "connected", "symbol": "AAPL", "price": price, "source": "Yahoo Finance"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/run-scan")
async def run_scan():
    """
    Phase 1 scan: fetches AAPL data via yfinance, saves to SQLite, returns from DB.
    This proves the full pipeline: API -> DB -> UI.
    """
    try:
        import yfinance as yf

        stock = yf.Ticker("AAPL")
        hist = stock.history(period="2d")

        price = float(hist["Close"].iloc[-1])
        volume = int(hist["Volume"].iloc[-1])

        # Calculate daily change percent
        if len(hist) >= 2:
            prev_close = float(hist["Close"].iloc[-2])
            change_percent = round(((price - prev_close) / prev_close) * 100, 2)
        else:
            change_percent = 0.0

        name = stock.info.get("longName", "Apple Inc.")

        # Step 1: Save to database
        saved = stock_db.save_stock_data("AAPL", name, price, volume, change_percent)

        if not saved:
            return {"error": "Failed to save data to database"}

        # Step 2: Load from database (proves storage architecture)
        db_data = stock_db.get_stock_data("AAPL")

        if db_data:
            return {
                "success": True,
                "data": [
                    {
                        "symbol": db_data["symbol"],
                        "name": db_data["name"],
                        "price": db_data["price"],
                        "volume": db_data["volume"],
                        "change_percent": db_data["change_percent"],
                        "timestamp": db_data["timestamp"],
                    }
                ],
                "source": "Yahoo Finance (via SQLite)",
                "count": 1,
            }
        else:
            return {"error": "Data saved but could not be read back from database"}

    except Exception as e:
        print(f"Scan failed: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/db-stocks")
async def get_db_stocks():
    """Returns all stocks currently cached in the database."""
    stocks = stock_db.get_all_stocks()
    return {"success": True, "data": stocks, "count": len(stocks)}


if __name__ == "__main__":
    print("Gravion Backend Running on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
