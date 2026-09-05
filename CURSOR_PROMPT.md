# Cursor prompt — production-readiness & UI/UX depth pass

Standalone scratch file, safe to delete whenever it's no longer needed.

You're picking this up cold with no memory of how Drift got built — this
file is meant to be self-contained enough that you don't need it. Read
the actual code before changing anything; don't take any claim below on
faith if the file it references tells you otherwise.

## What Drift is, in one sentence

Not "show me my stocks" — **"tell me what meaningfully changed since I
last looked, and let me safely ignore the rest."** Every UI decision
below should make that thesis more legible, not compete with it. If a
change makes the page busier without making "what changed" clearer or
faster to grasp, it's the wrong change, no matter how polished it looks.

## Ground rules (read before touching anything)

- **Frontend-only unless a section explicitly says otherwise.** Don't
  touch `backend/app/` — several sections below explain exactly why a
  backend change would be needed and why it's flagged separately instead
  of bundled into "polish."
- **No fabricated data, ever.** If a real data source doesn't exist for
  something (a date on a chart point, a company logo, a news headline),
  say so and fall back gracefully — don't invent a plausible-looking
  substitute. This app's whole credibility rests on "the number shown is
  the real number."
- **The rule engine is the single source of truth for what's meaningful.**
  `backend/app/services/change_detection.py` decides what fires and how
  urgent it is. Nothing in the frontend should introduce a second opinion
  about what's "worth attention" — reordering, regrouping, and rewording
  are fine; overriding is not.
- **Test what you build, in a real browser, before calling it done.**
  `npm run dev` in `frontend/`, `uvicorn app.main:app --reload --port 8000`
  in `backend/` (needs `backend/.venv` activated, or create one:
  `python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt`).
  Log in via "Try the demo." Check the drawer, the mobile width (~375px),
  and at least one empty state per feature you touch. Screenshots or it
  didn't happen.
- **Verify claims, including this file's.** Every "X already exists" below
  is accurate as of when this was written, but code moves. Grep first.

---

## 1. Visual design system — a real audit, not vibes

Current tokens live in `frontend/src/App.css` `:root`: a near-black
surface system (`--bg #0a0b0e`, `--surface #121419`, `--surface-2
#171a20`, `--surface-3 #1d2027`), a violet identity accent (`--accent
#8b7bf7`, reserved for brand/focus/urgency — **never** for price
direction, green/red own that), semantic green/red/amber, and a spacing
scale `--sp-1` (4px) through `--sp-8` (40px) that exists but isn't
consistently applied — plenty of components still hardcode `14px`,
`18px`, `22px` etc. directly.

Do this as an actual audit, not a rewrite:

1. **Grep every hardcoded pixel value** in `App.css` outside the `:root`
   block. For each one, decide: does it belong to the `--sp-*` scale (if
   so, snap it), or is it a genuinely one-off value (a border-radius, an
   icon size) that doesn't belong in a spacing scale at all? Don't force
   a bad fit just to use the token — document the exceptions inline with
   a one-line comment explaining why.
2. **Typography hierarchy.** Three numbers currently compete for "most
   important thing on this screen": the hero headline (`.hero-headline`,
   38px/800), a drift-card's primary % (`.dc-primary-value`, 26px/800),
   and the drawer's primary % (`.drawer-primary-value`, 34px/800). Confirm
   the visual weight actually descends in the right order for the context
   each appears in (page-level > card-level > focused-detail-level should
   probably NOT mean the drawer's number is the biggest of the three,
   since it's the most zoomed-in, most already-understood context — form
   your own view on this after looking at all three side by side, but be
   deliberate, not just "biggest look best").
3. **The "wall of cards" smell.** Two places were already fixed this way
   in an earlier pass — `watchlist-row` collapsed from N bordered boxes
   into one bordered container with hairline dividers
   (`.watchlist-rows`), same for `.history-list`/`.history-row`. Check
   `.drift-cards` (the hero attention feed) and the ignored-disclosure
   list with the same skepticism: is a grid of bordered boxes the right
   call there, or would the same "one container, internal dividers"
   treatment read as less generic? Drift cards carry more independent
   information per item (reasons, thesis, actions) than a watchlist row
   does — that's a real argument FOR keeping them as cards, not an excuse
   to skip the question.
4. **Motion inventory.** List every CSS `animation`/`transition` in the
   codebase (`grep -n "animation:\|transition:" frontend/src/App.css`).
   For each: what does it communicate, and is it necessary? The drawer's
   entrance (`@keyframes drawer-in`) carries a one-time accent-ring flash
   because removing the modal scrim made it easy to miss — that one has a
   documented reason. Any animation you find that's purely decorative
   (a hover lift with no functional purpose, a pulse that runs forever)
   is a candidate to cut, per this project's own stated principle: "avoid
   animation for decoration, every animation should communicate state."

Acceptance bar: after this pass, someone should be able to look at any
two components side by side and immediately tell which one the product
wants them to look at first, at a glance, without reading a single word.

## 2. Guided first-look walkthrough (frontend-only)

There's a `POST /api/watchlist/reset` endpoint (see
`backend/app/routers/watchlist.py`, wired to the "Reset to sample" link
in `WatchlistPanel.tsx`) that repopulates a fresh, curated demo watchlist
— NVDA, TSLA, EA, DKNG, RBLX, ETERNAL.NS, NYKAA.NS (see
`backend/app/demo_user.py` for the full curated list and the reasoning
for each pick). That's the "reload" half of what was asked for. The
"walkthrough" half — an actual guided tour of the product's ideas — was
never built.

Build a short, skippable, first-run tour (3-4 steps, no more) that
appears once after a fresh demo login or a "Reset to sample" click:

1. Point at the hero ("since you checked" headline): *this is what
   changed while you were away — not another list of your stocks.*
2. Point at one drift card's primary % vs. its price line: *the
   percentage is the point. The price is just context.*
3. Point at the rail: *jump straight to any stock, or check your History
   — everywhere you've looked before, and what's happened since.*
4. Point at a watchlist row: *click through — a detail panel opens
   without losing your place.* (The drawer already flashes an accent
   ring on open for exactly this reason — this step explains why, rather
   than leaving a first-time user to notice it by accident or not at all.)

Implementation notes:
- Store "has seen the tour" in `localStorage` (a per-viewer UI
  convenience, not real product data — do not add a backend field for
  this, do not make it part of `WatchlistItem` or `User`).
- Positioned tooltip/callout components anchored to real DOM elements
  (the hero, a drift-card, the rail, a watchlist row) are enough — don't
  pull in a tour library dependency for 4 steps.
- Make sure it's dismissible at every step (not just at the end), and
  that dismissing it doesn't throw away the "seen" flag — a user who
  skips step 1 should never see the tour again either, same as one who
  finishes it.
- Keyboard-operable (Escape to dismiss, Enter/Space to advance) and
  readable by a screen reader (it's introducing UI concepts — it should
  itself be at least as accessible as the UI it's introducing).

## 3. Company identifiers in the add flow and watchlist rows (small backend addition)

`company_name` already exists end-to-end (captured from the autocomplete
pick at add time — see `frontend/src/components/AddStockForm.tsx`'s
`picked` state and `backend/app/models.py`'s `WatchlistItem.company_name`,
nullable, best-effort, never blocks an add if missing). A visual
logo/favicon next to the ticker was part of the original ask and never
built.

The honest version of this is a favicon, not a fabricated logo:

- At add time (same place `company_name` gets captured), best-effort
  resolve a domain for the company. `yfinance.Ticker(symbol).info` often
  exposes a `website` field — this needs a backend change
  (`backend/app/routers/watchlist.py`'s `add_symbol`, or a new field on
  the same `stats` dict `market_data.fetch_symbol_stats` already returns).
  Add a nullable `WatchlistItem.website_domain` column the same way
  `company_name` was added (self-healing via `ensure_schema()` in
  `backend/app/database.py` — you don't need to hand-write a migration,
  just add the column to the model and it ALTERs itself on next boot,
  verified pattern already used twice in this codebase).
- On the frontend, render `https://www.google.com/s2/favicons?domain={domain}&sz=32`
  (or an equivalent public favicon service) next to the ticker in
  `WatchlistRow.tsx`, `DriftCard.tsx`, and the drawer header — small
  (16-20px), with `loading="lazy"` and an `onError` handler that just
  hides the `<img>` (don't show a broken-image icon; falling back to the
  current ticker-only text treatment is always acceptable, matches how
  `company_name` itself already degrades).
- Don't block the "Add" button on this resolving — it's decoration, not
  a dependency. If the favicon fetch is slow or fails, the row should
  look exactly like it does today.
- Watch out for favicon services rate-limiting or hot-linking policies
  changing — this is exactly the kind of external dependency that's fine
  for a hackathon demo and worth a one-line comment flagging the risk for
  whoever looks at this in production later.

## 4. Deeper chart interactivity (backend contract change — confirm before starting)

`frontend/src/Sparkline.tsx` is deliberately minimal: no axis labels, no
timeframe selector, and hover (added this session, see the `interactive`/
`onHover` props) shows only a price, never a date — because
`backend/app/services/market_data.py`'s `fetch_symbol_stats` only ever
returns the last 30 closes as bare floats
(`SymbolQuote.spark_closes_json`), with no per-point dates stored
anywhere. Showing a plausible-looking fake date next to a real price
would be strictly worse than showing no date at all.

If real per-point dates are wanted on hover, this is not a frontend
polish task — it's a real API contract change:

- `backend/app/services/market_data.py`: change `spark_closes` from
  `list[float]` to `list[{date: str, close: float}]` (the underlying
  `hist["Close"]` pandas Series already has a `DatetimeIndex` — the dates
  are sitting right there, just currently discarded via `.tolist()`).
- `backend/app/models.py`: `spark_closes_json` stores whatever shape you
  choose to serialize — update accordingly.
- `backend/app/schemas.py`: `QuoteOut.spark` changes from `list[float]`
  to a typed list of `{date, close}`.
- Every frontend consumer of `quote.spark` needs updating to match:
  `Sparkline.tsx` (the component itself), and every place that passes
  `values={item.quote?.spark ?? []}` — `DriftCard.tsx`,
  `WatchlistRow.tsx`, `StockDrawer.tsx`. `Sparkline` should accept the
  richer shape and use the real date in its hover tooltip instead of
  silently keeping the old index-only behavior.
- This changes a field every existing consumer already depends on — do
  it as its own commit with its own clear message, not folded silently
  into a "polish" commit. If you're not confident this is worth an API
  contract change for the value it adds, say so instead of guessing.

Do NOT build a timeframe selector (1D/1W/1M/1Y) on top of this without
also solving where the additional history data comes from —
`fetch_symbol_stats` only ever pulls a fixed `period="1y"` window
server-side and only ever returns the tail 30 points. A frontend
timeframe toggle with nothing behind it to actually fetch a different
window is exactly the kind of fake functionality this project has
consistently avoided — don't reintroduce that pattern here.

## 5. Accessibility pass on the main app (frontend-only)

`Login.css` already got a real pass earlier this session: a contrast
check was computed properly (not eyeballed — the actual WCAG relative-
luminance formula, run as a small Python script) which found the muted
text (`#868c97` on `#121419`) actually passes AA at 5.45:1, contradicting
an earlier claim that it failed at ~3.7:1. Focus-visible rings were added
to the login screen's three buttons. **Don't re-litigate that finding —
verify it yourself with the same rigor if you doubt it, don't just eyeball
it and "fix" a color that already passes.**

The main app (`App.css`, everything under `components/`) never got the
same treatment. Do this properly:

1. **Compute real contrast ratios**, don't guess. For every text/background
   pairing that isn't already covered (tier-dot colors against
   `--surface`, rule-chip colors, the `--faint`/`--muted` grays against
   every surface tone they appear on, not just `--surface`), run the
   actual luminance formula. If you find a real failure this time, fix
   the color and note the before/after ratio in a comment, the same way
   the Login.css fix documented its numbers inline.
2. **Icon-only controls need real names.** `.drawer-close` (the ✕
   button), `.wr-chevron`/`.dc-chevron` (visual-only affordance icons —
   check whether they're `aria-hidden` and whether their PARENT button
   has an accessible name that actually describes the action, not just
   the symbol name), the rail's `.rail-item`/`.rail-nav-item` buttons.
3. **Focus-visible, not just hover.** Every clickable row, card, chip, and
   drawer control should have a keyboard focus state that's at least as
   visible as its hover state — tab through the entire app (watchlist →
   add form → thesis chips → a drift card → the drawer → its thesis
   editor → remove confirmation) without touching the mouse and confirm
   you always know where focus is.
4. **Semantic structure.** Check heading levels are sane (is there ever
   more than one `<h1>`? does `<h2>`/`<h3>` nest logically inside
   sections?), and that the drawer's `role="dialog"` has proper focus
   management — does focus move INTO the drawer when it opens, and back
   to the triggering row when it closes? (Currently it does neither —
   this is a real gap, not a maybe.)

## 6. Frontend test coverage (frontend-only)

Backend has real pytest coverage (`backend/tests/test_change_detection.py`
— 44 tests covering every rule branch including the suppression logic
that fixes "mark as seen" not doing anything for structural facts like
52-week proximity). Frontend has zero automated tests. `package.json`
currently has no test runner configured at all — you'll need to add one.

Add Vitest (it's the natural fit for a Vite + React 19 + TypeScript
project — don't reach for a different runner):
```
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```
Add a `test` script to `package.json` and a minimal `vitest.config.ts`
(or a `test` block in `vite.config.ts`) with `environment: "jsdom"`.

Priority order, pure-logic functions first (cheap, high value, no
rendering needed):
- `lib/attention.ts` — `attentionTier` (verify the score/fired-length
  thresholds actually produce the three tiers correctly at the
  boundaries), `latestViewedAt` (empty array, all-null dates, mixed
  timezone-suffix handling).
- `lib/beginner.ts` — `simplifyRuleMessage` for every `rule` value the
  backend can actually send (`price_move` both the "since you last
  checked" and "today" phrasings, `unusual_volume`, `week52_high` both
  "new high" and "near" phrasings, `week52_low` same).
- `format.ts` — `formatPct`/`formatPrice`/`formatRelative`/
  `formatTimeOfDay`/`formatPoints`/`pctClass`, all with `null` inputs,
  negative numbers, and at least one non-USD currency code.

Then, if there's appetite for it, component tests for the two riskiest
pieces of interaction logic: `AddStockForm.tsx`'s `picked`-state clearing
(typing after a selection should drop the captured company name — this
has a real edge case around case-sensitivity worth locking down with a
test), and `useWatchlist.ts`'s auto-mark-seen-on-visibility-change effect
(this was the exact source of a real reported bug this session — "why
does everything show 0%" — because it used to fire for every
never-viewed item, not just attention-flagged ones; a regression test
here is worth more than almost anything else on this list).

---

## Explicitly out of scope — do not build these

These were considered and deliberately rejected during the session this
backlog came from, not just deferred for time. Don't reintroduce them
without the user asking again, even if they'd make for an impressive-
looking diff:

- **A full Koyfin-style app shell** — a persistent sidebar with
  "Today's Markets" / "Dashboards" / "Analytics" / "Settings" sections.
  Drift has exactly one real view; a multi-section sidebar pointing at
  the same single screen is fake navigation, and this project has been
  consistently strict about never shipping a nav item with nothing real
  behind it. What exists instead — a quick-jump rail (ticker + tier dot,
  jumps straight to that stock's drawer) plus a real History view (an
  actual event log, `GET /api/watchlist/history`) — covers the
  legitimate version of the same idea.
- **A ⌘K command palette / "AI search bar."** Explicitly rejected by the
  user mid-session. The existing inline autocomplete search
  (`SymbolInput.tsx`) stays exactly as-is.
- **A generic multi-widget market dashboard** — indices, news ticker,
  economic calendar, sector heatmaps, anything in that family. Drift's
  entire thesis is "what changed since you looked," not "more market
  data to scan." Anything that competes with that framing for visual
  real estate is scope creep dressed up as polish, not polish.
- **A timeframe selector on the sparkline with nothing behind it.** See
  section 4 — if you build the selector without the backend history to
  back it, you've built a UI that lies about what it can do.
