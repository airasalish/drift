# Task for Manus: Professional Chart + Drifty Intelligence Panel + Multi-Watchlist UX

This replaces all prior Manus prompts. The goal: transform Drift from a watchlist viewer into a professional market terminal experience.

## The Mental Model (Lock This In)

```
LEFT               CENTER                RIGHT
────────────────────────────────────────────────
WATCHLIST    │    CHART + ANALYSIS    │    DRIFTY
             │                        │
AAPL ←sel    │    AAPL                │    Why this matters
NVDA         │    Apple Inc.          │    (Drifty scores here)
TSLA         │    $228.17  -2.51%     │
MSFT         │                        │    AI Summary
             │    [LARGE CHART]       │    Intelligence
             │                        │    engine output
             │    Since you looked    │
             │    $234 → $228.17      │
```

Navigation:
- Click NVDA → chart updates, Drifty updates
- Press ↓ → NVDA selected, chart updates, Drifty updates
- Scroll page → page scrolls (chart doesn't zoom)
- Intentional chart zoom → only via chart controls

## Phase 1: Keyboard Navigation (P0, no backend dependency)

When the watchlist panel has focus:

```
↑  →  select previous stock in current watchlist
↓  →  select next stock in current watchlist
```

**Must NOT hijack arrow keys when user is:**
- typing in the add-stock input
- typing in the watchlist-name edit field
- focused on any text input

**Implementation:**
1. Add `onKeyDown` listener to the watchlist panel
2. Check if target is a text input (input, textarea, contenteditable)
3. If safe, call the existing stock-selection handler
4. Visually highlight the selected row
5. Update chart, Drifty, AI Summary, everything

**Visual cue:**
Near the watchlist panel header, add a small hint:
```
↑ ↓ Navigate
```

## Phase 2: Professional Chart Component (P0)

Replace the simple sparkline/graph with a real market chart.

### 2A. Chart Header

```
AAPL · Apple Inc.
$228.17  -2.51%

O 231.20  H 232.10  L 227.80  C 228.17
Updated 2:45 PM ET
```

Show OHLC only if the backend provides it for this timeframe.
If a value is missing, omit it (don't fake it).

### 2B. Timeframe Controls

```
1D   5D   1M   3M   6M   YTD   1Y   5Y   ALL
```

Clicking a range:
1. Calls `GET /api/watchlists/{watchlist_id}/stock/{symbol}/chart/{range}`
2. Updates the chart with new data
3. Does NOT reload the page
4. Selected timeframe stays highlighted

**Do NOT support 1D/1W intraday ranges** — Devin isn't building intraday data. If the backend doesn't support a range, disable the button or show "no data."

### 2C. Chart Visualization

**Primary:** Candlestick/OHLC if available (backend returns open/high/low/close)
**Fallback:** Line chart (if only close prices available)

Requirements:
- Large enough to read (not a tiny sparkline)
- Dark theme (match existing CSS variables)
- X-axis: dates, readable labels
- Y-axis: price, human-readable scale
- Gridlines: subtle but visible

Use an existing charting library if needed (Recharts, Plotly, Apache ECharts). Don't build a chart renderer from scratch.

### 2D. CRITICAL: Scroll vs. Zoom Behavior

**Mouse wheel / trackpad:** scrolls the PAGE
- Do NOT zoom the chart
- Do NOT hijack the browser's normal scroll

**Chart zoom:** intentional only
- Mouse wheel over the chart = page scroll only
- Chart controls (if present) for zoom
- Pinch gesture (if supported) for zoom on mobile

This is non-negotiable. No scroll hijacking.

### 2E. Drift Memory Layer

Overlay the user's previous viewing point on the chart, if possible.

Example:
```
        YOU WERE HERE
              │
              ↓
──────●───────│────────────● NOW

$234.05                    $228.17
```

Implementation:
- Get `last_viewed_at` from the stock's details
- Find the date on the chart
- Draw a vertical line or marker at that position
- Show the price at that time
- Show the change: $234.05 → $228.17 (-2.51%)

If the last-view date is outside the current timeframe (e.g., viewed 2 months ago, now viewing 1D), don't draw anything.

## Phase 3: Stock Watchlist Memberships UI (P0)

When viewing a stock detail, show which watchlists it belongs to:

```
WATCHLISTS

My Watchlist · Technology · Long Term
───────────────────────────────

+ Add to another watchlist
```

Clicking a membership badge might remove it (or open a menu).
"Add to another watchlist" opens a list of other watchlists:

```
Add to watchlist

□ Buyable
□ Earnings
□ High Growth
✓ My Watchlist

[Create new watchlist]
```

Checking a box adds the stock to that watchlist.
Unchecking removes it.

**Implementation:**
1. Call `GET /api/watchlists/stock/{symbol}/memberships` on stock detail open
2. Display the returned watchlist list
3. On click/toggle, call `POST /api/watchlists/{watchlist_id}/items` or `DELETE`
4. Update the UI immediately

## Phase 4: Drifty Intelligence Panel (P1)

This is where Drift becomes smart.

### 4A. Panel Structure

Right-side panel, persistent:

```
DRIFTY

─────────────────────────

INSIGHT (from Drifty engine)
[Drifty's high-level observation about why this matters]

WHY DRIFT FLAGGED THIS
• 2.1× normal daily move
• Outlier in your watchlist
• Underperforming market by 2.2%

AI SUMMARY
[Short prose summary from LLM, if available]

RELATED INSIGHTS
[Other signals already detected by Drift]

SIMILAR MOVES
[Historical context, only if data exists]

RELATED STOCKS
[Other stocks worth investigating]
```

### 4B. Drifty Insight Section

Display the top-level intelligence from the backend:

```
Drifty

─────────────────────────

AAPL is the biggest thing that changed
in your watchlist today. It's down 2.5%,
while your other tech stocks are mostly flat.
```

This comes directly from `GET /api/watchlists/{watchlist_id}/stock/{symbol}/drifty`

Don't embellish it. Don't add AI. Just surface what the engine computed.

### 4C. Why Drift Flagged This

Show the exact signals:

```
WHY DRIFT FLAGGED THIS

• 2.1× normal daily move
• Outlier in watchlist (others +0.15% avg)
• Underperforming market by 2.2%
```

This is deterministic. Numbers only. No prose.

### 4D. AI Summary

Existing digest feature, relabeled.

Keep it — it's useful.

Only show if Groq is configured and the call succeeds.
Gracefully omit if it's not available.

### 4E. Related Insights

Other computed signals for this stock:

```
RELATED INSIGHTS

⬆ Near 52-week high
⬇ Weaker than benchmark
💧 Volume spike (3.1×)
```

Pull these from the same signals that already power the "Why Drift flagged this" section.

### 4F. Similar Moves (only if Devin's data exists)

```
SIMILAR MOVES

Last move of similar magnitude: 47 sessions ago
Sep 12 -2.7%
Aug 28 -2.5%
Jul 14 -2.8%
```

Or:
```
SIMILAR MOVES

Not enough historical data yet
```

Never fabricate dates/numbers.

### 4G. Related Stocks (only if Devin's data exists)

```
RELATED STOCKS

NVDA  -1.2%  (Semiconductor cluster)
MSFT  +0.8%  (Tech sector)
AMD   -3.1%  (Semiconductor cluster)
```

Clicking one of these stocks:
1. Selects that stock in the watchlist
2. Updates the chart
3. Updates Drifty
4. Updates all panels

No separate detail page. Same-page navigation.

## Phase 5: Selected Stock Behavior (P0)

When the selected stock changes (click, keyboard ↑/↓, or click related stock):

Immediately update ALL of:
1. Chart
2. Stock price header
3. Daily change
4. Since-last-view info
5. Watchlist memberships
6. Drifty panel
7. AI Summary
8. Related Insights
9. Similar Moves
10. Related Stocks

The experience should feel like browsing inside a trading terminal, not navigating to separate pages.

## Phase 6: Multi-Watchlist Menu (P0)

The watchlist switcher in the left rail.

When user opens the menu:

```
My Watchlist    ✓

─────────────────────

Technology
Long Term
Earnings

─────────────────────

+ New watchlist
From a preset
```

"From a preset" opens:

```
PRE-MADE WATCHLISTS

Indian Market
  Nifty 50
  Nifty Next 50
  Sensex

Sectors
  IT
  Banking
  Auto

Themes
  AI & Semiconductors
  Dividends
```

Clicking one creates the watchlist (Devin's endpoint) and switches to it.

## Visual Direction (Final Emphasis)

This should NOT look like:
- A generic SaaS dashboard
- A spreadsheet
- A CRUD app
- An AI summary bot

This SHOULD look like:
- Professional financial terminal (Zerodha, TradingView aesthetic)
- Dense but readable
- Dark
- Fast
- Premium

The chart is the star. The watchlist is navigation. Drifty is intelligence.

Reference principle: Borrow the **feeling** and **density** of Zerodha/TradingView, not their UI.

## Workflow

`git fetch` before committing. Stage specific files (never `-A`).

Run `npm run build` before pushing — a broken build is the most expensive mistake here.

Test in actual browser:
1. Click stock → chart changes
2. Press ↓ → chart changes
3. Scroll page → page scrolls, chart stays still
4. Click watchlist membership → stock added/removed
5. Click related stock → that stock selected, chart updates

## Tests

No automated browser tests required (too fragile for UI).
But you should manually verify:
- All timeframes load data
- Chart never zooms on page scroll
- Keyboard navigation doesn't trigger while typing
- Drifty updates when stock changes
- Memberships UI works
