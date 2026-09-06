# Task for Devin: Fill out the watchlist template library

## Context

`GET /api/watchlists/templates` and `POST /api/watchlists/templates/create` are live
and working (`backend/app/routers/watchlist.py` `TEMPLATE_METADATA`,
`backend/app/demo_user.py` `WATCHLIST_TEMPLATES`). Six templates exist today:
Technology, AI & Semiconductors, Indian Large Caps, US Mega Caps, Banking, EV &
Mobility — each five hand-picked symbols with a company name and a short note.

The original product spec called out a broader set, three of which were never
built: **Nifty 50, Pharma, Dividends**. Right now a user opening "Use a pre-made
watchlist" doesn't see those at all.

## What to do

Add three templates, following the exact existing pattern (both files, same shape):

1. **`nifty_50`** — 5 large, liquid NSE-listed names broadly representative of the
   index (e.g. RELIANCE.NS, HDFCBANK.NS, ICICIBANK.NS, INFY.NS, ITC.NS — pick real,
   currently-listed Nifty 50 constituents; don't reuse symbols already in
   `indian_large_caps` if you can help it, so the two templates aren't redundant).
2. **`pharma`** — 5 major pharmaceutical companies (a reasonable US/India mix, e.g.
   PFE, JNJ, SUNPHARMA.NS, DRREDDY.NS, CIPLA.NS).
3. **`dividends`** — 5 stocks generally known for consistent dividend payouts (e.g.
   JNJ, KO, PG, VZ, ITC.NS).

For each: add the tuple list to `WATCHLIST_TEMPLATES` in `backend/app/demo_user.py`
(symbol, company_name, note — note should say *why* it's in this template, matching
the tone of the existing entries like `"Core holding"` / `"AI infrastructure"`), and
add the matching `display_name`/`description` entry to `TEMPLATE_METADATA` in
`backend/app/routers/watchlist.py`.

Verify each symbol actually resolves via `fetch_symbol_stats` before considering a
template done — `create_watchlist_from_template` silently skips a symbol it can't
fetch data for (`continue` on `stats is None`), so a typo'd or delisted ticker won't
error, it'll just quietly produce a watchlist with fewer symbols than advertised.
Confirm each new template's `symbol_count` in a real `POST /templates/create` call
matches what you put in the tuple list (5), not less.

## Test

Extend the existing template test coverage (check `test_watchlist_crud.py` or
wherever `/templates` is currently tested) to assert:
- `GET /templates` returns 9 templates total, including the 3 new `template_name`
  keys.
- `POST /templates/create` for each new template returns a watchlist with
  `item_count` equal to the template's symbol count.

## Workflow

`git fetch` before committing. Run the full backend suite before pushing and paste
actual test output, not just a pass count.
