import sqlite3
import os
from datetime import datetime

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

            # Phase 7: Financial statements cache (quarterly income data)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS financial_statements (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol          TEXT NOT NULL,
                    end_date        TEXT NOT NULL,
                    ann_date        TEXT,
                    total_revenue   REAL,
                    revenue         REAL,
                    total_profit    REAL,
                    n_income        REAL,
                    n_income_attr_p REAL,
                    operate_profit  REAL,
                    total_cogs      REAL,
                    oper_cost       REAL,
                    income_tax      REAL,
                    basic_eps       REAL,
                    diluted_eps     REAL,
                    fetched_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(symbol, end_date)
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_fs_symbol_date
                ON financial_statements(symbol, end_date)
            """)

            # Phase 5: App settings
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME
                )
            """)

            # Phase 5: Portfolios
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS portfolios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    is_system INTEGER DEFAULT 0,
                    created_at DATETIME
                )
            """)

            # Phase 5: Portfolio symbols
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_symbols (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    portfolio_id INTEGER NOT NULL,
                    symbol TEXT NOT NULL,
                    UNIQUE(portfolio_id, symbol),
                    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
                )
            """)

            conn.commit()

            # Seed default settings (idempotent)
            for key, value in [
                ("data_source", "yahoo_finance"),
                ("global_start_date", ""),
                ("global_end_date", ""),
            ]:
                cursor.execute(
                    "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
                    (key, value, datetime.now().isoformat()),
                )

            # Seed NASDAQ 100 system portfolio (idempotent)
            cursor.execute("SELECT id FROM portfolios WHERE name = 'NASDAQ 100'")
            row = cursor.fetchone()
            if row is None:
                cursor.execute(
                    "INSERT INTO portfolios (name, is_system, created_at) VALUES (?, 1, ?)",
                    ("NASDAQ 100", datetime.now().isoformat()),
                )
                portfolio_id = cursor.lastrowid
                cursor.executemany(
                    "INSERT OR IGNORE INTO portfolio_symbols (portfolio_id, symbol) VALUES (?, ?)",
                    [(portfolio_id, sym) for sym in NASDAQ_100_SYMBOLS],
                )

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

    def get_stock_history_range(self, symbol, start_date, end_date):
        """Return historical OHLC data filtered by date range, ordered by date ASC."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT date, open, high, low, close, volume
                FROM stock_history
                WHERE symbol = ? AND date BETWEEN ? AND ?
                ORDER BY date ASC
                """,
                (symbol, start_date, end_date),
            )
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error retrieving stock history range for {symbol}: {e}")
            return []

    def get_history_min_max(self, symbol):
        """Return (min_date, max_date) of cached history as ISO strings, or (None, None) if empty."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT MIN(date), MAX(date) FROM stock_history WHERE symbol = ?",
                (symbol,),
            )
            row = cursor.fetchone()
            conn.close()
            if row and row[0]:
                return row[0], row[1]
            return None, None
        except Exception as e:
            print(f"Error getting history min/max for {symbol}: {e}")
            return None, None

    def has_history_coverage(self, symbol, start_date, end_date):
        """Check if stored history spans the requested date range (MIN <= start AND MAX >= end)."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT MIN(date) as min_date, MAX(date) as max_date FROM stock_history WHERE symbol = ?",
                (symbol,),
            )
            row = cursor.fetchone()
            conn.close()
            if row and row[0] and row[1]:
                return row[0] <= start_date and row[1] >= end_date
            return False
        except Exception as e:
            print(f"Error checking history coverage for {symbol}: {e}")
            return False

    # ── Settings methods ──

    def get_setting(self, key):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM app_settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            conn.close()
            return row[0] if row else None
        except Exception as e:
            print(f"Error getting setting {key}: {e}")
            return None

    def set_setting(self, key, value):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
                (key, value, datetime.now().isoformat()),
            )
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error setting {key}: {e}")
            return False

    def get_all_settings(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM app_settings")
            rows = cursor.fetchall()
            conn.close()
            return {row[0]: row[1] for row in rows}
        except Exception as e:
            print(f"Error getting all settings: {e}")
            return {}

    # ── Portfolio methods ──

    def get_all_portfolios(self):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT p.id, p.name, p.is_system, p.created_at,
                       COUNT(ps.id) as symbol_count
                FROM portfolios p
                LEFT JOIN portfolio_symbols ps ON p.id = ps.portfolio_id
                GROUP BY p.id
                ORDER BY p.is_system DESC, p.name ASC
            """)
            rows = cursor.fetchall()
            conn.close()
            return [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "is_system": bool(row["is_system"]),
                    "symbol_count": row["symbol_count"],
                }
                for row in rows
            ]
        except Exception as e:
            print(f"Error getting portfolios: {e}")
            return []

    def get_portfolio(self, portfolio_id):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, is_system, created_at FROM portfolios WHERE id = ?", (portfolio_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return None
            cursor.execute(
                "SELECT symbol FROM portfolio_symbols WHERE portfolio_id = ? ORDER BY symbol ASC",
                (portfolio_id,),
            )
            symbols = [r["symbol"] for r in cursor.fetchall()]
            conn.close()
            return {
                "id": row["id"],
                "name": row["name"],
                "is_system": bool(row["is_system"]),
                "symbols": symbols,
                "symbol_count": len(symbols),
            }
        except Exception as e:
            print(f"Error getting portfolio {portfolio_id}: {e}")
            return None

    def create_portfolio(self, name):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO portfolios (name, is_system, created_at) VALUES (?, 0, ?)",
                (name, datetime.now().isoformat()),
            )
            conn.commit()
            new_id = cursor.lastrowid
            conn.close()
            return new_id
        except sqlite3.IntegrityError:
            return None
        except Exception as e:
            print(f"Error creating portfolio: {e}")
            return None

    def delete_portfolio(self, portfolio_id):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT is_system FROM portfolios WHERE id = ?", (portfolio_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return False
            if row[0] == 1:
                conn.close()
                return False  # Cannot delete system portfolio
            cursor.execute("DELETE FROM portfolio_symbols WHERE portfolio_id = ?", (portfolio_id,))
            cursor.execute("DELETE FROM portfolios WHERE id = ?", (portfolio_id,))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error deleting portfolio {portfolio_id}: {e}")
            return False

    def set_portfolio_symbols(self, portfolio_id, symbols):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT is_system FROM portfolios WHERE id = ?", (portfolio_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return False
            if row[0] == 1:
                conn.close()
                return False  # Cannot modify system portfolio
            cursor.execute("DELETE FROM portfolio_symbols WHERE portfolio_id = ?", (portfolio_id,))
            cursor.executemany(
                "INSERT OR IGNORE INTO portfolio_symbols (portfolio_id, symbol) VALUES (?, ?)",
                [(portfolio_id, sym.upper()) for sym in symbols],
            )
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error setting portfolio symbols: {e}")
            return False

    def add_portfolio_symbols(self, portfolio_id, symbols):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT is_system FROM portfolios WHERE id = ?", (portfolio_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return False
            if row[0] == 1:
                conn.close()
                return False
            cursor.executemany(
                "INSERT OR IGNORE INTO portfolio_symbols (portfolio_id, symbol) VALUES (?, ?)",
                [(portfolio_id, sym.upper()) for sym in symbols],
            )
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error adding portfolio symbols: {e}")
            return False

    def remove_portfolio_symbol(self, portfolio_id, symbol):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT is_system FROM portfolios WHERE id = ?", (portfolio_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return False
            if row[0] == 1:
                conn.close()
                return False
            cursor.execute(
                "DELETE FROM portfolio_symbols WHERE portfolio_id = ? AND symbol = ?",
                (portfolio_id, symbol.upper()),
            )
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error removing portfolio symbol: {e}")
            return False

    def get_portfolio_symbols(self, portfolio_id):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT symbol FROM portfolio_symbols WHERE portfolio_id = ? ORDER BY symbol ASC",
                (portfolio_id,),
            )
            symbols = [row[0] for row in cursor.fetchall()]
            conn.close()
            return symbols
        except Exception as e:
            print(f"Error getting portfolio symbols: {e}")
            return []

    def get_stocks_by_symbols(self, symbols):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            placeholders = ",".join("?" for _ in symbols)
            cursor.execute(
                f"""
                SELECT symbol, name, price, open, high, low, close, volume,
                       change_percent, last_fetched, timestamp
                FROM stock_cache
                WHERE symbol IN ({placeholders})
                ORDER BY symbol ASC
                """,
                symbols,
            )
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error getting stocks by symbols: {e}")
            return []

    # ── Financial statements methods ──

    def save_financial_statements(self, symbol: str, rows: list[dict]) -> int:
        """Upsert quarterly income statement records. Returns count saved."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.executemany(
                """
                INSERT OR REPLACE INTO financial_statements
                    (symbol, end_date, ann_date, total_revenue, revenue, total_profit,
                     n_income, n_income_attr_p, operate_profit, total_cogs, oper_cost,
                     income_tax, basic_eps, diluted_eps, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        symbol,
                        r.get("end_date"),
                        r.get("ann_date"),
                        r.get("total_revenue"),
                        r.get("revenue"),
                        r.get("total_profit"),
                        r.get("n_income"),
                        r.get("n_income_attr_p"),
                        r.get("operate_profit"),
                        r.get("total_cogs"),
                        r.get("oper_cost"),
                        r.get("income_tax"),
                        r.get("basic_eps"),
                        r.get("diluted_eps"),
                        datetime.now().isoformat(),
                    )
                    for r in rows
                ],
            )
            conn.commit()
            conn.close()
            return len(rows)
        except Exception as e:
            print(f"Error saving financial statements for {symbol}: {e}")
            return 0

    def get_financial_statements(self, symbol: str,
                                  start_date: str | None = None,
                                  end_date: str | None = None) -> list[dict]:
        """Return financial statement rows ordered by end_date ASC. Dates in YYYYMMDD format."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            if start_date and end_date:
                cursor.execute(
                    """
                    SELECT end_date, ann_date, total_revenue, revenue, total_profit,
                           n_income, n_income_attr_p, operate_profit, total_cogs,
                           oper_cost, income_tax, basic_eps, diluted_eps
                    FROM financial_statements
                    WHERE symbol = ? AND end_date BETWEEN ? AND ?
                    ORDER BY end_date ASC
                    """,
                    (symbol, start_date, end_date),
                )
            else:
                cursor.execute(
                    """
                    SELECT end_date, ann_date, total_revenue, revenue, total_profit,
                           n_income, n_income_attr_p, operate_profit, total_cogs,
                           oper_cost, income_tax, basic_eps, diluted_eps
                    FROM financial_statements
                    WHERE symbol = ?
                    ORDER BY end_date ASC
                    """,
                    (symbol,),
                )
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error getting financial statements for {symbol}: {e}")
            return []

    def get_financials_freshness(self, symbol: str) -> dict | None:
        """Return {max_end_date, fetched_at} for the most recent cached statement."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT MAX(end_date), MAX(fetched_at) FROM financial_statements WHERE symbol = ?",
                (symbol,),
            )
            row = cursor.fetchone()
            conn.close()
            if row and row[0]:
                return {"max_end_date": row[0], "fetched_at": row[1]}
            return None
        except Exception as e:
            print(f"Error getting financials freshness for {symbol}: {e}")
            return None

    def has_fresh_financials(self, symbol: str, max_age_days: int = 90) -> bool:
        """Return True if financial statements were fetched within max_age_days."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT 1 FROM financial_statements
                WHERE symbol = ?
                  AND julianday('now') - julianday(fetched_at) <= ?
                LIMIT 1
                """,
                (symbol, max_age_days),
            )
            row = cursor.fetchone()
            conn.close()
            return row is not None
        except Exception as e:
            print(f"Error checking financials freshness for {symbol}: {e}")
            return False

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
