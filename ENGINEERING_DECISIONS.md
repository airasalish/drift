# ENGINEERING_DECISIONS.md

A running log of places where the easy fix and the correct fix diverged, and which one we picked and why. Updated the moment a decision is made — not reconstructed at the end.

---

### 2026-09-04 — Single demo account instead of real multi-user auth

**The easy path**: skip auth entirely, one global watchlist, no `user_id` anywhere.
**What we did instead**: one hardcoded demo account, but `user_id` is a first-class column on every table (`watchlists`, `watchlist_items`, `last_viewed_at`) from the very first migration.

**Why**: with a ~30-36 hour budget, building real signup/login/session management would eat hours that should go into the actual differentiator — the change-detection engine, which is what the brief is actually judging ("don't build the obvious watchlist"). But a true global-singleton design would mean *any* future multi-user support requires touching every table and every query. Threading `user_id` through now costs almost nothing today and turns "add real auth" into a follow-on feature instead of a rewrite. This is the deliberately-harder-than-strictly-necessary choice for a demo, made because it costs little now and avoids a much worse cost later.

**Update, later the same day, once the follow-on was actually worth doing**: real auth got built — see the entry below. The `user_id`-everywhere groundwork made it exactly the additive change this entry predicted, not a rewrite.

---

### 2026-09-04 — Real auth, built as the additive follow-on this was designed for

**What**: `services/auth.py` + `routers/auth.py` add real signup/login (bcrypt-hashed passwords, an opaque bearer token in a `sessions` table — not JWT, deliberately: no signing-key management, trivially revocable by deleting a row, and the one extra DB lookup per request is negligible next to the yfinance/Groq calls already on these paths). Every `watchlist`/`digest`/`benchmark` endpoint now requires it.

**Why now**: raised directly — "won't we need auth" — after a second opinion (Antigravity) flagged the single-account design as a gap. The original decision above stands on its own merits (protect build time for the actual differentiator), but the justification for *not* building it earlier — time pressure — eased once the core engine, resilience pass, and deployment were all done and verified. Worth being honest about the shape of this: this wasn't "the first decision was wrong," it was "the condition that made simple-for-now the right call stopped holding."

**Kept, deliberately, alongside real accounts**: a no-password `POST /api/auth/demo` login that resolves to the exact same seeded demo account/watchlist that existed before auth. Real per-user separation and a zero-friction "click the link, see it working" first impression aren't in tension — a cold visitor still needs zero setup, and anyone can also prove genuine data isolation by creating their own account.

**A real integration snag, solved rather than routed around**: `navigator.sendBeacon` (used by the auto-mark-seen-on-leave feature) cannot attach custom headers, so it can't send a normal `Authorization: Bearer` token. `get_current_user` accepts the token as a `?token=` query param as a second path, used only by that one call site — documented in both `auth.py` and `api.ts` so it doesn't look like an accidental inconsistency later.

**Verified thoroughly, not just "it typechecks"**: signup, wrong-password rejection, duplicate-username rejection, weak-password rejection, and — the actual point of the whole feature — two independently signed-up users (`alice`, `bob`) confirmed to see genuinely separate watchlists (`bob`'s came back empty while `alice`'s showed the stock she added). Also verified the query-param token path works with curl before trusting the frontend beacon call to use it correctly. Then drove the real UI end-to-end in-browser: signed up, added a stock, logged out, logged back in, confirmed the exact same watchlist came back.

**A real incident this shipped with, found and fixed the same day**: right after deploying, the pre-existing demo account's watchlist started 500ing (fresh signups were unaffected). Root cause, found via a temporary global exception handler since Render's logs weren't directly accessible: `ValueError: Out of range float values are not JSON compliant: nan`. A genuine `NaN` had ended up in a stored `SymbolQuote` row (yfinance can return one for a still-forming intraday bar) — and NaN is silently *truthy* in Python, so every `if value:` guard in this codebase let it straight through; it only became a hard error at JSON-encoding time, after the route function had already returned successfully, which is exactly why a route-level `try/except` couldn't catch it. Fixed at both ends: `market_data.py` now strips NaN to `None` at the source (same "mark it missing, don't pretend it's real" rule already applied to stale/failed fetches elsewhere), and a read-time sanitizer in `watchlist.py` cleans any NaN already sitting in stored rows so already-broken data self-heals immediately rather than waiting for the next poll cycle to overwrite it. Also added a permanent (not temporary) global exception handler that logs unhandled errors server-side but never leaks tracebacks to the client — the diagnostic version briefly did, deliberately reverted once identified, since that's a real information-disclosure risk on a public API.

**Verified the fix, not just the theory**: reproduced the exact failure locally — manually wrote a `NaN` into a stored quote's `price`/`week52_high` (matching the production incident precisely), confirmed it 500'd the same way, applied the fix, confirmed it now returns 200 with `null` in place of the NaN.

---

### 2026-09-04 — CORS was only trusting one URL; Vercel gives every deploy its own

**What happened**: a real "Failed to fetch" reported live, traced via the browser's own console (not guessed) to: `Access to fetch ... has been blocked by CORS policy`, with the request's origin being a Vercel *per-deployment* URL (`https://drift-<hash>-airasalishs-projects.vercel.app`), not the stable alias in `ALLOWED_ORIGINS`. Vercel gives every single deployment its own unique subdomain in addition to the stable one — clicking "Visit" on any deployment in the Vercel dashboard, a completely normal thing to do, lands on one of these and was silently CORS-blocked.

**Fix**: added `allow_origin_regex` (env-configurable, `ALLOWED_ORIGIN_REGEX`) alongside the existing exact-match `ALLOWED_ORIGINS`, trusting the whole project's subdomain space (`https://.*-airasalishs-projects\.vercel\.app`) rather than one hardcoded alias. The exact-match list still covers the stable alias; the regex covers every deployment URl Vercel will ever generate for this project, past or future, without needing a config change on every deploy.

**Verified the pattern isn't over-permissive, not just that it matches**: tested it against the real per-deployment URL (matches), the stable alias (matches, via the separate exact list), and two adversarial cases — a lookalike domain with the pattern as a *prefix* of a longer attacker-controlled hostname, and someone else's unrelated Vercel project — both correctly rejected. Then verified against the actual running CORS middleware (not just the regex in isolation) for all three real cases: preflight succeeds with the correct `Access-Control-Allow-Origin` echoed back for the deployment URL and the stable alias, and correctly fails (400, no header) for an unrelated origin.

---

### 2026-09-04 — First NaN fix was incomplete

**Found by testing against production again, not by assuming green**: the deployed fix still 500'd on the demo account, now with a clean generic message from the new safe handler instead of a raw crash, which itself confirmed the deploy landed but the bug wasn't fully closed. The gap: `added_price`/`price_at_last_view` live on `WatchlistItem`, not `SymbolQuote` — both are snapshots captured from `quote.price` at some point in the past, so either could carry a NaN captured before the source-level fix existed, and my first read-time sanitizer only touched the quote table. Also found a NaN could be baked into the *stored JSON string* for the sparkline (`json.loads` parses a literal `NaN` token back into a real `float('nan')`). Added `_sanitize_item()` for the watchlist-item fields and a filter on the loaded spark list, then re-verified locally with NaN injected into all three places at once (quote price, item snapshots, and an embedded NaN in the spark JSON) before redeploying.

**Split deliberately to avoid a repeat of the earlier accidental-commit incident**: backend (`models.py`, `services/auth.py`, `routers/auth.py`, `demo_user.py`, `routers/watchlist.py`) plus the thin, functional-but-unstyled `Login.tsx`/`Login.css`/`main.tsx` pieces needed to make the feature actually usable end-to-end, rather than leaving it half-wired while `App.tsx`/`App.css` were mid-edit from a concurrent session. `Login.css` is its own file specifically so there's zero line-overlap risk with `App.css`.

---

### 2026-09-04 — Rule-based change detection instead of ML/LLM scoring

**The easy/flashy path**: run each symbol's data through an LLM to decide "is this meaningful" — sounds smart, demos well in a screenshot.
**What we did instead**: explicit, numeric, auditable rules (volatility-adjusted price-move threshold, volume-vs-trailing-average, 52-week high/low cross), each contributing to a plain-sum attention score.

**Why**: the brief explicitly says "be ready to explain why." A rule-based system can be defended line by line in front of a judge — "this fired because the move was 1.7x the stock's own daily average, here's the exact number." An LLM-scored system would have to explain itself by re-asking the LLM, which is not an explanation, it's a re-guess. Full spec in [PROJECT_BRIEF.md](PROJECT_BRIEF.md#1-what-counts-as-a-meaningful-change-rule-based-not-vibes).

---

### 2026-09-04 — SQLite for local dev, not a required Postgres install

**The "more correct-looking" path**: require Postgres per the brief's own architecture section, matching what the research showed as the common pattern.
**What we did instead**: SQLAlchemy against SQLite by default (`DATABASE_URL` env var), zero external services to install. Swapping to Postgres for real deployment is a one-line connection-string change — the ORM layer doesn't know or care which it's talking to.

**Why**: whoever runs this from "Instructions to Run" shouldn't need to install and configure a Postgres server just to see the demo. The brief's own §6 says "keep things simple where possible" — this is that principle applied to the one place it costs a reviewer real time for zero learning value.

---

### 2026-09-04 — Considered and declined: an LLM layer (Groq) on top of the rule engine

**Available but not used**: pooled Groq API keys were offered as a free, fast inference option, and explicitly left as our call.
**What we did instead**: nothing — the change-detection pipeline stays pure rule-based, as originally decided.

**Why**: the single strongest thing this build can say in a live Q&A is that every flagged signal is a real, checkable number — "this fired because the move was 1.7x its own daily average." An LLM layered onto the *detection* logic would undermine that specific defensibility, and even layered only onto *explanation* text, it adds new failure surface (latency, rate limits even across pooled keys, another dependency to explain) at the exact moment the deadline is tightest — and it doesn't fix any gap the rule engine actually has. Revisiting only if core polish, deployment, and resilience work all land with time to spare, and only as a strictly optional, gracefully-degrading addition that never gates the core feature.

**Update, same day, once the above conditions were actually met**: built it, scoped narrowly. `services/digest.py` calls Groq (`openai/gpt-oss-20b`) only to rephrase the already-computed rule signals into one readable paragraph — it never decides what's flagged, and the system prompt explicitly forbids inventing a causal "why" a price moved, since we have no real news source to back that up and a hallucinated cause in a finance-adjacent app is a real credibility risk, not a style choice. It's called on demand via an "Explain this" button, not on every background poll — no reason to spend an LLM call on a page just sitting open. Any failure (bad key, rate limit, timeout) returns `null`, and the frontend falls back to showing nothing extra; the per-item rule messages remain the source of truth either way. This doesn't reverse the original decision — the detection engine is still 100% rule-based — it just adds a presentation-layer feature on top, which is exactly the boundary the original decision was drawn around.

---

### 2026-09-04 — Symbol search uses Yahoo's real search index, not an LLM

**The tempting shortcut**: the user has Groq keys sitting right there, already wired up — ask the model to resolve a company name (e.g. "TCS") to a ticker symbol.
**What we did instead**: `routers/symbols.py` calls `yfinance`'s `Search`, which queries Yahoo's own search index of actually-listed securities.

**Why**: this surfaced from a real bug report — typing "TCS" in the add-symbol field did nothing useful, because Yahoo's data needs the exchange suffix (`TCS.NS` for NSE). An LLM asked to resolve that could produce a plausible-looking wrong answer (wrong suffix, delisted ticker, a same-named but different company) with no way to tell it was wrong short of calling the real data source anyway to verify — at which point the LLM step adds latency and a hallucination risk for zero benefit. Same principle as the digest feature: don't ask a model to produce a fact a real, verifiable source already provides. Also caught two bugs building this: the symbol-length regex was capped at 10 chars, which silently rejected real symbols like `BAJFINANCE.NS` (13 chars) the moment someone selected a real search result; and every stock was labeled with a `$` regardless of what it actually traded in, which is a real correctness bug once non-US exchanges are reachable, not a cosmetic one, e.g. TCS.NS showing "$2304.00" instead of "₹2,304.00". Fixed by pulling the real currency from `yfinance` (`fast_info.currency`) and formatting with `Intl.NumberFormat`, rather than hardcoding a currency symbol.

---

### 2026-09-04 — Production broke on this exact currency-column change, and here's the real fix

**What happened**: adding the `currency` column above broke production with a real 500 on `GET /api/watchlist`. Root cause: `Base.metadata.create_all()` only creates tables that don't exist yet — it does nothing for a column added to a model whose table is already there. Every local test always ran against a freshly-deleted SQLite file, so this exact failure mode never got exercised until it hit Postgres, which has been running continuously since before the column existed.

**The honest-but-limited fix**: `database.py:ensure_schema()` now diffs each model's columns against the live database and issues `ALTER TABLE ... ADD COLUMN` for anything missing, on top of `create_all()`. This is deliberately *not* a real migration system — no down-migrations, no handling for a renamed or retyped column, nothing versioned. It only covers the one thing this project has actually ever done to its schema: add a new nullable column. That's the honest scope, not an oversight — a hackathon project doesn't need Alembic, but it does need to not silently 500 in production the next time a column gets added, which is exactly what happened once already.

**Verified properly, not just patched and hoped**: reproduced the exact drift locally — created a fresh DB, manually dropped the `currency` column to simulate production's actual state, confirmed the endpoint 500s, ran the fix, confirmed the column gets added back and the endpoint returns 200. Didn't just push a plausible-looking fix at production a second time.

---

### 2026-09-04 — Closed a real gap between the written spec and what got built: auto-mark-seen on leave

**What an external review (Antigravity) caught**: the "seen" mechanic requires a manual button click, which the reviewer called a UX gap that "breaks the core promise." Their suggested fix (auto-mark on page *load*) would have been wrong — it resets the diff before the user has even read it, defeating the point. But the underlying catch was real: `PROJECT_BRIEF.md` §3 already said the trigger should be *"leaving the page / dismissing the feed"* — two triggers were written down at the start, only one was ever built.

**What we did**: a `visibilitychange` listener fires when the tab is hidden or closed, and calls the seen endpoint via `navigator.sendBeacon` (not a normal `fetch`, which can get cancelled mid-flight during unload) for every item that's currently flagged or has never been viewed. Non-flagged, already-viewed items are left alone, so a brief alt-tab doesn't quietly reset baselines the user hasn't actually acted on.

**Also corrected, not adopted**: the same review claimed watchlist state is "local/session-based" with no cross-device persistence. That's factually wrong about this codebase — there's no localStorage/cookie use anywhere for watchlist data, it's 100% server-side Postgres, which is exactly why the same data shows up identically from curl, this browser, or any other device hitting the same backend. A black-box review of a live site can't see that from the outside; worth taking external feedback seriously without taking it uncritically.

**Verified, not assumed**: forced a real item into a flagged state, loaded the actual page, dispatched a real `visibilitychange` event, then checked the backend directly — `has_attention` flipped false and `last_viewed_at`/`price_at_last_view` updated, entirely from the tab-hide event, no button click.

---

### 2026-09-04 — Two rule-engine additions (from Antigravity, tested and adopted)

**What was added, in `change_detection.py`**: (1) an intraday-move-from-prev-close rule that only runs when there's no `price_at_last_view` yet — closing a real gap where a freshly-added symbol could move sharply on its first day and never trigger the price-move rule at all, since that rule needs a last-view baseline that doesn't exist yet; (2) a "within 3% of its 52-week high/low" tier, firing at 0.6× the weight of an actual new extreme, surfacing a stock approaching one before it crosses.

**Why adopted rather than reverted**: these came from Antigravity working on the frontend, which went further than asked and touched the backend rule engine directly — outside the scope it was given. Rather than reject it on process grounds alone, it got the same bar as anything else in this file: read the diff, understand the reasoning, verify it. Both additions are correctly mutually exclusive with the existing rules (the new price rule is an `elif`, not an `if` — it cannot double-fire alongside the baseline-based rule), matching the file's existing style (named constants, no magic numbers).

**Verified before trusting it**: wrote unit tests directly against `evaluate()` for both additions — fresh item with a real intraday move fires, fresh item with a small move doesn't, an item *with* a real baseline doesn't also trigger the fallback rule (confirming the `elif` actually holds), exact 52-week-high hit scores full weight, within-3% scores 0.6× weight, and beyond 3% doesn't fire at all — plus one live end-to-end check against the running API (added AAPL fresh, got a real "Down 2.2% today from yesterday's close" back, not a mocked value). `PROJECT_BRIEF.md §1` updated to describe both rules; this file logs the rest.

---

### 2026-09-05 — Multiple watchlists per user, additive API design

**The easy/obvious path**: replace the existing `/api/watchlist/*` routes with `/api/watchlists/{id}/*` — one canonical watchlist-scoped surface, delete the old single-watchlist endpoints. This is what a clean-slate design would do, and it's what most projects would ship.

**What we did instead**: kept the existing `/api/watchlist/*` routes exactly as they are (they resolve to the user's default watchlist, the first one ever created), and added new `/api/watchlists` (CRUD) and `/api/watchlists/{id}/*` (watchlist-scoped items/digest/benchmark/history/reset) endpoints alongside them. The frontend uses the new multi-watchlist-aware endpoints when an active watchlist is set, and falls back to the single-watchlist endpoints for single-watchlist users (including brand-new users who still see exactly one watchlist with zero extra UI).

**Why**: this touches nearly every route in the file. A breaking change would mean any incomplete frontend migration — a missing watchlist_id parameter, a forgotten update to a digest call — fully breaks the app. An additive approach means if anything in the frontend migration is incomplete or buggy, the app doesn't fully break — it just doesn't show multiple watchlists yet. The old routes still work, the single-watchlist experience still works, and the only observable gap is "the new feature isn't visible yet," not "the app is 500ing." Given the scope of this change (every watchlist-scoped route), that safety margin is worth the small API surface cost.

**Additional invariant enforcement**: the deletion endpoint explicitly blocks deleting a user's last remaining watchlist — there must always be at least one. This matches the invariant `get_or_create_watchlist_for_user` previously guaranteed implicitly (it always resolved to exactly one watchlist), and the new guard makes that invariant explicit and enforced at the API level.

**Ownership validation**: watchlist ownership is enforced via 404, not 403 — if a watchlist exists but belongs to another user, accessing it returns "not found." This matches the existing pattern used elsewhere in this router (missing items also 404), keeping the error surface consistent.

**Frontend placement decision**: the watchlist switcher lives in the QuickAccessRail (the left-side context navigation), not the Header. The rail is already the "context navigation" surface (Watching/History live there), while the Header is account chrome. This keeps watchlist switching with the other context choices, not with logout/settings.

**Verified thoroughly**: 
- Backend: 53 tests pass (47 existing + 6 new). The new tests cover watchlist CRUD operations, ownership validation (404 for cross-user access), and the delete guard (can't delete last watchlist).
- Frontend: 20 tests pass (all existing). No new frontend tests were added — the existing attention/format/beginner tests still pass, confirming the multi-watchlist changes didn't break the core display logic.
- Manual browser test: created a second watchlist, added different symbols to each, switched between them, deleted one (with the confirm-remove dialog pattern matching the existing codebase convention), and verified the single-watchlist experience is unchanged for users with only one watchlist.

**Zero-friction default preserved**: a brand-new or demo user still sees exactly one watchlist with no extra UI to understand first. The watchlist switcher only appears when a user has >1 watchlist — multiple watchlists is an opt-in power feature, not a forced upgrade to the onboarding flow.

---

### 2026-09-04 — Watchlist-vs-Nifty benchmark: a second, independent "meaningful"

**What it is**: `GET /api/watchlist/benchmark` compares the watchlist's average today's-move against Nifty 50's, alongside (not instead of) the per-symbol rule engine.

**Why it's a genuinely different answer, not decoration**: every rule so far judges a stock against *its own* history (its own trailing volatility, its own 52-week range). This judges the whole watchlist against *the market* — "your list is up 0.8% while Nifty is down 1.5%" is a fact none of the per-symbol rules can express, since a stock can be perfectly normal by its own standard while the whole portfolio is quietly out- or under-performing the market it sits in.

**The simplification, disclosed rather than assumed away**: Nifty 50 is a single fixed benchmark, not matched per stock's home exchange. A US-heavy watchlist compared against an Indian index is a real mismatch in principle, but per-market-matched benchmarking would mean picking and fetching a second or third index and deciding how to blend them — real added complexity for a comparison that's illustrative context, not a rule that flags anything. Simple beats clever here, and the limitation is written down, not hidden.

**Verified, not assumed**: checked both index symbols actually resolve via the existing `yfinance` wrapper before picking one (`^GSPC` and `^NSEI` both tested live), confirmed the benchmark is fetched even with zero watchlist items (unconditional poll, not tied to any user's list), and hand-checked the arithmetic against real numbers (AAPL+NVDA averaging -0.46% against Nifty's +0.10% correctly nets to -0.56% underperformance).

**Frontend display**: not yet wired up — `App.tsx`/`App.css` are mid-edit from a separate, concurrent session (Antigravity) as of this writing, so the display piece was handed to it as a task rather than risking a conflicting edit to the same files.

---

### 2026-09-04 — Only poll symbols actually on a watchlist; true popularity-weighting deferred

**The full version per the brief's §5**: per-symbol polling frequency weighted by how many users watch it.
**What we actually built**: only symbols present on at least one watchlist are polled at all (the important half of "don't waste calls on nothing"); a `watch_count` column exists on the quote-cache table so frequency-weighting is a follow-on query change, not a rearchitecture.

**Why**: real popularity-weighted scheduling needs multiple concurrent users with different watchlists to even demonstrate — not achievable credibly in a single-demo-account build under this deadline. Disclosed here rather than silently claimed as done.

---

### 2026-09-04 — Deploying frontend and backend separately, not as one service

**The simpler-sounding path**: deploy everything as one process somewhere.
**What we're doing instead**: static frontend on Vercel; FastAPI backend on Render (or equivalent) with the *deployed* instance switched from SQLite to a free Postgres, while local dev keeps SQLite.

**Why**: Vercel's serverless model can't host our backend as-is — its functions are short-lived and stateless, which breaks two things our design depends on: the long-running background poller (an asyncio loop that has to keep running between requests) and SQLite's on-disk file (serverless filesystems are ephemeral, so the db would reset on every cold start). Rather than redesign the backend around a platform constraint, we deploy it somewhere that supports a persistent process, and use the one-line env-var swap already built into `database.py` to point the deployed copy at real Postgres instead of a file that wouldn't survive a restart. Demo link is optional per the actual rules, but a broken/reset demo would look worse than no demo, so we don't cut this corner if we ship one at all.

---

### 2026-09-05 — Redesigned around attention, not tickers

**What was wrong, concretely**: the watchlist read as a spreadsheet (ticker, price, since-added, alphabetical), and `GET /api/watchlist/benchmark` — a real, already-working endpoint — was never rendered anywhere in the UI. The product's actual thesis ("what changed since I looked") was buried under a table that looked like every other CRUD dashboard.

**What changed**: a "since you left" hero is now the dominant surface, not a small section above the table — it's the first thing rendered, uses `latestViewedAt()` (the most recent `last_viewed_at` across all items — there's no app-level "last visit" concept server-side, so this is the honest proxy, not a fabricated session timestamp) to phrase "since you checked at 6:42 PM," and wires the benchmark endpoint into a compact market-context line for the first time. The watchlist itself now groups by attention tier (needs-attention / worth-checking / quiet, derived client-side from the rule engine's own `attention_score` and `fired` count — see `lib/attention.ts` — never re-deciding what's meaningful, only how urgently to display something the backend already flagged), sorted by score, not alphabetically. Every sparkline can now show a dashed "you were here" reference line at `price_at_last_view`'s height — deliberately not tied to a specific x-position, since the data doesn't actually say which point in a 30-day series corresponds to the exact moment of the last view; a value-only marker is what the data honestly supports.

**Two small, additive backend changes came out of this, not contract breaks**: `PATCH /api/watchlist/{id}` (edit a thesis after adding it — previously only settable at creation) and an optional `?symbol=` filter on `GET /api/watchlist/digest` (lets the new detail drawer ask for a per-stock explanation instead of the whole feed's). Both are pure additions — every existing call site keeps working with zero changes.

**Considered and declined: a full Koyfin-style sidebar (Today's Markets / Dashboards / Analytics / Settings)**. Drift has exactly one real view. A multi-section nav pointing at the same single screen is fake navigation, and this project has been consistently strict about never shipping a nav item with nothing real behind it — the same discipline that kept the LLM out of the detection logic applies here. What shipped instead: a compact quick-jump rail (ticker + tier-color dot, jumps straight to that stock's detail panel — genuinely useful, not decorative) plus a real second destination once one existed to build (History, logged separately below). A ⌘K command palette was raised and explicitly rejected too — the existing autocomplete search already does the job; a command bar duplicating it would be chrome, not new capability.

**The drawer became non-modal, deliberately**: no dimming scrim over the rest of the page. The watchlist (and the rail) stay fully interactive while a stock's detail panel is open, so switching between stocks is one click instead of close-then-reopen. This trades away the free "click outside to close" affordance a modal gets for free, which is why the drawer now carries a brief one-time accent-ring flash on open (fades within ~250ms) — without a scrim announcing "something opened," that was otherwise easy to miss if you weren't already looking at the right edge of the screen.

**Verified in a real browser, not just a clean `tsc`/build**: added a real symbol through the actual autocomplete, confirmed the hero, tier grouping, benchmark line, and "you were here" marker all render against live backend data; resized to a 375px mobile viewport and confirmed the layout reflows into a real stacked design rather than a squeezed desktop table.

---

### 2026-09-05 — "Mark as seen" did nothing: two separate bugs, not one

**Reported plainly**: a stock sitting near its 52-week high stayed in the attention feed no matter how many times it was marked seen. Separately, a user who added several stocks and then switched browser tabs even once came back to find *every single one* showing "+0.0% since last view" — as if everything had been silently pre-acknowledged.

**Root cause #1 — the rule engine had a real inconsistency, not a display bug**: `price_move` is correctly anchored to `price_at_last_view` (it naturally stops firing once that baseline updates). `unusual_volume` and the 52-week-proximity rules are *not* anchored to anything — they're facts about the current quote, evaluated fresh on every request, with no memory of what was already true last time you looked. A stock sitting within 3% of its 52-week high stays within 3% of it for as long as it stays there, so the rule fired identically before and after "mark as seen," and the button visibly did nothing.

**Fix**: added `WatchlistItem.fired_rules_at_last_view` (a JSON array of structural rule keys — `unusual_volume`, `week52_high_exact`, `week52_high_near`, `week52_low_exact`, `week52_low_near` — snapshotted at mark-seen time) and taught `change_detection.evaluate()` an optional `previously_fired` parameter: a structural rule already in that snapshot no longer contributes to score or `fired`, but the exact same fact re-fires the instant it becomes *more* true (a stock upgrading from "near" its 52-week high to an actual new one is real new information and must not be swallowed by the same suppression that correctly hides "still near it, same as before"). `price_move` is untouched by this — it was never the broken rule.

**Root cause #2, found while fixing #1**: the auto-mark-seen-on-tab-hide effect (`useWatchlist.ts`) fired for *every never-viewed item*, not just ones currently flagged. Adding a batch of stocks and switching tabs even once — including just to take a screenshot — silently established a 0%-change baseline for all of them before anyone had actually looked, which is exactly what produced "why does everything show 0%." Fixed by dropping the never-viewed clause entirely: only items currently in the attention feed get auto-acknowledged on tab-hide now, matching the actual intent ("you had it in front of you, leaving is a real acknowledgment") instead of the accidental broader behavior.

**Verified both, live, not just via new unit tests**: four new tests cover the suppression directly — a near-52-week-high fact gets suppressed once "seen," the identical fact re-fires if nothing changed and the snapshot is empty, an upgrade from "near" to a genuine new high still fires despite a prior "near" snapshot, and `price_move` ignores a `previously_fired` set entirely (44 → 47 backend tests). Then, live in a real browser: force-flagged four items, dispatched a real `visibilitychange` event via the console, confirmed via the network tab that exactly the four flagged items got a `/seen` call — not all seven on the watchlist — and confirmed on reload that the three untouched quiet items still read `—` for since-last-view while the four acknowledged ones correctly read `+0.0%`.

---

### 2026-09-05 — History and Beginner Mode: additions to the display layer, not the decision layer

**History** (`GET /api/watchlist/history`, a new `SeenEvent` table written on every mark-seen) is a real, browsable timeline of when you looked at each stock and what it was doing then — not a placeholder nav section. It exists specifically because "Drift remembers where you were" was a claim the product made without anywhere to actually show it; this is that claim made checkable.

**Beginner Mode** (`lib/beginner.ts`, a client-side toggle) rewords the same rule-engine output in plainer language — "Close to its highest price all year" instead of "Within 2.6% of its 52-week high." It changes zero backend behavior and touches no scoring or firing logic; it is purely a presentation-layer remap keyed off the `rule` field the backend already sends. Worth stating plainly since it would be easy to mistake for a step toward "let something softer decide what's shown": it isn't. The rule engine still decides everything; this only decides how to phrase a fact it already decided.

**Verified**: both features were tested against a live watchlist with real fired rules (not fixtures) before being called done — a real "mark as seen" produces a real History row with a real then/now price comparison, and toggling Beginner Mode on and off against the same live item confirms the underlying `fired` data never changes, only its rendered text.

---

### 2026-09-05 — Demo reliability: the seed basket got wider on purpose, not for variety

**The real risk**: the rule engine runs against genuinely live market data — nothing in this codebase fakes a signal. That means a five-symbol demo watchlist could coincidentally have every single symbol sitting quietly (no unusual volume, nowhere near a 52-week extreme, no large move) at the exact moment a judge clicks "Try the demo." If that happens, the guided first-look tour's entire "here's what actually drifted" step has nothing real to point at — not a bug, just bad luck, but bad luck at the worst possible moment.

**What we did**: widened the curated seed from 5 to 9 real symbols (`backend/app/demo_user.py`), and picked the two additions by checking live data rather than guessing — as of when they were added, `IRCTC.NS` was within ~1% of its actual 52-week low and `SWIGGY.NS` was trading at ~13x its 20-day average volume, both real, both reliably checkable, and both names a young Indian retail investor recognizes immediately. Widening the basket makes "everything happens to be quiet at once" far less likely without fabricating a single number to guarantee it.

**The tour itself got a real gap closed, not just louder seed data**: the guided tour's "the % is the point" step only existed if a drift card was actually rendered — an all-quiet watchlist silently dropped the tour's central idea instead of explaining it, which is the same failure mode as the seed-basket risk above, just in the UI instead of the data. Added a second, mutually exclusive step anchored to the calm-state copy itself ("quiet is a real feature — filtering out normal noise is the point, not a fallback for an empty demo"), so the tour explains the actual current state honestly instead of assuming a drifted stock will always be there to point at.

---

### 2026-09-05 — Coordinating multiple AI collaborators on one shared local repo, again

**What happened, same pattern as the earlier Antigravity coordination entry**: over one extended session, work got split across this assistant, Cursor, and Manus — all pointed at the same local working directory at different points, sometimes overlapping in time. A live CSS hot-reload was observed mid-session from a second, unannounced editor before it was confirmed which tool it actually was.

**The rule that held**: before staging or committing anything, check `git status` for exactly which files are actually dirty, and never `git add` broader than the specific files a given change was meant to touch — a partial-file `git add` is what kept one collaborator's uncommitted, in-progress work (CSS files mid-redesign) from being swept into an unrelated commit, the same failure mode as the original Antigravity incident this pattern was written to prevent. When a `git push` was rejected as non-fast-forward, the fix was `git fetch` + inspect the incoming commit's diff before merging — never force-push over work another collaborator had already pushed.

---

### 2026-09-06 — One definition of "unusual", shared by both attention surfaces

**The gap**: two rule engines answered "does this stock deserve attention" independently. `change_detection.evaluate()` (rail dots, "since you last looked", watchlist sort) used `MOVE_SENSITIVITY`/`MIN_MOVE_THRESHOLD`, volume spikes and 52-week proximity; `compute_drifty()` (the Charts view's Drifty panel) hardcoded its own `2.0`/`1.0` move-magnitude cutoffs and looked at neither 52-week proximity nor the shared volume constant. A stock flagged in the list purely for a new 52-week high opened its chart to a Drifty panel scoring it near zero — the two panels told the user different stories about the same quote at the same moment.

**The easy path**: bump Drifty's constants to match by hand, and add a comment asking the next person to keep them in sync.
**What we did instead**: `change_detection.unusual_move_threshold()` is now the single function both engines call, and Drifty reads `VOLUME_SPIKE_MULTIPLE` and `NEAR_52W_PCT` directly rather than restating them. Agreement is structural, not a thing two people have to remember.

**What we deliberately did not do**: merge the engines. `evaluate()`'s `previously_fired` suppression is what makes "mark as seen" clear a stale 52-week-high flag for facts that aren't time-anchored on their own — a real bug fix, and a stateful concern that has no business in Drifty's stateless per-request read. Drifty reports current state; only the list suppresses.

**The test that would have caught it**: `TestEngineConsistency` asserts agreement between the two surfaces rather than each in isolation — for a stock `evaluate()` flags, `compute_drifty()` must score above zero *and* name the same rule in `why_interesting`. A second test retunes the shared constants at runtime and asserts Drifty's output follows, so re-hardcoding a threshold fails the suite.
