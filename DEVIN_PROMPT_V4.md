# Task for Devin: Unify Drifty with the main attention engine (they currently disagree)

## The gap

Drift has **two separate, independent rule engines** computing "is this stock worth my
attention" — and they don't talk to each other:

1. **`backend/app/services/change_detection.py`** — the original engine. Computes
   `WatchlistItem.attention_score` / `has_attention` / `fired`, which drives the rail
   dots, the "Since you last looked" feed, watchlist sort order, and the drawer's
   "Why Drift surfaced this." Checks: price move vs. own volatility, unusual volume
   (`VOLUME_SPIKE_MULTIPLE = 2.0`), 52-week high/low proximity (`NEAR_52W_PCT = 0.03`),
   portfolio-level moves.

2. **`compute_drifty()`** in `backend/app/routers/watchlist.py` (~line 1050) — the newer
   self/peer/market engine behind the Charts view's Drifty panel. Checks: self-move
   magnitude, peer outlier status, market outperformance, cluster membership.

**These can disagree for the same stock at the same moment**, because:

- `compute_drifty()` hardcodes its own move-magnitude thresholds (`self_move_magnitude
  > 2.0` at line 1161, `> 1.0` at lines 1169 and 1198) instead of importing
  `MOVE_SENSITIVITY` / `MIN_MOVE_THRESHOLD` from `change_detection.py` — two
  independent numbers for the conceptually identical question "is this move unusual
  for this stock."
- `compute_drifty()` never looks at volume or 52-week proximity at all, even though
  it has the same `quote` object `change_detection.evaluate()` uses. A stock flagged
  in the main list purely for a volume spike or a new 52-week high shows up in the
  Charts view's Drifty panel with a low/zero score and no mention of why it's flagged
  in the list — the two panels tell the user different stories about the same stock.

This matters because a user who sees a stock **flagged in the list** and opens its
chart to understand why should see Drifty's analysis actually explain that flag, not a
disconnected second opinion.

## What to do

1. **Share thresholds, don't duplicate them.** In `compute_drifty()`, replace the
   hardcoded `2.0` / `1.0` comparisons with `change_detection.MOVE_SENSITIVITY` (or a
   shared constant either module imports) so both engines agree on what "unusual move"
   means by construction, not by two people remembering to keep two numbers in sync.

2. **Extend `compute_drifty()`'s signals to include volume and 52-week proximity**,
   using `change_detection.VOLUME_SPIKE_MULTIPLE` and `NEAR_52W_PCT` on the same
   `quote` object it already has. Add these as additional weighted signals with their
   own entries in `why_interesting`, alongside the existing self/peer/market/cluster
   ones. Don't touch `change_detection.py`'s "previously fired" mark-seen suppression
   logic — that's a deliberate, separate concern (it's what makes "mark as seen" work
   for volume/52-week facts that aren't naturally time-anchored); Drifty's endpoint is
   a stateless per-request read and can just report current state without that
   suppression.

3. **Add a consistency test**: for a stock where `change_detection.evaluate()` returns
   `attention: True`, assert `compute_drifty()` for that same stock/quote also returns
   `attention_score > 0` with at least one matching reason in `why_interesting`. This
   is the test that would have caught the gap above — it's testing agreement between
   the two surfaces, not just each one in isolation.

## What NOT to do

- Don't merge the two engines into one function. `change_detection.evaluate()`'s
  stateful "previously fired" tracking (so mark-as-seen actually clears a stale
  52-week-high flag) is a real, working design — leave it alone. The ask is *shared
  thresholds and complete signal coverage*, not a rewrite.
- Don't add ML/LLM scoring. Everything stays a named threshold someone could
  recompute by hand — that's the whole point of this product.

## Workflow

`git fetch` before committing. Run the full backend suite before pushing and paste
actual test output, not just a pass count.
