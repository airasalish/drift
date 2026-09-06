# Task for Devin: Drifty Intelligence Engine + Multi-Watchlist Architecture

This replaces all prior Devin prompts. This is the real backend work that makes Drift a thinking product, not just a prettier watchlist.

## The Core Insight

Drift's genius isn't remembering what you saw. It's noticing what's genuinely unusual.

Drifty is a reasoning engine that compares:
1. **Self** — this stock vs. its own history (volatility, movement, volume norms)
2. **Peer** — this stock vs. other stocks in the same watchlist
3. **Market** — this stock vs. the benchmark (Nifty 50)

Then it combines those signals into one **attention score** that ranks what deserves investigation.

## Architecture

```
Market Data (yfinance)
         ↓
   Drift Engine
         ↓
┌────────┼────────┐
↓        ↓        ↓
Self    Peer    Market
Change  Change  Change
↓        ↓        ↓
└────────┼────────┘
         ↓
Pattern Detection
         ↓
Attention Ranking
         ↓
Drifty Output
```

## Phase 1: Multi-Watchlist Stock Membership (P0)

**Current state:** WatchlistItem already scopes by watchlist_id, so multi-membership is architecturally sound. You just need the API surface.

**New endpoints:**

### 1. Get stock's watchlist memberships
```
GET /api/watchlists/stock/{symbol}/memberships
Response:
{
  symbol: "AAPL",
  company_name: "Apple Inc.",
  memberships: [
    { watchlist_id: 1, name: "My Watchlist" },
    { watchlist_id: 3, name: "Technology" },
    { watchlist_id: 5, name: "Long Term" }
  ]
}
```

### 2. Add stock to a watchlist (from detail view)
```
POST /api/watchlists/{watchlist_id}/items
Body: { symbol: "AAPL", note: "optional why I added this" }
Response: WatchlistItemOut (existing schema)

Behavior:
- If already in this watchlist, return 409 (already tracked)
- If new symbol, fetch market data first (existing pattern)
- Scoped to one watchlist_id only (not global)
```

### 3. Remove stock from a watchlist
```
DELETE /api/watchlists/{watchlist_id}/items/{symbol}
Response: { ok: true }

Behavior:
- Only removes from that watchlist
- Stock can still exist in other watchlists
- Does not affect "since you last looked" state in other watchlists
```

## Phase 2: Drifty Intelligence (P1)

**This is the real work.**

### 2A. Compute Drifty signals for one stock

New endpoint:
```
GET /api/watchlists/{watchlist_id}/stock/{symbol}/drifty
Response:
{
  symbol: "AAPL",
  attention_score: 87,
  
  self_analysis: {
    today_pct_change: -2.51,
    normal_daily_move: 1.20,
    move_magnitude: "2.1× normal",
    volume_vs_normal: 3.1,
    context: "AAPL is moving 2.1× its normal daily range"
  },
  
  peer_analysis: {
    watchlist_size: 5,
    same_direction_count: 1,
    avg_peer_move: +0.15,
    comparison: "AAPL is the outlier. Other tech stocks are mostly flat.",
    cluster: null  // or { name: "semiconductors", symbols: ["NVDA", "AMD", "AVGO"], trend: "down 3%+" }
  },
  
  market_analysis: {
    benchmark_move: -0.3,
    outperformance: -2.21,
    context: "AAPL is underperforming the market by 2.2%"
  },
  
  why_interesting: [
    "Moving 2.1× its normal daily range",
    "Outlier in your watchlist (others flat)",
    "Underperforming market by 2.2%"
  ]
}
```

**Implementation logic:**

```python
def compute_drifty(watchlist_id: int, symbol: str, user: User) -> DriftyOut:
    """
    Compute the intelligence layer for a stock within a watchlist context.
    """
    
    # Get the quote
    quote = db.get(SymbolQuote, symbol)
    if not quote or quote.price is None:
        raise HTTPException(404, "no data for symbol")
    
    # SELF ANALYSIS
    # Compare today's move against the stock's own volatility
    today_pct = (quote.price - quote.prev_close) / quote.prev_close if quote.prev_close else 0
    self_move_magnitude = abs(today_pct) / (quote.avg_daily_move_pct_20d or 1.0)
    
    # PEER ANALYSIS
    # Get all other stocks in the watchlist
    watchlist = db.get(Watchlist, watchlist_id)
    peer_quotes = [db.get(SymbolQuote, item.symbol) for item in watchlist.items if item.symbol != symbol]
    
    # Count how many peers moved in the same direction
    same_direction = sum(1 for q in peer_quotes if q and (q.price - q.prev_close) * (quote.price - quote.prev_close) > 0)
    
    # Average peer move
    peer_moves = [(q.price - q.prev_close) / q.prev_close for q in peer_quotes if q and q.prev_close]
    avg_peer_move = sum(peer_moves) / len(peer_moves) if peer_moves else 0
    
    # Detect if this is part of a cluster (3+ stocks moving >2% in same direction)
    cluster = detect_cluster(watchlist.items, db)
    
    # MARKET ANALYSIS
    # Compare against Nifty 50
    benchmark = db.get(SymbolQuote, "^NSEI")
    benchmark_move = (benchmark.price - benchmark.prev_close) / benchmark.prev_close if benchmark and benchmark.prev_close else 0
    outperformance = today_pct - benchmark_move
    
    # ATTENTION SCORE
    # Simple: combine signals with weights
    score = 0
    reasons = []
    
    if self_move_magnitude > 2.0:
        score += 30
        reasons.append(f"Moving {self_move_magnitude:.1f}× its normal daily range")
    
    if same_direction < len(peer_quotes) / 2:  # Outlier
        score += 25
        reasons.append(f"Outlier in your watchlist (others moving differently)")
    
    if abs(outperformance) > 1.5:
        score += 20
        reasons.append(f"{'Outperforming' if outperformance > 0 else 'Underperforming'} market by {abs(outperformance):.1f}%")
    
    if cluster and symbol in cluster["symbols"]:
        score += 15
        reasons.append(f"{len(cluster['symbols'])} {cluster['name']} stocks down >2%")
    
    return DriftyOut(
        symbol=symbol,
        attention_score=min(score, 100),
        self_analysis=SelfAnalysisOut(...),
        peer_analysis=PeerAnalysisOut(...),
        market_analysis=MarketAnalysisOut(...),
        why_interesting=reasons
    )
```

### 2B. Compute Drifty attention rank for entire watchlist

```
GET /api/watchlists/{watchlist_id}/drifty
Response:
{
  watchlist_id: 1,
  total_items: 9,
  items_needing_attention: 2,
  ranked: [
    {
      symbol: "AAPL",
      attention_score: 87,
      why: "Moving 2.1× normal, outlier in watchlist"
    },
    {
      symbol: "NVDA",
      attention_score: 64,
      why: "Volume spike, part of semiconductor move"
    }
  ]
}
```

## Phase 3: Chart Data with Timeframes (P0)

**Current:** `fetch_chart_data` exists but only basic structure.

**Enhance to:**
1. Support all ranges: 1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y, ALL
2. Return OHLC data where available
3. Gracefully degrade to close-only if OHLC unavailable
4. Never fabricate missing data

```python
def fetch_chart_data(symbol: str, range_name: str) -> dict | None:
    """
    Fetch chart data for a specific time range.
    
    Returns:
    {
      symbol: "AAPL",
      range: "1M",
      dates: ["2026-08-06", "2026-08-07", ...],
      opens: [228.0, 227.5, ...],   # Only if available
      highs: [230.0, 229.0, ...],   # Only if available
      lows: [226.0, 225.5, ...],    # Only if available
      closes: [228.17, 227.80, ...],
      volumes: [50000000, 48000000, ...],  # Optional
      currency: "USD"
    }
    """
    # yfinance period mapping
    period_map = {
        "1D": "1d",
        "5D": "5d",
        "1M": "1mo",
        "3M": "3mo",
        "6M": "6mo",
        "YTD": "ytd",
        "1Y": "1y",
        "5Y": "5y",
        "ALL": "max"
    }
    
    # Fetch with daily granularity only (no intraday)
    hist = ticker.history(period=period_map[range_name], interval="1d")
    
    # Build response
    # Return only what's actually available
    return {
        "symbol": symbol,
        "range": range_name,
        "dates": [d.strftime("%Y-%m-%d") for d in hist.index],
        "opens": [float(o) if not pd.isna(o) else None for o in hist.get("Open")],
        "highs": [float(h) if not pd.isna(h) else None for h in hist.get("High")],
        "lows": [float(l) if not pd.isna(l) else None for l in hist.get("Low")],
        "closes": [float(c) if not pd.isna(c) else None for c in hist.get("Close")],
        "currency": currency
    }
```

## Phase 4: Tests

Every new endpoint must have real tests that call the actual endpoint (not reimplemented logic).

- Multi-watchlist membership flows (add/remove/query)
- Drifty intelligence accuracy (mock data with known signals, verify score)
- Drifty outlier detection (one stock different from peers, verify it ranks high)
- Drifty cluster detection (3+ stocks moving >2%, verify identified)
- Chart data for all timeframes (verify data shape, never return None values mixed with real ones)

## Workflow

`git fetch` before committing. Run full backend suite before pushing. Paste actual test output (not just pass count).

**Most important:** This is the intelligence layer. Get the computation logic right. Get the tests right. Don't ship guesses.
