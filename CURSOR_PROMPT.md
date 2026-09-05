# Cursor prompt — backlog of out-of-scope asks

Standalone scratch file, safe to delete whenever it's no longer needed.
This consolidates everything the user asked for during the Claude session
that got explicitly deferred or scoped down for time — not vague ideas,
things that were actually requested. Stack: React + TypeScript + Vite
frontend (frontend/src/), FastAPI backend (backend/app/).

Work through these roughly in order. Each item says whether it's
frontend-only or needs a backend change — don't touch backend/app/ for
anything marked frontend-only.

---

## 1. Visual polish pass (frontend-only)

Drift needs a deeper visual polish pass. Current design: dark
charcoal/near-black surfaces (--bg #0a0b0e, --surface #121419), a violet
accent (--accent #8b7bf7) reserved for brand/focus/urgency (never used for
price direction — green/red own that), Inter font. Tokens are in
frontend/src/App.css :root.

Goal: more premium and sophisticated, not a generic AI-dashboard look.
- Audit frontend/src/App.css and frontend/src/components/*.tsx for:
  inconsistent spacing (a --sp-1..--sp-8 scale exists but isn't applied
  everywhere), weak typography hierarchy, any remaining "wall of identical
  cards" patterns, borders used decoratively rather than meaningfully.
- Tighten and unify spacing using the existing --sp-* scale.
- Push typography hierarchy further: the hero headline, drift-card primary
  %, and drawer primary % should feel unmistakably like the most important
  numbers on the page.
- Keep the existing component structure and class names where reasonable
  — this is a polish pass, not a rewrite.
- Test in a real browser (the drawer AND mobile width ~375px) before
  calling it done — don't just eyeball the CSS.

## 2. Guided first-look walkthrough (frontend-only)

The user asked for "a demo option that reloads it with a pre-done
walkthrough" — the reload part is done (POST /api/watchlist/reset via the
"Reset to sample" link re-seeds a curated watchlist: NVDA, TSLA, EA,
DKNG, RBLX, ETERNAL.NS, NYKAA.NS — see backend/app/demo_user.py). The
"walkthrough" part — an actual guided tour — was never built.

Add a lightweight, dismissible first-look tour that appears once after a
fresh demo login or a "Reset to sample," pointing out (in this order):
1. The "since you checked" hero — "this is what changed while you were
   away, not just your stock prices."
2. A drift card's since-last-view number vs. its price — "the % is the
   point, not the price."
3. The rail's quick-jump list + the new History nav item.
4. "Click any row to open its detail" (the drawer already gets a brief
   accent-ring flash on open — this tour reinforces it doesn't need to be
   discovered by accident).

Keep it to 3-4 steps max, skippable at any point, and store "seen the
tour" in localStorage (per-viewer UI state, not real data — don't add a
backend field for this). Don't build a generic tour library dependency;
a few positioned tooltip divs are enough for this scope.

## 3. Company identifiers in the add flow and rows (needs a small backend addition)

The original ask included "company logo/identifier where reliable" when
adding a stock and in the watchlist rows. Company name is already there
(WatchlistItem.company_name, captured from the autocomplete pick — see
frontend/src/components/AddStockForm.tsx and backend/app/schemas.py). A
visual logo/favicon was deliberately skipped for time.

If you pick this up: the honest approach is a favicon-style icon from a
domain, not a fabricated logo. yfinance's Ticker.info sometimes exposes a
`website` field — resolve a domain from that at add time (best-effort,
same pattern as company_name: nullable, never blocks the add if missing)
and store it, then render `https://www.google.com/s2/favicons?domain=...&sz=32`
(or an equivalent favicon service) client-side. Never fabricate a logo
when the lookup fails — fall back to the current ticker-only display,
same as company_name already does.

## 4. Deeper chart interactivity (needs a backend contract change — flag before starting)

The sparkline (frontend/src/Sparkline.tsx) is deliberately minimal: no
axis labels, no timeframe selector, hover shows price only (added this
session) with no real date, because backend/app/services/market_data.py
only ever returns the last 30 closes as bare floats
(SymbolQuote.spark_closes_json), no per-point dates. Faking a date next
to a real price would be worse than not showing one.

If real dates are wanted on hover: this means changing what
`GET /api/watchlist` returns for `quote.spark` — from `number[]` to
`{date: string, close: number}[]`. That's a real API contract change
touching every consumer of `spark` (Sparkline.tsx, DriftCard.tsx,
WatchlistRow.tsx, StockDrawer.tsx) and the backend's `spark_closes_json`
storage format. Don't do this quietly as part of a "polish pass" — it's
a deliberate, disclosed contract change, not a bug fix. Confirm the
approach before touching backend/app/models.py or
backend/app/services/market_data.py.

## 5. Accessibility pass beyond the login screen (frontend-only)

Antigravity already did a contrast + focus-ring pass on Login.css earlier
this session (verified: the muted text colors already pass WCAG AA at
5.45:1 — don't "fix" them again on a false contrast reading, see the git
log for that commit's reasoning). The main app (App.css, components/*)
never got the same treatment.

- Check `.drawer-close` (the ✕ button), `.wr-chevron`/`.dc-chevron`
  (icon-only), and the rail's `.rail-item`/`.rail-nav-item` buttons for
  real aria-labels, not just visual icons.
- Confirm every interactive element (rows, cards, chips, drawer controls)
  has a visible `:focus-visible` state, not just `:hover`.
- Run an actual contrast check (compute it, don't eyeball it — see the
  git log for the Python snippet used to verify Login.css's colors) on
  the tier-dot colors and rule-chip colors against their backgrounds.

## 6. Frontend test coverage (frontend-only)

Backend has real pytest coverage (backend/tests/) for the rule engine.
Frontend has none. Lower priority than the above, but worth adding:
- `lib/attention.ts` (attentionTier, latestViewedAt) — pure functions,
  easy to test directly.
- `lib/beginner.ts` (simplifyRuleMessage) — same.
- `format.ts` — formatPct/formatPrice/formatRelative edge cases (null
  values, negative numbers, unusual currency codes).
Use Vitest (already compatible with the Vite setup) — don't add a
different test runner.

---

## Explicitly out of scope — do not build these

These were considered and deliberately rejected, not just deferred. Don't
reintroduce them without the user asking again:

- **A full Koyfin-style app shell** (persistent sidebar with
  "Today's Markets" / "Dashboards" / "Analytics" / "Settings" sections).
  Drift has exactly one real view; a multi-section sidebar pointing at
  the same single screen is fake navigation. What exists instead (a
  quick-jump rail + a real History view) covers the legitimate use case.
- **A ⌘K command palette / "AI search bar."** The user explicitly said
  not to add one. The existing inline autocomplete search stays as-is.
- **A generic multi-widget market dashboard** (indices, news, economic
  calendar, etc.). Drift's thesis is "what changed since you looked," not
  "more market data" — anything that competes with that framing is scope
  creep, not polish.
