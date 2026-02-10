# UI/UX Design Specification (UID)

| **Project Name** | **Gravion** |
| :--- | :--- |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | February 9, 2026 |
| **Style** | Professional Dark (TradingView-like) |

---

## 1. Design Philosophy

**"Utility First, Decoration Second."**

Gravion is a tool for decision-making, not entertainment. The interface must be:
1.  **High Density:** Maximize the amount of data visible without scrolling.
2.  **Low Glare:** Use "Matte" colors (no neon) to reduce eye strain during long sessions.
3.  **Strict Grid:** All elements must align perfectly to a pixel grid; no floating or overlapping elements.
4.  **State-Aware:** Buttons and data must clearly indicate their state (e.g., Active, Hover, Loading, Disconnected).

---

## 2. Visual Style Guide

### 2.1 Color Palette
We use a **Professional Dark Mode** palette. Do not use pure black (`#000000`).

#### **Backgrounds**
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `bg-base` | `#131722` | Main application background (Deepest layer). |
| `bg-panel` | `#1E222D` | Cards, sidebars, and active tab backgrounds. |
| `bg-hover` | `#2A2E39` | Hover states for rows and buttons. |

#### **Borders & Dividers**
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `border-subtle` | `#2A2E39` | Subtle separators between panels. |
| `border-active` | `#2962FF` | Active input focus or selected item border. |

#### **Typography Colors**
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `text-primary` | `#D1D4DC` | Main content, tickers, prices. |
| `text-muted` | `#787B86` | Labels, secondary info, empty states. |
| `text-inverse` | `#FFFFFF` | Text on colored buttons (Primary Actions). |

#### **Semantic Colors (Signal Indicators)**
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `brand-blue` | `#2962FF` | Primary actions (Run Scan), Links, Selected Tabs. |
| `signal-green`| `#089981` | Bullish signals, Price Up, Positive Growth. |
| `signal-red` | `#F23645` | Bearish signals, Price Down, Negative Growth. |
| `signal-warn` | `#F6A90E` | Warnings, Alerts, Neutral signals. |

### 2.2 Typography
* **Primary Font:** `Inter` (UI elements, headers, buttons).
* **Monospace Font:** `JetBrains Mono` or `Roboto Mono` (Prices, Tickers, Percentages, tabular data).

**Scale:**
* **H1 (Header):** 16px / Bold / `text-primary`
* **Body:** 13px / Regular / `text-primary`
* **Label:** 11px / Medium / `text-muted` / Uppercase
* **Table Data:** 13px / Mono / `text-primary`

---

## 3. Layout Structure (The "Quad-Grid")

The application window (`1280x800` min-width) is divided into 4 fixed zones.

### Zone A: Top Navigation (Height: 48px)
* **Location:** Fixed at the top.
* **Elements:** Logo, Universe Selector (Dropdown), Strategy Settings (Button), "Run Scan" (Primary Button).
* **Behavior:** Always visible.

### Zone B: Left Toolbar (Width: 50px)
* **Location:** Fixed at the left.
* **Elements:** Icon-only buttons for Drawing Tools (Line, Fib, Text) - *Future Scope*.
* **Behavior:** Static tools.

### Zone C: Main Workspace (Flexible)
* **Location:** Center area.
* **Elements:**
    * **Filter Bar:** Chips showing active filters (e.g., "Price > 50MA").
    * **Data Grid:** The main table showing scan results.
* **Behavior:** Scrollable area.

### Zone D: Right Sidebar (Width: 300px)
* **Location:** Fixed at the right.
* **Elements:**
    * **Watchlist:** A manual list of favorite stocks.
    * **Mini-Fundamental:** Key stats (PE, EPS, Market Cap) for the selected row in Zone C.
* **Behavior:** Collapsible (Optional).

---

## 4. Component Specifications

### 4.1 The "Result Table"
* **Row Height:** 40px (Compact).
* **Hover Effect:** Background changes to `bg-hover` (`#2A2E39`).
* **Columns:**
    1.  **Ticker:** Bold text + Small 2px badge for Market (US/HK).
    2.  **Price:** Mono font. Green/Red text color based on `Change %`.
    3.  **Signal:** Badge component (Background: `signal-green` with 20% opacity, Text: `signal-green`).
    4.  **Growth:** Mono font.
    5.  **Actions:** "Details" button (only visible on hover).

### 4.2 The "Universe Selector"
* **Type:** Combobox / Dropdown.
* **State Default:** Shows current selection (e.g., "🇺🇸 NASDAQ 100").
* **State Open:** Shows list of available universes + "Import CSV" option.
* **Searchable:** Yes (User can type "SPX" to find S&P 500).

### 4.3 The "Chart" (Lightweight Charts)
* **Type:** Candlestick.
* **Colors:**
    * Up Candle: `#089981`
    * Down Candle: `#F23645`
    * Background: Transparent (to match `bg-base`).
    * Grid Lines: `#2A2E39` (Dotted).
* **Overlays:**
    * Line Series (50MA): Blue (`#2962FF`), Width 2px.
    * Line Series (100MA): Orange (`#F6A90E`), Width 2px.

---

## 5. Screen Flows

### 5.1 Dashboard (Empty State)
* **Trigger:** App Launch.
* **Visual:** Center of Zone C shows a "Ready to Scan" illustration or text.
* **Action:** User clicks "Run Scan" in Zone A.

### 5.2 Scanning State
* **Trigger:** Clicking "Run Scan".
* **Visual:** "Run Scan" button shows a spinner. A thin progress bar appears under Zone A (blue line animating).

### 5.3 Results View
* **Trigger:** Scan Complete.
* **Visual:** Zone C populates with the Data Grid.
* **Interaction:**
    * Clicking a row updates Zone D (Right Sidebar) with that stock's fundamental details.
    * Double-clicking a row opens a Modal with a full-screen Chart.

---

## 6. Assets & Icons

* **Icon Set:** **Lucide React** (Stroke width: 1.5px).
    * *Search, Filter, Settings, Play (Run), TrendingUp, AlertCircle.*
* **Logo:** Simple text "Gravion" in `Inter Bold` or a geometric SVG shape.

---