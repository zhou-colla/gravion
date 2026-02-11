import sqlite3
import os
from datetime import datetime


class StockDatabase:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gravion.db")
        self.db_path = db_path
        self._initialize_db()

    def _initialize_db(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS stock_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT UNIQUE,
                    name TEXT,
                    price REAL,
                    open REAL,
                    high REAL,
                    low REAL,
                    close REAL,
                    volume INTEGER,
                    change_percent REAL DEFAULT 0.0,
                    last_fetched DATETIME,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Migration: add columns if upgrading from Phase 1 schema
            for col, col_type in [
                ("open", "REAL"),
                ("high", "REAL"),
                ("low", "REAL"),
                ("close", "REAL"),
                ("last_fetched", "DATETIME"),
            ]:
                try:
                    cursor.execute(f"ALTER TABLE stock_cache ADD COLUMN {col} {col_type}")
                except sqlite3.OperationalError:
                    pass  # column already exists

            # Phase 3: Historical OHLC data for charting
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS stock_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    date TEXT NOT NULL,
                    open REAL,
                    high REAL,
                    low REAL,
                    close REAL,
                    volume INTEGER,
                    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(symbol, date)
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_symbol_date
                ON stock_history(symbol, date)
            """)
            conn.commit()
            conn.close()
            print(f"Database initialized at {self.db_path}")
        except Exception as e:
            print(f"Error initializing database: {e}")

    def save_stock_data(
        self,
        symbol,
        name,
        price,
        volume,
        change_percent=0.0,
        open_price=None,
        high_price=None,
        low_price=None,
        close_price=None,
        last_fetched=None,
    ):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            now = datetime.now().isoformat()
            cursor.execute(
                """
                INSERT OR REPLACE INTO stock_cache
                    (symbol, name, price, open, high, low, close, volume, change_percent, last_fetched, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    symbol,
                    name,
                    price,
                    open_price,
                    high_price,
                    low_price,
                    close_price,
                    volume,
                    change_percent,
                    last_fetched or now,
                    now,
                ),
            )
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error saving stock data for {symbol}: {e}")
            return False

    def get_stock_data(self, symbol):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT symbol, name, price, open, high, low, close, volume,
                       change_percent, last_fetched, timestamp
                FROM stock_cache WHERE symbol = ?
                ORDER BY timestamp DESC LIMIT 1
            """,
                (symbol,),
            )
            row = cursor.fetchone()
            conn.close()
            return dict(row) if row else None
        except Exception as e:
            print(f"Error retrieving stock data: {e}")
            return None

    def get_all_stocks(self):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT symbol, name, price, open, high, low, close, volume,
                       change_percent, last_fetched, timestamp
                FROM stock_cache ORDER BY symbol ASC
            """)
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error retrieving all stocks: {e}")
            return []

    def get_db_info(self):
        try:
            size_bytes = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM stock_cache")
            count = cursor.fetchone()[0]
            conn.close()
            return {
                "path": os.path.basename(self.db_path),
                "size_bytes": size_bytes,
                "stock_count": count,
            }
        except Exception as e:
            print(f"Error getting db info: {e}")
            return {"path": "gravion.db", "size_bytes": 0, "stock_count": 0}

    def save_stock_history(self, symbol, rows):
        """Batch insert historical OHLC data. rows = list of dicts with date, open, high, low, close, volume."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.executemany(
                """
                INSERT OR REPLACE INTO stock_history (symbol, date, open, high, low, close, volume, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (symbol, r["date"], r["open"], r["high"], r["low"], r["close"], r["volume"], datetime.now().isoformat())
                    for r in rows
                ],
            )
            conn.commit()
            conn.close()
            return len(rows)
        except Exception as e:
            print(f"Error saving stock history for {symbol}: {e}")
            return 0

    def get_stock_history(self, symbol):
        """Return historical OHLC data ordered by date ASC."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT date, open, high, low, close, volume
                FROM stock_history WHERE symbol = ? ORDER BY date ASC
                """,
                (symbol,),
            )
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error retrieving stock history for {symbol}: {e}")
            return []

    def get_history_freshness(self, symbol):
        """Return the most recent date and fetch timestamp for a symbol's history."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT MAX(date) as max_date, MAX(fetched_at) as last_fetch FROM stock_history WHERE symbol = ?",
                (symbol,),
            )
            row = cursor.fetchone()
            conn.close()
            if row and row[0]:
                return {"max_date": row[0], "last_fetch": row[1]}
            return None
        except Exception as e:
            print(f"Error checking history freshness for {symbol}: {e}")
            return None

    def clear_all(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM stock_cache")
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error clearing database: {e}")
            return False


stock_db = StockDatabase()
