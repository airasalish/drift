# Task for Devin: Fix Drifty outlier over-sensitivity + add watchlist item counts

The Drifty Intelligence Engine (Phase 1-4) is live and the multi-watchlist membership
endpoints work. Testing them live in the browser this session surfaced two concrete gaps.

## 1. Outlier detection fires on noise, not signal (P0 — correctness bug)

**File:** `backend/app/routers/watchlist.py`, `compute_drifty()`, around line 1146:

```python
# Signal 2: Outlier in watchlist (moving differently from peers)
# Only meaningful if we have peers to compare against
if peer_quotes and same_direction < len(peer_quotes) / 2:
    score += 25
    reasons.append("Outlier in your watchlist (others moving differently)")
```

This only counts how many peers moved in the *same direction* — it never checks
whether the stock's own move is actually big enough to matter. Live-tested example:
DKNG moved **-0.74%** (0.3× its own normal daily move — a completely unremarkable day)
but still scored 25/100 and got a "Flagged" badge with "Outlier in your watchlist" as
the only reason, purely because 3 of 8 peers happened to move the other way. On any
watchlist, roughly half the peers moving opposite on a quiet day is expected noise,
not a signal — this rule will fire constantly and erode trust in the "Flagged" badge.

**Fix:** gate the outlier signal on the stock's own move being non-trivial first, e.g.:

```python
if peer_quotes and self_move_magnitude > 1.0 and same_direction < len(peer_quotes) / 2:
```

(only call it an outlier if the stock is *also* moving more than its own normal range —
match this to whatever threshold you use for Signal 1 so the two stay consistent).
Re-run `test_drifty_intelligence.py` and add a case that pins this: a stock with a
sub-normal move and a minority same-direction count must NOT score outlier points.

## 2. Watchlist list has no item count (P1 — unblocks a frontend fix)

`GET /api/watchlists` returns `WatchlistOut { id, name, created_at }` — no way to tell
if a watchlist is empty without a second request per watchlist. This showed up as a
real UX complaint: the watchlist switcher dropdown looks like it only supports
"Rename" / "Delete" because there's nothing else to show for an empty watchlist, and
the frontend can't cheaply display "3 symbols" next to each name to make it obvious
switching there shows something.

**Fix:** add `item_count: int` to `WatchlistOut` and populate it in
`GET /api/watchlists` (a single query with a count per watchlist — don't N+1 it).
Keep the existing per-watchlist `GET /{id}/items` unchanged; this is just a cheap
summary field on the list endpoint.

## Workflow

`git fetch` before committing — another agent (Manus) is actively shipping frontend
changes to `App.tsx`, `ChartPanel.tsx`, and a watchlist-picker component in parallel
right now, so expect the frontend to be moving under you; stay on the backend files
above. Run the full backend suite before pushing and paste actual test output.
