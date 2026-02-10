import sqlite3
import os
from datetime import datetime

class StockDatabase:
    def __init__(self, db_path=None):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gravion.db')
        self.db_path = db_path
        self._initialize_db()

    def _initialize_db(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS stock_cache (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT UNIQUE,
                    name TEXT,
                    price REAL,
                    volume INTEGER,
                    change_percent REAL DEFAULT 0.0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()
            conn.close()
            print(f"Database initialized at {self.db_path}")
        except Exception as e:
            print(f"Error initializing database: {e}")

    def save_stock_data(self, symbol, name, price, volume, change_percent=0.0):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO stock_cache (symbol, name, price, volume, change_percent, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (symbol, name, price, volume, change_percent, datetime.now().isoformat()))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error saving stock data: {e}")
            return False

    def get_stock_data(self, symbol):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT symbol, name, price, volume, change_percent, timestamp
                FROM stock_cache
                WHERE symbol = ?
                ORDER BY timestamp DESC
                LIMIT 1
            ''', (symbol,))
            row = cursor.fetchone()
            conn.close()
            if row:
                return dict(row)
            return None
        except Exception as e:
            print(f"Error retrieving stock data: {e}")
            return None

    def get_all_stocks(self):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('''
                SELECT symbol, name, price, volume, change_percent, timestamp
                FROM stock_cache
                ORDER BY timestamp DESC
            ''')
            rows = cursor.fetchall()
            conn.close()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error retrieving all stocks: {e}")
            return []

    def clear_all(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('DELETE FROM stock_cache')
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"Error clearing database: {e}")
            return False


stock_db = StockDatabase()
