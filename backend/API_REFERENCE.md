# Drifty Intelligence API Reference

## Base URL

```
http://localhost:8000/api/watchlists
```

## Authentication

All endpoints require Bearer token authentication:

```
Authorization: Bearer <token>
```

Tokens are obtained via `/api/auth/login` endpoint.

## Multi-Watchlist Stock Membership

### Get Stock Memberships

Get all watchlists that contain a specific symbol.

**Endpoint**: `GET /api/watchlists/stock/{symbol}/memberships`

**Parameters**:
- `symbol` (path): Stock symbol (case-insensitive)

**Response**:
```json
{
  "symbol": "AAPL",
  "company_name": "Apple Inc.",
  "memberships": [
    {
      "watchlist_id": 1,
      "name": "My Watchlist"
    },
    {
      "watchlist_id": 3,
      "name": "Technology"
    }
  ]
}
```

**Status Codes**:
- `200`: Success (returns empty memberships if symbol not found)
- `401`: Unauthorized (invalid or missing token)

**Example**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/stock/AAPL/memberships
```

---

### Remove Stock from Watchlist

Remove a stock from a specific watchlist by symbol.

**Endpoint**: `DELETE /api/watchlists/{watchlist_id}/items/{symbol}`

**Parameters**:
- `watchlist_id` (path): Watchlist ID
- `symbol` (path): Stock symbol (case-insensitive)

**Response**:
```json
{
  "ok": true
}
```

**Status Codes**:
- `200`: Success
- `401`: Unauthorized (invalid or missing token)
- `404`: Watchlist not found, user doesn't own watchlist, or symbol not in watchlist

**Example**:
```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/1/items/AAPL
```

**Note**: This only removes the stock from the specified watchlist. The stock may still exist in other watchlists.

---

## Drifty Intelligence Engine

### Get Single Stock Analysis

Get comprehensive intelligence analysis for a specific stock within a watchlist.

**Endpoint**: `GET /api/watchlists/{watchlist_id}/stock/{symbol}/drifty`

**Parameters**:
- `watchlist_id` (path): Watchlist ID
- `symbol` (path): Stock symbol (case-insensitive)

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

**Response Fields**:

**Root Level**:
- `symbol` (string): Stock symbol (uppercased)
- `attention_score` (integer): 0-100 score, higher = more interesting
- `self_analysis` (object): Self-comparison metrics
- `peer_analysis` (object): Peer comparison metrics
- `market_analysis` (object): Market comparison metrics
- `why_interesting` (array): List of human-readable reasons for the score

**Self Analysis**:
- `today_pct_change` (float): Today's percentage change from previous close
- `normal_daily_move` (float): 20-day average daily move percentage
- `move_magnitude` (string): How many times larger today's move is compared to normal (e.g., "2.0× normal")
- `volume_vs_normal` (float): Today's volume divided by 20-day average volume
- `context` (string): Human-readable context string

**Peer Analysis**:
- `watchlist_size` (integer): Total number of stocks in watchlist
- `same_direction_count` (integer): How many peers moved in the same direction
- `avg_peer_move` (float): Average movement of all peers
- `comparison` (string): Human-readable comparison string
- `cluster` (object | null): Market cluster information if detected, otherwise null

**Cluster Object** (if present):
- `name` (string): Cluster name (e.g., "market movers")
- `symbols` (array): List of symbols in the cluster
- `trend` (string): Trend description (e.g., "up 2.5%+")

**Market Analysis**:
- `benchmark_move` (float): Nifty 50 percentage change
- `outperformance` (float): Stock move minus benchmark move
- `context` (string): Human-readable context string

**Status Codes**:
- `200`: Success
- `401`: Unauthorized (invalid or missing token)
- `404`: Watchlist not found, user doesn't own watchlist, symbol not in watchlist, or no market data for symbol

**Example**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/1/stock/AAPL/drifty
```

---

### Get Watchlist Ranking

Get Drifty intelligence ranking for an entire watchlist.

**Endpoint**: `GET /api/watchlists/{watchlist_id}/drifty`

**Parameters**:
- `watchlist_id` (path): Watchlist ID

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
    },
    {
      "symbol": "MSFT",
      "attention_score": 15,
      "why": "Normal activity"
    }
  ]
}
```

**Response Fields**:
- `watchlist_id` (integer): Watchlist ID
- `total_items` (integer): Total number of stocks in watchlist
- `items_needing_attention` (integer): Count of stocks with score > 20
- `ranked` (array): List of stocks sorted by attention score (descending)

**Ranked Item**:
- `symbol` (string): Stock symbol
- `attention_score` (integer): 0-100 score
- `why` (string): Comma-separated list of top 2 reasons (or "Normal activity")

**Status Codes**:
- `200`: Success
- `401`: Unauthorized (invalid or missing token)
- `404`: Watchlist not found or user doesn't own watchlist

**Example**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/1/drifty
```

---

## Enhanced Chart Data

### Get Chart Data

Get historical chart data for a specific symbol and time range.

**Endpoint**: `GET /api/watchlists/chart/{symbol}/{range_name}`

**Parameters**:
- `symbol` (path): Stock symbol (case-insensitive)
- `range_name` (path): Time range identifier

**Supported Ranges**:
- `1D`: 1 day
- `5D`: 5 days
- `1M`: 1 month
- `3M`: 3 months
- `6M`: 6 months
- `YTD`: Year-to-date
- `1Y`: 1 year
- `5Y`: 5 years
- `ALL`: All available data

**Response**:
```json
{
  "symbol": "AAPL",
  "range": "1M",
  "dates": ["2026-08-06", "2026-08-07", "2026-08-08"],
  "closes": [228.17, 227.80, 229.50],
  "opens": [227.50, 228.00, 227.90],
  "highs": [229.00, 228.50, 230.00],
  "lows": [226.50, 227.00, 227.50],
  "volumes": [50000000, 48000000, 52000000],
  "currency": "USD"
}
```

**Response Fields**:
- `symbol` (string): Stock symbol
- `range` (string): Requested range name
- `dates` (array): List of date strings (YYYY-MM-DD format)
- `closes` (array): Required: Close prices (never null)
- `opens` (array | null): Optional: Open prices (may be null if unavailable)
- `highs` (array | null): Optional: High prices (may be null if unavailable)
- `lows` (array | null): Optional: Low prices (may be null if unavailable)
- `volumes` (array | null): Optional: Volume data (may be null if unavailable)
- `currency` (string | null): Currency code if available

**Data Guarantees**:
- `dates` and `closes` are always present and the same length
- `dates` and `closes` never contain null values
- OHLC fields are optional and only included when available
- All data is daily granularity (no intraday data)
- NaN values are cleaned to null

**Status Codes**:
- `200`: Success
- `401`: Unauthorized (invalid or missing token)
- `404`: Symbol not in user's watchlists
- `422`: Invalid range name or couldn't fetch chart data

**Example**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/chart/AAPL/1M
```

---

## Error Responses

All endpoints may return error responses with the following structure:

```json
{
  "detail": "Error message describing the issue"
}
```

**Common Error Codes**:
- `401`: Unauthorized - Invalid or missing authentication token
- `404`: Not Found - Resource doesn't exist or user doesn't have access
- `422`: Unprocessable Entity - Invalid input or data unavailable
- `500`: Internal Server Error - Unexpected server error

---

## Rate Limiting

Currently, there are no rate limits enforced on these endpoints. Consider implementing rate limiting for production use.

---

## Data Freshness

- **Market Data**: Refreshed by background poller (configurable interval)
- **Drifty Analysis**: Computed on-demand (not cached)
- **Chart Data**: Fetched from yfinance on-demand (not cached)

Stale data is detected when:
- `fetched_at` timestamp is older than polling interval
- `price` is null or outdated
- 20-day averages are missing

---

## Schema Definitions

### StockMembershipOut
```typescript
{
  symbol: string;
  company_name: string | null;
  memberships: Array<{
    watchlist_id: number;
    name: string;
  }>;
}
```

### DriftyOut
```typescript
{
  symbol: string;
  attention_score: number;
  self_analysis: {
    today_pct_change: number;
    normal_daily_move: number;
    move_magnitude: string;
    volume_vs_normal: number;
    context: string;
  };
  peer_analysis: {
    watchlist_size: number;
    same_direction_count: number;
    avg_peer_move: number;
    comparison: string;
    cluster: {
      name: string;
      symbols: string[];
      trend: string;
    } | null;
  };
  market_analysis: {
    benchmark_move: number;
    outperformance: number;
    context: string;
  };
  why_interesting: string[];
}
```

### DriftyWatchlistOut
```typescript
{
  watchlist_id: number;
  total_items: number;
  items_needing_attention: number;
  ranked: Array<{
    symbol: string;
    attention_score: number;
    why: string;
  }>;
}
```

### ChartRangeOut
```typescript
{
  symbol: string;
  range_name: string;
  dates: string[];
  closes: number[];
  opens: (number | null)[] | null;
  highs: (number | null)[] | null;
  lows: (number | null)[] | null;
  volumes: (number | null)[] | null;
  currency: string | null;
}
```

---

## Examples

### Example 1: Check where AAPL is tracked

```bash
# Get all watchlists containing AAPL
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/stock/AAPL/memberships

# Response shows AAPL is in 3 watchlists
```

### Example 2: Get intelligence for a specific stock

```bash
# Get Drifty analysis for AAPL in watchlist 1
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/1/stock/AAPL/drifty

# Response shows AAPL has high attention score due to unusual movement
```

### Example 3: Get ranking for entire watchlist

```bash
# Get ranked list for watchlist 1
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/1/drifty

# Response shows stocks sorted by attention score
```

### Example 4: Remove stock from specific watchlist

```bash
# Remove AAPL from watchlist 1 (but keep it in others)
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/1/items/AAPL

# Response confirms removal
```

### Example 5: Get chart data

```bash
# Get 1M chart data for AAPL with OHLC
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/watchlists/chart/AAPL/1M

# Response includes dates, closes, and optional OHLC data
```

---

## Testing

### Manual Testing

Use the built-in FastAPI docs at `http://localhost:8000/docs` for interactive API testing.

### Automated Testing

Run the test suite:

```bash
cd backend
python -m pytest tests/test_drifty_intelligence.py -v
```

---

## Changelog

### Version 1.0 (Current)
- Added multi-watchlist stock membership endpoints
- Added Drifty Intelligence Engine with single stock analysis
- Added watchlist ranking endpoint
- Enhanced chart data with OHLC support and additional timeframes
- Comprehensive error handling and edge case protection
- Full test coverage for all new endpoints
