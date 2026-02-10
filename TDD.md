# Technical Design Document (TDD)

| **Project Name** | **Gravion** |
| :--- | :--- |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | February 9, 2026 |
| **Author** | Lead Architect |

---

## 1. System Overview

**Gravion** is a hybrid desktop application combining a modern web-based frontend (Electron/React) with a powerful Python-based quantitative analysis engine.

The system follows a **Client-Server Architecture** running locally on the user's machine:
1.  **Frontend:** An Electron shell hosting a React SPA (Single Page Application).
2.  **Backend:** A Python process (FastAPI) spawned by Electron, managing data logic.
3.  **Data Gateway:** **Moomoo OpenD** (External Application) acting as the bridge to the stock exchange.

### High-Level Architecture Diagram

```
[ User Interface ]     [ Local Logic Layer ]     [ Data Gateway ]     [ Exchange ]
+----------------+     +-------------------+     +--------------+     +----------+
| Electron App   | <--> | Python Backend    | <--> | Moomoo OpenD | <--> | Moomoo   |
| (React + Node) | HTTP | (FastAPI)         | TCP  | (Server)     | SSL  | Servers  |
+----------------+ JSON +-------------------+      +--------------+      +----------+
                         |
                         +-------------------+
                         | SQLite DB         |
                         | (Cache)           |
                         +-------------------+
```

---

## 2. Technology Stack

### 2.1 Frontend (The "Shell")
* **Framework:** Electron (latest stable)
* **UI Library:** React 18+ (TypeScript)
* **Build Tool:** Vite
* **Styling:** Tailwind CSS (Shadcn/ui components)
* **Charting:** `lightweight-charts` (TradingView)
* **State Management:** Zustand or React Query
* **HTTP Client:** Axios

### 2.2 Backend (The "Engine")
* **Runtime:** Python 3.10+
* **Web Framework:** FastAPI (Uvicorn server)
* **API Wrapper:** `moomoo-api` (Official Futu/Moomoo SDK)
* **Data Analysis:** `pandas`, `numpy`
* **Technical Analysis:** `TA-Lib` or `pandas_ta`
* **Database:** `sqlite3` (via `SQLAlchemy` or raw SQL)

### 2.3 Environment
* **OS:** Windows 10/11 or macOS.
* **External Dependency:** Moomoo OpenD Client (Must be installed and running on port `11111`).

---

## 3. Module Design

### 3.1 Frontend-Backend Communication
* **Startup:** When Electron starts, it spawns a child process executing `main.py` (the FastAPI server).
* **Protocol:** Electron makes HTTP REST requests to `http://localhost:8000`.
* **Heartbeat:** Electron polls `/health` every 5 seconds to ensure the Python backend is alive.

### 3.2 The "Universe Adapter" Pattern
To support future extensibility (NASDAQ 100 -> HK HSI -> Crypto), the backend will implement an Adapter Pattern.

```python
# Pseudo-code Structure
class MarketAdapter(ABC):
    @abstractmethod
    def get_tickers(self): pass

    @abstractmethod
    def get_historical_data(self, ticker): pass

class MoomooUSAdapter(MarketAdapter):
    def get_tickers(self): 
        return ctx.get_plate_stock('BK.US.NDX')

class CustomCSVAdapter(MarketAdapter):
    def get_tickers(self):
        return pd.read_csv('watchlist.csv')
```

### 3.3 Data Caching Strategy
To avoid hitting Moomoo API Rate Limits (approx 10-20 requests/sec for quotes):
1. **Check DB:** When analysis starts, check sqlite.ohlc_table for data < 24 hours old.
2. **Fetch API:** If stale or missing, call ctx.get_history_kline.
3. **Write Back:** Save fresh data to SQLite.

---

## 4. Database Schema (SQLite)

The database gravion.db will reside in the user's AppData folder.

### 4.1 Table: universes
Stores supported markets.
| Column | Type | Description |
| :--- | :--- | :--- |
| id | TEXT (PK) | e.g., 'us_ndx' |
| name | TEXT | Display name |
| plate_code | TEXT | Moomoo plate ID |

### 4.2 Table: stock_cache
Stores daily OHLC data to speed up backtesting/scanning.
| Column | Type | Description |
| :--- | :--- | :--- |
| ticker | TEXT | e.g., 'NVDA' |
| date | TEXT | ISO Format '2026-02-09' |
| close | REAL | Adjusted Close |
| ma_50 | REAL | Pre-calculated MA |
| ma_100 | REAL | Pre-calculated MA |
| last_updated | DATETIME | Timestamp |

---

## 5. API Specification (Internal)

### 5.1 System Health
**GET /api/status**

Response:
```json
{ "backend": "online", "moomoo_opend": "connected" }
```

### 5.2 Screening
**POST /api/scan**

Body:
```json
{
  "universe": "us_ndx",
  "strategy": "ma_crossover",
  "filters": { "min_yoy_growth": 0.2 }
}
```

Response: (Returns Job ID immediately, scan runs async)
```json
{ "job_id": "scan_123" }
```

**GET /api/scan/{job_id}/results**

Response:
```json
[
  {
    "ticker": "NVDA",
    "price": 188.50,
    "signal": "STRONG_BUY",
    "yoy_growth": 1.25,
    "ma_50": 180.00,
    "ma_100": 170.00
  },
  ...
]
```

### 5.3 Chart Data
**GET /api/history/{ticker}**

Response: JSON array compatible with Lightweight Charts.
```json
[
    { "time": "2026-02-01", "value": 150.00 },
    { "time": "2026-02-02", "value": 155.00 }
]
```

---

## 6. Development Setup

### 6.1 Prerequisites
* Node.js (v18+)
* Python (v3.10+)
* Moomoo OpenD: Download from Moomoo website and log in. Enable "Open API" on port 11111.

### 6.2 Installation Steps
1. **Clone Repo:**
   ```bash
   git clone repo/gravion.git
   ```

2. **Backend Setup:**
   ```bash
   cd backend
   python -m venv venv
   pip install fastapi uvicorn moomoo-api pandas numpy
   ```

3. **Frontend Setup:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```



