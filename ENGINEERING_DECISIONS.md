# ENGINEERING_DECISIONS.md

A running log of places where the easy fix and the correct fix diverged, and which one we picked and why. Updated the moment a decision is made — not reconstructed at the end.

---

### 2026-09-04 — Single demo account instead of real multi-user auth

**The easy path**: skip auth entirely, one global watchlist, no `user_id` anywhere.
**What we did instead**: one hardcoded demo account, but `user_id` is a first-class column on every table (`watchlists`, `watchlist_items`, `last_viewed_at`) from the very first migration.

**Why**: with a ~30-36 hour budget, building real signup/login/session management would eat hours that should go into the actual differentiator — the change-detection engine, which is what the brief is actually judging ("don't build the obvious watchlist"). But a true global-singleton design would mean *any* future multi-user support requires touching every table and every query. Threading `user_id` through now costs almost nothing today and turns "add real auth" into a follow-on feature instead of a rewrite. This is the deliberately-harder-than-strictly-necessary choice for a demo, made because it costs little now and avoids a much worse cost later.

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

### 2026-09-04 — Watchlist-vs-Nifty benchmark: a second, independent "meaningful"

**What it is**: `GET /api/watchlist/benchmark` compares the watchlist's average today's-move against Nifty 50's, alongside (not instead of) the per-symbol rule engine.

**Why it's a genuinely different answer, not decoration**: every rule so far judges a stock against *its own* history (its own trailing volatility, its own 52-week range). This judges the whole watchlist against *the market* — "your list is up 0.8% while Nifty is down 1.5%" is a fact none of the per-symbol rules can express, since a stock can be perfectly normal by its own standard while the whole portfolio is quietly out- or under-performing the market it sits in.

**The simplification, disclosed rather than assumed away**: Nifty 50 is a single fixed benchmark, not matched per stock's home exchange. A US-heavy watchlist compared against an Indian index is a real mismatch in principle — chosen anyway because (a) this is a Groww-hosted challenge, (b) the idea's own framing used Nifty as the example, and (c) per-market-matched benchmarking would mean picking and fetching a second or third index and deciding how to blend them, which is real added complexity for a comparison that's illustrative context, not a rule that flags anything. Simple beats clever here, and the limitation is written down, not hidden.

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
