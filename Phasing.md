# Product Roadmap (Phasing)

| **Project Name** | **Gravion** |
| :--- | :--- |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | February 9, 2026 |
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
* [ ] App opens without errors.
* [ ] Click "Scan" -> Backend calls Moomoo -> Gets AAPL $200 -> Saves to DB -> UI updates table to show AAPL $200.

---

## Phase 2: The "Batch Scanner" MVP (Weeks 3-4)
**Goal:** Scale the pipeline from 1 stock to 100 stocks and inject the mathematical "brains" (Algorithms).

### 2.1 Universe Expansion
* **Feature:** Remove the hardcoded `US.AAPL`.
* **Feature:** Implement `get_plate_stock('US.NDX')` to fetch the full NASDAQ 100 list.
* **Logic:** Implement the "Loop" to iterate through all 100 stocks (with 0.5s throttling to prevent API bans).

### 2.2 The Analysis Engine (The Logic)
* **Feature:** Implement the `calculate_technicals` function.
    * Compute **50MA** and **100MA**.
    * Compare: Is `Price > 50MA`?
* **Feature:** Implement the `calculate_fundamentals` function.
    * Fetch Quarterly Financials.
    * Compute **YoY Growth %**.

### 2.3 UI Integration
* **Feature:** The Data Grid now renders 100 rows.
* **Feature:** Columns "Signal" and "Growth" are populated with real calculated data.
* **Feature:** Sorting works (e.g., click "Growth" header to see top stocks).

### 2.4 Success Criteria (Phase 2)
* [ ] User can click "Run Scan" and wait ~60 seconds for a full NASDAQ 100 report.
* [ ] Top 5 "Strong Buy" stocks are correctly identified and sorted at the top.

---

## Phase 3: Visualization & Insight (Weeks 5-6)
**Goal:** Give the user the tools to *verify* the signal visually.

### 3.1 Chart Integration
* **Feature:** Integrate `lightweight-charts`.
* **Interaction:** Clicking a row in the grid opens the chart for that specific stock.
* **Overlay:** Draw the **50MA (Blue line)** and **100MA (Orange line)** on the chart so the user can visually confirm the "Golden Cross" or trend.

### 3.2 Detail Inspector (Right Sidebar)
* **Feature:** Populate the "Right Sidebar" (Zone D) with deep-dive data.
* **Data:** Show PE Ratio, Market Cap, and Next Earnings Date.

### 3.3 Export
* **Feature:** "Export to CSV" button to save the daily results for offline record-keeping.

---

## Phase 4: The "AI Agent" Evolution (Future)
**Goal:** Transition from a "Tool" (Passive) to an "Agent" (Active).

### 4.1 Autonomous Scheduling
* **Feature:** The Agent runs automatically at 9:00 AM EST (Pre-market) without user clicking "Run".
* **Output:** Sends a desktop notification: *"Market Open: 3 New Buy Signals found for NVDA, AMD, MSFT."*

### 4.2 Natural Language Query (Optional)
* **Feature:** Add a search bar that accepts text: *"Show me stocks with > 50% growth above 50MA."*
* **Tech:** LLM integration to translate text into SQL queries for the local database.

### 4.3 Paper Trading (Execution)
* **Feature:** Connect the "Buy" signal to Moomoo's **Paper Trading** environment.
* **Action:** Agent places limit orders automatically for high-confidence setups.