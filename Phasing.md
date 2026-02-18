# Product Roadmap (Phasing)

| **Project Name** | **Gravion** |
| :--- | :--- |
| **Version** | 1.3 |
| **Status** | Phase 3 Complete |
| **Date** | February 10, 2026 |
| **Strategy** | "Steel Thread" Development (End-to-End Prototype First) |

---

## Phase 1: The "Steel Thread" Prototype (Weeks 1-2)
**Goal:** A functional "Skeleton" application. It looks like the final product but processes only one stock (`US.AAPL`) to prove the data pipeline and local storage work.

### 1.1 Infrastructure & UI Shell
* **Deliverable:** Electron/React app running with the "Professional Dark" UI layout (Header, Sidebar, Empty Grid).
* **Feature:** Application launches and connects to the Python backend (`localhost:8000`).
* **UI:** Static buttons ("Run Scan") are clickable but hardcoded to trigger the single-stock test.

### 1.2 Moomoo Connectivity (The Pipe)
* **Deliverable:** Python script that successfully connects to Moomoo OpenD (`127.0.0.1:11111`).
* **Feature:** Hardcoded fetch for **one stock** (e.g., Apple/`US.AAPL`).
* **Data:** Fetch current *Price*, *Volume*, and *Name*. (No Moving Averages or YoY calculations yet).

### 1.3 Local Storage System (The Memory)
* **Deliverable:** SQLite database (`gravion.db`) created automatically on app launch.
* **Feature:**
    1.  **Save:** When data is fetched from Moomoo, it is immediately written to the `stock_cache` table.
    2.  **Load:** The UI reads from the *Database*, not directly from the API response (this proves the storage architecture).

### 1.4 Success Criteria (Phase 1)
* [x] App opens without errors.
* [x] Click "Scan" -> Backend calls yfinance -> Gets AAPL price -> Saves to DB -> UI updates table.

> **Note (Updated Feb 2026):** Phase 1 was implemented using **yfinance** instead of Moomoo OpenD.
> The Moomoo dependency was removed to avoid requiring an external desktop daemon.
> yfinance provides the same OHLC data pipeline. See `PHASE1_REPORT.md` for details.

---

## Phase 2: The "Batch Scanner" MVP (Weeks 3-4)
**Goal:** Scale from 1 stock to NASDAQ 100, decouple Fetch from Screen, redesign UI.

### 2.1 Architecture: Fetch/Screen Decoupling
* **Design Decision:** Separate "data acquisition" from "data screening" into two independent operations.
* **Fetch (`POST /api/fetch`):** Pulls fresh OHLC data from yfinance for all NASDAQ 100 symbols using `yf.download()` batch call. Saves to SQLite with `last_fetched` timestamp.
* **Screen (`POST /api/screen`):** Reads from SQLite only. Applies signal logic. Returns results to UI.
* **UI Toggle:** "Realtime Fetch" switch controls whether a scan includes a fresh fetch or uses cached data only.

### 2.2 Universe Expansion
* **Feature:** Hardcoded NASDAQ 100 symbol list (~100 tickers).
* **Feature:** `yf.download(symbols, period="2d", threads=True)` fetches all stocks in a single batch HTTP call.
* **Data Source:** Yahoo Finance via `yfinance` library (Moomoo dependency removed).
* **Performance:** Batch download completes in ~5-8 seconds for 100 symbols.

### 2.3 Signal Engine (Placeholder)
* **Feature:** Basic signal computation based on daily change percent.
* **Signals:** `STRONG BUY` (>+2%), `BUY` (>+0.5%), `NEUTRAL`, `SELL` (>-0.5%), `STRONG SELL` (>-2%).
* **Note:** Full 50MA/100MA crossover signals require historical data accumulation (Phase 2.2 follow-up).

### 2.4 UI Redesign
* **Header:** "Gravion v1.2" branding, NASDAQ 100 universe selector, Realtime Fetch toggle, Run Scanner button.
* **Layout:** Right sidebar removed. Simpler 2-column layout (icon sidebar + main content).
* **Table Columns:** Ticker, Price, Chg %, **Data Time** (new), **Signal Status** (new), YoY Growth.
* **Data Time:** Shows `HH:MM:SS` for recent fetch, "Yesterday" for stale data. Green pulsing dot for realtime.
* **Footer:** Backend status, database file info, auto-scan status.

### 2.5 Database Schema
* **Table:** `stock_cache` with columns: symbol (UNIQUE), name, price, open, high, low, close, volume, change_percent, last_fetched, timestamp.
* **Migration:** `ALTER TABLE ADD COLUMN` with try/except for safe upgrades from Phase 1.

### 2.6 Success Criteria (Phase 2)
* [x] Fetch 100 stocks in a single yfinance batch call (< 10 seconds).
* [x] Screen results display in grid with Data Time and Signal columns.
* [x] Toggle OFF: Screen uses only cached DB data (no yfinance call).
* [x] Toggle ON: Fresh fetch then screen.
* [x] Database persists between sessions.

---

## Phase 3: Visualization & Insight (Weeks 5-6)
**Goal:** Give the user the tools to *verify* the signal visually.

### 3.1 Chart Integration
* **Feature:** Integrated `lightweight-charts` v4 (TradingView open-source charting library).
* **Interaction:** Clicking any row in the data grid opens an interactive candlestick chart for that stock.
* **Data:** 6 months of daily OHLC data fetched via `yf.download(symbol, period="6mo")`.
* **Overlay:** **50MA (Blue #2962FF)** and **100MA (Orange #F6A90E)** computed from closing prices and drawn as line series overlays.
* **Chart Features:** Dark theme matching TradingView palette, crosshair, responsive resize via ResizeObserver.
* **Caching:** Historical data stored in `stock_history` table. Re-fetched only if cache is stale (not fetched today).
* **Endpoint:** `GET /api/stock/{symbol}/detail` returns OHLC, MA50, MA100, volume series, and fundamentals in a single response.

### 3.2 Detail Inspector (Right Sidebar)
* **Feature:** 280px right sidebar appears when a stock is selected.
* **Fundamentals:** PE Ratio, Market Cap (formatted as $xT/$xB), Next Earnings Date, Sector.
* **Price Statistics:** 52-Week High (green), 52-Week Low (red), Current Price.
* **Visual:** 52-week range progress bar showing current price position.
* **States:** Loading (skeleton shimmer), Empty ("Select a stock to view details"), Populated.
* **Data Source:** `yf.Ticker(symbol).info` for fundamentals, fetched alongside chart data.

### 3.3 Export
* **Feature:** "Export CSV" button in the filter bar (next to source label).
* **Implementation:** Pure frontend CSV generation from the stocks array. Downloads as `gravion_scan_YYYYMMDD_HHmmss.csv`.
* **Backend:** Also available via `GET /api/export` endpoint returning CSV with Content-Disposition header.

### 3.4 Frontend Architecture
* **Component Decomposition:** App.tsx decomposed into 4 components:
    * `DataGrid.tsx` — Table with row selection highlighting and click handler.
    * `ChartPanel.tsx` — Candlestick chart with MA overlays using lightweight-charts.
    * `DetailInspector.tsx` — Right sidebar with fundamentals and price statistics.
    * `ExportButton.tsx` — CSV export button.
* **Shared Types:** `types/stock.ts` — `StockRow`, `DbInfo`, `StockDetail`, `OhlcDataPoint`, `LineDataPoint`, `Fundamentals`.
* **AbortController:** Rapid stock switching cancels in-flight requests to prevent stale data display.

### 3.5 Database Schema (Addition)
* **New Table:** `stock_history` with columns: id, symbol, date (UNIQUE together), open, high, low, close, volume, fetched_at.
* **Index:** `idx_history_symbol_date` on (symbol, date) for fast lookups.
* **Methods:** `save_stock_history()`, `get_stock_history()`, `get_history_freshness()`.

### 3.6 Layout (When Stock Selected)
```
┌──────────────────────────────────────────────────────┐
│ HEADER: Gravion v1.3 | NASDAQ 100 | Toggle | Button  │
├──┬───────────────────────────────────────┬───────────┤
│  │ Filter Bar + Export CSV                │           │
│  ├───────────────────────────────────────┤  Detail   │
│  │ Chart Panel (45%) with candlesticks   │ Inspector │
│S │ + 50MA (blue) + 100MA (orange)        │  (280px)  │
│  │───────────────────────────────────────│           │
│  │ Data Grid (55%, scrollable)            │ PE, MCap  │
│  ├───────────────────────────────────────┤ Earnings  │
│  │ Footer                                 │ 52W Range │
└──┴───────────────────────────────────────┴───────────┘
```

### 3.7 Success Criteria (Phase 3)
* [x] `GET /api/stock/AAPL/detail` returns ohlc (127 rows), ma50 (78 rows), ma100 (28 rows), fundamentals.
* [x] Frontend builds with 0 TypeScript errors and 0 Vite errors.
* [x] Clicking a row opens candlestick chart with 50MA (blue) and 100MA (orange) overlays.
* [x] Right sidebar shows PE Ratio, Market Cap, Earnings Date, Sector, 52W range.
* [x] Export CSV button downloads .csv file with all stock data.
* [x] Close button (X) collapses chart + sidebar back to Phase 2 layout.
* [x] AbortController cancels in-flight requests when rapidly switching stocks.
* [x] `stock_history` table caches 6 months of OHLC data per symbol.

> **Note (Updated Feb 2026):** Version bumped to **1.3.0**. Frontend decomposed into
> component architecture. lightweight-charts v4 integrated for interactive charting.

---

## Phase 4: The "Strategy Engine" (Weeks 7-8)
**Goal:** Transition from fixed logic to a flexible strategy platform with professional-grade verification tools.

### 4.1 Architecture: The "Plugin" Strategy System
* **Concept:** Modular strategy loading.
    * **Built-in:** Configured via UI (stored as JSON).
    * **Custom:** Python scripts loaded from `user_strategies/` (for Quants).
* **Backend:**
    * `StrategyLoader` scans for `.py` files at startup.
    * `BaseStrategy` class ensures all strategies follow the standard input/output format.

### 4.2 UI: The Tabbed Inspector (Sidebar Upgrade)
* **Feature:** **Split the Right Sidebar (Zone D) into Tabs.**
    * **Tab A: Fundamentals:** (Existing) Shows PE, Market Cap, Sector, 52W Range.
    * **Tab B: Backtester:** (New) Dedicated view for strategy simulation results.

### 4.3 The Backtest Engine & Transaction Log
* **Interaction:** User selects a strategy and clicks "Run Backtest" (Play Icon) in the Chart Header.
* **Output (Displayed in "Backtester" Tab):**
    1.  **Performance Summary (Top Card):**
        * **Total Return %** (Green/Red).
        * **Win Rate %**.
        * **Profit Factor** (Gross Win / Gross Loss).
        * **Max Drawdown**.
    2.  **Transaction Log (Trade Ledger):**
        * A scrollable, chronological list of every simulated trade.
        * **Columns:** Date, Type (Buy/Sell), Price, Shares, PnL (Profit/Loss).
        * **Interaction:** Clicking a row in the log highlights that specific candle on the main Chart.

### 4.4 For Light Users: The Visual Builder
* **Feature:** **"No-Code" Strategy Editor**.
* **UI:** Modal with "Condition Blocks" (e.g., `[RSI] < [30]`).
* **Output:** Saves as JSON.

### 4.5 For Quant Users: The Python Sandbox
* **Feature:** **"Code-First" Development**.
* **Workflow:** Drop a `.py` file into `gravion/strategies/`. The app auto-loads it.
* **Power:** Full access to `pandas`, `numpy`, and `talib` for complex logic.

---

## Phase 5: Portfolio Management & Multi-Strategy Comparison (Weeks 9-10)
**Goal:** Enable users to create custom portfolios and compare multiple strategies side-by-side.

### 5.1 Portfolio Management
* **Feature:** Create, rename, and delete custom portfolios.
* **Feature:** Add/remove symbols from portfolios.
* **UI:** Portfolio selector dropdown in the header.
* **Endpoint:** `GET /api/portfolios`, `POST /api/portfolios`, `PUT /api/portfolios/{id}/symbols`.

### 5.2 Multi-Strategy Comparison
* **Feature:** Select multiple strategies for simultaneous evaluation.
* **UI:** Strategy comparison table showing signals from different strategies for each stock.
* **Endpoint:** `POST /api/screen` updated to accept multiple strategy names.

---

## Phase 6: Tushare Data Source Integration (Weeks 11-12)
**Goal:** Add Tushare as a dedicated data source for Chinese and US stock data, with proper API key management and error handling.

### 6.1 Tushare API Integration
* **Deliverable:** Python backend integration with Tushare API using the `tushare` library.
* **Feature:** `POST /api/fetch` endpoint updated to support Tushare as a data source.
* **Data Source:** Tushare API for Chinese and US stock data.
* **API Key Management:** Secure storage of Tushare API key in the database.

### 6.2 Pagination & Rate Limit Handling
* **Feature:** Pagination implementation to handle Tushare's 6000 record limit per request.
* **Performance:** Efficient batch processing of stock data with proper rate limit handling.
* **Error Handling:** Clear error messages for API key issues and rate limit exceeded errors.

### 6.3 UI Updates for Tushare
* **Feature:** Tushare added to the data source dropdown menu in settings.
* **UI:** Tushare API key input field in settings page when Tushare is selected.
* **Source Label:** "Tushare" displayed on the screener page when Tushare is the active data source.

### 6.4 Chinese Stock Support
* **Feature:** Ability to fetch and display Chinese stock data using Tushare.
* **Symbol Format:** Support for Tushare's symbol format (e.g., `600519.SH` for Kweichow Moutai).
* **Data Fields:** Fetch current price, volume, name, and other relevant fields for Chinese stocks.

### 6.5 No-Fallback Policy
* **Design Decision:** When Tushare is selected as the data source, no fallback to other data sources.
* **Error Handling:** Clear error messages for symbols that Tushare doesn't have data for.
* **User Experience:** Transparent indication of data source being used with no silent fallbacks.

### 6.6 Database Schema Updates
* **Table:** `app_settings` table updated to store Tushare API key.
* **Methods:** `get_setting()`, `set_setting()` methods updated to handle Tushare API key.

### 6.7 Success Criteria (Phase 6)
* [ ] Tushare API key can be configured in the settings page.
* [ ] Data source can be switched to Tushare in the settings page.
* [ ] `POST /api/fetch` successfully fetches data from Tushare when selected as the data source.
* [ ] `POST /api/screen` displays "Tushare" as the source label when Tushare is selected.
* [ ] No fallback to other data sources when Tushare is selected.
* [ ] Clear error messages for API key issues and rate limit exceeded errors.
* [ ] Chinese stocks can be fetched and displayed using Tushare.
* [ ] Pagination works correctly to handle Tushare's 6000 record limit per request.

> **Note:** Tushare integration requires a valid Tushare API key. Users must sign up for an account at [Tushare.pro](https://tushare.pro/) to obtain an API key.