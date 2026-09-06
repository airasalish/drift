# Drifty Intelligence Engine - Architecture Documentation

## Overview

Drifty is a rule-based intelligence engine that analyzes stocks across three dimensions to determine what deserves attention in a watchlist. Unlike black-box ML models, every decision in Drifty traces to named thresholds that can be verified by hand from raw numbers.

**Core Principle**: The detection engine is rule-based and auditable — every "this matters" decision traces to a named threshold someone could verify by hand from the raw numbers.

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

## Three-Dimensional Analysis

### 1. Self Analysis
Compares a stock's movement against its own historical volatility.

**Metrics**:
- `today_pct_change`: Today's percentage change from previous close
- `normal_daily_move`: 20-day average daily move percentage
- `move_magnitude`: How many times larger today's move is compared to normal
- `volume_vs_normal`: Today's volume divided by 20-day average volume

**Thresholds** (shared with `change_detection.py`):
- Move >= `max(MIN_MOVE_THRESHOLD, MOVE_SENSITIVITY × normal_daily_move)`: **+30 attention points**
- Volume >= `VOLUME_SPIKE_MULTIPLE` × normal: **+15 attention points**
- At / within `NEAR_52W_PCT` of a 52-week extreme: **+20 / +12 attention points**

**Example**:
```
AAPL price: $228.17, prev_close: $224.50
today_pct_change = (228.17 - 224.50) / 224.50 = 1.63%
normal_daily_move = 0.80%
threshold = max(1.0%, 1.5 × 0.80%) = 1.20%
1.63% >= 1.20% → Score: +30 points (2.0× its normal daily range)
```

### 2. Peer Analysis
Compares a stock against other stocks in the same watchlist.

**Metrics**:
- `watchlist_size`: Total number of stocks in watchlist
- `same_direction_count`: How many peers moved in the same direction
- `avg_peer_move`: Average movement of all peers
- `cluster`: Market-wide movement detection (3+ stocks moving >2% same direction)

**Thresholds**:
- Outlier (different direction from majority): **+25 attention points**
- Part of market cluster: **+15 attention points**

**Example**:
```
Watchlist: [AAPL +1.6%, MSFT +0.8%, GOOGL +1.2%, TSLA -2.5%]
TSLA same_direction_count = 0 (all others up)
Peer count = 3, same_direction = 0, 0 < 3/2 → Outlier
→ Score: +25 points (outlier in watchlist)
```

### 3. Market Analysis
Compares a stock against the Nifty 50 benchmark.

**Metrics**:
- `benchmark_move`: Nifty 50 percentage change
- `outperformance`: Stock move minus benchmark move

**Thresholds**:
- Out/underperformance > 1.5%: **+20 attention points**

**Example**:
```
AAPL move: +1.63%
Nifty 50 move: +0.3%
outperformance = 1.63% - 0.3% = 1.33%
→ No points (below 1.5% threshold)
```

## Cluster Detection

Drifty detects market-wide movements by identifying when 3+ stocks move >2% in the same direction.

**Algorithm**:
1. For each stock in watchlist, calculate daily percentage change
2. Group stocks by direction (up/down) if move magnitude >= 2%
3. If any direction group has >= 3 stocks, return cluster information

**Cluster Example**:
```json
{
  "name": "market movers",
  "symbols": ["AAPL", "MSFT", "GOOGL"],
  "trend": "up 2.5%+"
}
```

**Purpose**: Distinguishes between stock-specific events and sector/market-wide trends.

## Attention Scoring

### Scoring Algorithm

| Signal | Threshold | Points |
|--------|-----------|--------|
| Unusual move for this stock | >= `MOVE_SENSITIVITY` (1.5) × its own average move, floored at `MIN_MOVE_THRESHOLD` (1%) | +30 |
| Outlier in watchlist | Different direction from majority, own move unusual | +25 |
| Market out/underperformance | > 1.5% difference | +20 |
| Market cluster | Part of 3+ stock cluster | +15 |
| Volume spike | >= `VOLUME_SPIKE_MULTIPLE` (2× normal) | +15 |
| At a 52-week high/low | price at or beyond the extreme | +20 |
| Near a 52-week high/low | within `NEAR_52W_PCT` (3%) of the extreme | +12 |

**Shared thresholds**: the move, volume and 52-week numbers above are the same
constants `app/services/change_detection.py` uses for the watchlist's attention
flags (via `change_detection.unusual_move_threshold()`, `VOLUME_SPIKE_MULTIPLE`
and `NEAR_52W_PCT`) -- one definition, so the Charts view's Drifty panel and the
list can't disagree about the same stock. `change_detection`'s "previously
fired" suppression (what makes mark-as-seen clear a stale 52-week flag) stays
there: Drifty is a stateless per-request read and reports current state.

**Maximum Score**: 100 points (capped)

**Attention Threshold**: Score > 20 = "needs attention"

### Score Interpretation

- **0-20**: Normal activity, no unusual patterns
- **21-40**: Mildly interesting, worth a glance
- **41-60**: Interesting, deserves investigation
- **61-80**: Very interesting, high priority
- **81-100**: Extremely interesting, urgent attention

## API Endpoints

### Single Stock Analysis

**Endpoint**: `GET /api/watchlists/{watchlist_id}/stock/{symbol}/drifty`

**Response**:
```json
{
  "symbol": "AAPL",
  "attention_score": 87,
  "self_analysis": {
    "today_pct_change": 0.0163,
    "normal_daily_move": 0.008,
    "move_magnitude": "2.0× normal",
    "volume_vs_normal": 1.5,
    "context": "AAPL is moving 2.0× its normal daily range"
  },
  "peer_analysis": {
    "watchlist_size": 5,
    "same_direction_count": 1,
    "avg_peer_move": 0.005,
    "comparison": "AAPL is the outlier. Other stocks are mostly flat.",
    "cluster": null
  },
  "market_analysis": {
    "benchmark_move": 0.003,
    "outperformance": 0.0133,
    "context": "AAPL is outperforming the market by 1.3%"
  },
  "why_interesting": [
    "Moving 2.0× its normal daily range",
    "Outlier in your watchlist (others moving differently)"
  ]
}
```

### Watchlist Ranking

**Endpoint**: `GET /api/watchlists/{watchlist_id}/drifty`

**Response**:
```json
{
  "watchlist_id": 1,
  "total_items": 9,
  "items_needing_attention": 2,
  "ranked": [
    {
      "symbol": "AAPL",
      "attention_score": 87,
      "why": "Moving 2.0× normal, outlier in watchlist"
    },
    {
      "symbol": "TSLA",
      "attention_score": 64,
      "why": "Volume spike, part of semiconductor move"
    }
  ]
}
```

### Stock Memberships

**Endpoint**: `GET /api/watchlists/stock/{symbol}/memberships`

**Response**:
```json
{
  "symbol": "AAPL",
  "company_name": "Apple Inc.",
  "memberships": [
    {"watchlist_id": 1, "name": "My Watchlist"},
    {"watchlist_id": 3, "name": "Technology"},
    {"watchlist_id": 5, "name": "Long Term"}
  ]
}
```

### Remove from Watchlist

**Endpoint**: `DELETE /api/watchlists/{watchlist_id}/items/{symbol}`

**Response**:
```json
{"ok": true}
```

## Multi-Watchlist Architecture

Drifty supports stocks existing in multiple watchlists simultaneously. This enables workflows like:

- **Trading Watchlist**: Stocks you actively trade
- **Long-term Holdings**: Stocks you hold for years
- **Watch List**: Stocks you're monitoring

**Key Design Decisions**:
- Removal from one watchlist doesn't affect others
- Drifty analysis is scoped to a single watchlist context
- Each watchlist has its own ranking and attention scores
- Symbol membership can be queried across all watchlists

## Error Handling

### Common Errors

| Status | Condition | Message |
|--------|-----------|---------|
| 404 | Stock not in watchlist | "symbol 'X' not in watchlist" |
| 404 | No market data for symbol | "no market data for symbol 'X'" |
| 404 | Watchlist doesn't exist | "not found" |
| 404 | User doesn't own watchlist | "not found" |

### Edge Cases Handled

1. **Division by Zero**: All percentage calculations protect against zero denominators
2. **Missing Data**: Gracefully handles missing `prev_close`, `volume`, or `avg_volume_20d`
3. **Empty Watchlists**: Returns empty rankings for watchlists with no items
4. **Stale Data**: Skips symbols with no current price data
5. **NaN Values**: Converts NaN to None to prevent JSON encoding errors

## Data Quality

### Requirements for Accurate Analysis

For Drifty to provide accurate analysis, the following data is required:

**Minimum Required**:
- `symbol`: Stock ticker symbol
- `price`: Current market price
- `prev_close`: Previous day's closing price

**Enhanced Accuracy** (adds to scoring capability):
- `avg_daily_move_pct_20d`: 20-day average daily move percentage
- `avg_volume_20d`: 20-day average volume
- `volume`: Current day's volume

**Optional** (adds context but not scoring):
- `week52_high`: 52-week high price
- `week52_low`: 52-week low price
- `spark_closes`: Recent price history for sparklines

### Data Freshness

Drifty relies on the background poller (`services/poller.py`) to refresh market data. The poller:
- Runs periodically (configurable interval)
- Fetches fresh data from yfinance
- Updates `SymbolQuote` records
- Calculates 20-day averages and other metrics

Stale data is detected when:
- `fetched_at` is older than the polling interval
- `price` is None or outdated
- 20-day averages are missing

## Performance Considerations

### Database Queries

- `compute_drifty()`: ~5-10 queries per stock (quote, watchlist, peers, benchmark)
- `get_drifty_watchlist()`: N × 5-10 queries for N stocks
- `detect_cluster()`: N queries for N stocks in watchlist

### Optimization Opportunities

1. **Batch Loading**: Could load all quotes for a watchlist in one query
2. **Caching**: Cache benchmark data (refreshes less frequently)
3. **Pre-computation**: Store attention scores in database (refresh on poll)
4. **Async Processing**: Compute rankings in background job

Current implementation prioritizes correctness over performance, which is appropriate for the current scale.

## Testing

### Test Coverage

Drifty includes comprehensive tests in `tests/test_drifty_intelligence.py`:

- **Self Analysis Tests**: High movers, volume spikes, normal stocks
- **Peer Analysis Tests**: Outlier detection, cluster detection
- **Market Analysis Tests**: Benchmark comparison, outperformance
- **Edge Cases**: Missing data, division by zero, empty watchlists
- **Integration Tests**: Full watchlist ranking, API endpoints

### Running Tests

```bash
cd backend
python -m pytest tests/test_drifty_intelligence.py -v
```

### Test Data Quality

Tests use synthetic data with known characteristics:
- `NORMAL`: Small movement, normal volume
- `HIGHMOVER`: 2.5× normal move
- `OUTLIER`: Opposite direction to peers
- `VOLSPIKE`: 5× normal volume
- `^NSEI`: Benchmark with known movement

## Future Enhancements

### Potential Improvements

1. **Sector Analysis**: Compare against sector index, not just market
2. **Volatility Regimes**: Adjust thresholds based on market volatility
3. **Earnings Context**: Flag stocks near earnings announcements
4. **News Integration**: Incorporate sentiment from news feeds
5. **Custom Thresholds**: Allow users to adjust sensitivity
6. **Historical Rankings**: Track attention scores over time

### Design Constraints

The following principles should not be violated:

1. **No Black Boxes**: Every decision must be traceable to a named threshold
2. **Auditable**: Anyone should be able to verify the calculation by hand
3. **No ML Models**: Do not introduce opaque multi-feature scoring
4. **Rule-Based**: Keep the system deterministic and explainable

## Maintenance

### Adding New Signals

To add a new signal to the attention scoring:

1. **Define Threshold**: Choose a named, auditable threshold
2. **Calculate Metric**: Add computation in `compute_drifty()`
3. **Add Scoring**: Add points to the score calculation
4. **Add Reason**: Add human-readable explanation to `why_interesting`
5. **Write Tests**: Add test cases for the new signal
6. **Update Documentation**: Document the new signal in this file

### Threshold Tuning

Thresholds are defined as constants in `compute_drifty()`:

```python
MIN_CLUSTER_MOVE = 0.02  # 2%
MIN_CLUSTER_SIZE = 3
VOLUME_SPIKE_THRESHOLD = 2.0
MOVE_MAGNITUDE_THRESHOLD = 2.0
MARKET_OUTPERFORMANCE_THRESHOLD = 0.015  # 1.5%
ATTENTION_SCORE_THRESHOLD = 20
```

To tune thresholds:
1. Run existing tests to establish baseline
2. Adjust threshold value
3. Verify tests still pass (or update expectations)
4. Test with real market data
5. Update documentation with new values

## Conclusion

Drifty Intelligence Engine provides a transparent, rule-based approach to identifying interesting stock movements. By comparing stocks against their own history, their peers, and the market, it surfaces what truly deserves attention while maintaining full auditability of every decision.

The architecture prioritizes:
- **Transparency**: Every decision is explainable
- **Auditability**: Every threshold is named and verifiable
- **Robustness**: Graceful handling of edge cases and missing data
- **Correctness**: Comprehensive test coverage
- **Extensibility**: Clear patterns for adding new signals
