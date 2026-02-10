# Algorithm Logic Specification (ALS)

| **Project Name** | **Gravion** |
| :--- | :--- |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | February 9, 2026 |
| **Author** | Lead Quant / Architect |

---

## 1. Data Ingestion & Pre-processing

Before any analysis occurs, raw data from the Moomoo API must be normalized to ensure statistical validity.

### 1.1 Price Data Normalization
* **Source:** `ctx.get_history_kline`
* **Adjustment Type:** **Forward Adjusted (AuType.QFQ)**.
    * *Why:* To account for stock splits and dividends. Without this, a 1:4 stock split would look like a 75% price crash, triggering false sell signals.
* **Frequency:** Daily (1D).
* **Data Points Required:** Minimum `N + 20` data points, where `N` is the longest Moving Average period (e.g., 100).
* **Missing Data Handling:**
    * If a stock has $< 100$ days of history (e.g., recent IPO), **Exclude** from scan.
    * If `Volume = 0` (Trading Halt), use the previous day's Close price.

### 1.2 Financial Data Normalization
* **Source:** `ctx.get_stock_financial`
* **Report Type:** Quarterly (Q).
* **Lag Handling:** Financial data is only available after the reporting date. The algorithm must use "Point-in-Time" data to prevent look-ahead bias during backtesting.

---

## 2. Technical Analysis Engine

The core technical strategy is a **Trend Following** system based on Dual Moving Averages.

### 2.1 Indicator Formulas

#### **Simple Moving Average (SMA)**
The arithmetic mean of the closing prices over the last $n$ periods.

$$
SMA_n = \frac{1}{n} \sum_{i=0}^{n-1} P_{close-i}
$$

* **Parameter 1 ($n_1$):** 50 (Fast MA)
* **Parameter 2 ($n_2$):** 100 (Slow MA)

### 2.2 Signal Logic Gates

The system classifies every stock into one of three states:

#### **State A: Strong Bull (The "Buy" Zone)**
All conditions must be TRUE:
1.  **Price Check:** $Price_{close} > SMA_{50}$
2.  **Trend Alignment:** $SMA_{50} > SMA_{100}$
3.  **Momentum Check:** $Price_{close} > Price_{open}$ (Optional: Today is a Green Candle)

#### **State B: Weak/Correction**
Any of the following:
1.  $SMA_{50} > SMA_{100}$ BUT $Price_{close} < SMA_{50}$ (Pullback in an uptrend)

#### **State C: Bearish (The "Ignore" Zone)**
1.  $SMA_{50} < SMA_{100}$ (Downtrend)

---

## 3. Fundamental Analysis Engine

The fundamental engine filters for "High Growth" companies to improve the quality of the technical setup.

### 3.1 Year-Over-Year (YoY) Growth Calculation
We compare the most recent reported quarter ($Q_{current}$) with the same quarter from the previous year ($Q_{last\_year}$).

$$
Growth_{YoY} = \frac{NetIncome(Q_{current}) - NetIncome(Q_{last\_year})}{|NetIncome(Q_{last\_year})|} \times 100
$$

* **Metric:** Net Income (Available to Common Shareholders).
* **Threshold:** User defined (Default: $> 20\%$).

---

## 4. The "Gravion Score" Model

To rank the results in the UI, we calculate a composite **Gravion Score (0-100)**.

### 4.1 Scoring Weights
* **Technical Weight:** 60%
* **Fundamental Weight:** 40%

### 4.2 Calculation Logic

#### **Part A: Technical Score (Max 60)**
* **Trend Alignment:** +30 points if $SMA_{50} > SMA_{100}$.
* **Price Strength:** +20 points if $Price > SMA_{50}$.
* **Golden Cross:** +10 points if the crossover ($SMA_{50}$ crosses above $SMA_{100}$) happened within the last 5 days.

#### **Part B: Fundamental Score (Max 40)**
* **Growth Tier 1:** +40 points if YoY Growth $> 50\%$.
* **Growth Tier 2:** +20 points if YoY Growth between $20\% - 50\%$.
* **Growth Tier 3:** +0 points if YoY Growth $< 20\%$.

#### **Total Score Formula**
$$
Score_{Total} = Score_{Tech} + Score_{Fund}
$$

* **UI Representation:**
    * Score $\ge 80$: **Strong Buy** (Green)
    * Score $50-79$: **Watch** (Yellow)
    * Score $< 50$: **Neutral/Avoid** (Gray)

---

## 5. Backtesting Assumptions (Future Scope)

When running the "Backtest" module, the following logic applies to simulate trading:

* **Entry Price:** Next day's Open Price ($Open_{t+1}$) after a signal is generated at $Close_t$.
* **Exit Price:** Next day's Open Price ($Open_{t+1}$) after the signal becomes False.
* **Transaction Costs:**
    * Commission: $0.0049/share (Moomoo US rate).
    * Platform Fee: $0.005/share.
    * Slippage: Assumed 0.05% of trade value.

---

## 6. Edge Case Handling

| Scenario | System Behavior |
| :--- | :--- |
| **Stock Suspended** | Skip analysis. Return logic status: `SKIPPED_SUSPENDED`. |
| **Negative Earnings** | Growth calculation uses absolute value for denominator to handle sign flip correctly, or flags as "Turnaround" if turning from loss to profit. |
| **Data Delay** | If the latest quote is $> 24$ hours old (and it is a trading day), flag data as `STALE`. |