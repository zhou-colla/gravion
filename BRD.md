# Business Requirements Document (BRD)

| **Project Name** | **Gravion** |
| :--- | :--- |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | February 9, 2026 |
| **Author** | Product Manager |

---

## 1. Executive Summary

**Gravion** is a desktop-based quantitative analysis terminal designed to bridge the gap between standard retail trading platforms (like the Moomoo App) and professional algorithmic software.

While Moomoo provides excellent execution and basic screeners, it lacks the ability to layer **custom logic** (e.g., combining specific Moving Average crossovers with real-time Fundamental Growth metrics). Gravion solves this by providing a modern, "TradingView-style" interface powered by a Python backend that interacts directly with the Moomoo OpenD API. The goal is to deliver a "Glass-Box" stock picker that offers transparency, speed, and algorithmic precision for the semi-professional trader.

---

## 2. Project Objectives

1.  **Automated Screening:** Eliminate manual chart checking by automatically scanning the NASDAQ 100 (and extensible universes) for specific technical and fundamental setups.
2.  **Hybrid Analysis:** Successfully combine Technical Analysis (Price Action, MA) with Fundamental Data (Revenue/Profit Growth) in a single view.
3.  **Modern UX:** Provide a distraction-free, high-performance UI (Electron/React) that mimics professional terminals like Bloomberg or TradingView, superior to standard Python GUI frameworks.
4.  **Extensibility:** Build a modular architecture that allows for easy addition of new markets (HK/CN), assets, and strategies in the future.

---

## 3. Target Audience

* **Primary:** "Semi-Professional" Retail Traders who use Moomoo as their broker but require more advanced filtering than the mobile app allows.
* **Secondary:** Quant Developers looking for a clean UI wrapper for their Python scripts.

---

## 4. Scope of Work (MVP - Phase 1)

### 4.1 In-Scope (Must Have)
* **Desktop Application:** Cross-platform build (Windows/macOS) using **Electron** & **React**.
* **Market Connectivity:** Integration with **Moomoo OpenD** via Python API for real-time and historical data.
* **Dynamic Universe:** Ability to fetch and update the **NASDAQ 100** constituent list automatically.
* **The "Gravion Core" Strategy:**
    * **Technical:** Calculate 50-day and 100-day Moving Averages (MA). Identify crossovers and trend alignment.
    * **Fundamental:** Fetch Financial Reports to calculate YoY Net Income Growth.
* **Data Visualization:** A sortable, filterable Results Grid displaying Ticker, Price, Trend Status, and Growth Metrics.
* **Basic Charting:** Integration of `lightweight-charts` to visualize the selected stock with MA overlays.

### 4.2 Out-of-Scope (For Phase 2 or later)
* **Automated Trade Execution:** Phase 1 is for *analysis only*. No buy/sell orders will be sent to the broker initially.
* **Complex Derivatives:** Options, Futures, and Forex are excluded from MVP.
* **User Accounts/Cloud Sync:** The app will run locally; no server-side user database is required.
* **Social Features:** No chat or community sharing features.

---

## 5. Functional Requirements (The "What")

### 5.1 System Architecture
* **FR-01:** The system shall use a **Python Backend** for all data processing, mathematical calculations, and API communication.
* **FR-02:** The system shall use an **Electron/React Frontend** for the user interface.
* **FR-03:** The system shall communicate between Frontend and Backend via REST API (FastAPI) or IPC.

### 5.2 Market Data & Universe
* **FR-04:** The system shall allow the user to select a "Target Universe" (Default: NASDAQ 100).
* **FR-05:** The system shall support "Plug-and-Play" extension for future universes (e.g., HK HSI, Custom CSV Watchlists).
* **FR-06:** The system must cache historical data locally (SQLite) to minimize API calls and avoid Rate Limiting.

### 5.3 Analysis Engine
* **FR-07 (Technical):** The system must calculate SMA (Simple Moving Average) for user-defined periods (Default: 50, 100).
* **FR-08 (Signal):** The system must generate a "Bullish" signal if `Price > 50MA` AND `50MA > 100MA`.
* **FR-09 (Fundamental):** The system must fetch the latest Annual or Quarterly financial report and calculate YoY Growth %.

### 5.4 User Interface (UI)
* **FR-10 (Dashboard):** A "Command Center" view showing the status of Moomoo connectivity and a summary of the latest scan.
* **FR-11 (Results Grid):** A TradingView-style table. Columns must include: Ticker, Price, Chg%, Tech Signal (Buy/Sell/Neutral), Fundamental Score, and Volume.
* **FR-12 (Detail View):** Clicking a row must open a side panel or modal showing a mini-chart and key stats.
* **FR-13 (Theme):** The UI must strictly follow the "Professional Dark Mode" aesthetic (Matte colors, no neon, high contrast text).

---

## 6. Non-Functional Requirements (The "How Well")

* **NFR-01 (Performance):** The application should launch and be ready to scan within 5 seconds.
* **NFR-02 (Latency):** A full scan of 100 stocks (NASDAQ 100) should complete within 60 seconds (subject to API rate limits).
* **NFR-03 (Reliability):** The system must handle Moomoo OpenD disconnections gracefully (e.g., auto-reconnect attempts or clear error messages).
* **NFR-04 (Usability):** The UI must be responsive and scalable to different window sizes.

---

## 7. Risks & Constraints

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Moomoo API Rate Limits** | High | Implement strict throttling (`time.sleep`) and local data caching. |
| **Data Cost** | Medium | User must have a valid Moomoo market data subscription (Level 1/2) for real-time data. |
| **Accuracy of Fundamentals** | Medium | Moomoo's financial data can sometimes be delayed. Implement a "Data Date" check to warn users of old data. |
| **Calculation Discrepancy** | Low | Different platforms calculate MA differently (e.g., handling holidays). Allow users to adjust calculation methods. |

---

## 8. Success Metrics (KPIs)

* **System Stability:** User can run 5 consecutive scans without a crash or API error.
* **Signal Accuracy:** The computed 50MA matches Moomoo's native chart 50MA within a 0.1% margin of error.
* **User Efficiency:** A user can identify "Top 5 Growth Stocks in Uptrend" within 3 clicks.

---

## 9. Sign-off

| Role | Name | Date | Signature |
| :--- | :--- | :--- | :--- |
| **Project Sponsor** | | | |
| **Product Manager** | | | |
| **Lead Developer** | | | |