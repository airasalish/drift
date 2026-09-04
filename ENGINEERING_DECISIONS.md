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

### 2026-09-04 — Only poll symbols actually on a watchlist; true popularity-weighting deferred

**The full version per the brief's §5**: per-symbol polling frequency weighted by how many users watch it.
**What we actually built**: only symbols present on at least one watchlist are polled at all (the important half of "don't waste calls on nothing"); a `watch_count` column exists on the quote-cache table so frequency-weighting is a follow-on query change, not a rearchitecture.

**Why**: real popularity-weighted scheduling needs multiple concurrent users with different watchlists to even demonstrate — not achievable credibly in a single-demo-account build under this deadline. Disclosed here rather than silently claimed as done.

---

### 2026-09-04 — Deploying frontend and backend separately, not as one service

**The simpler-sounding path**: deploy everything as one process somewhere.
**What we're doing instead**: static frontend on Vercel; FastAPI backend on Render (or equivalent) with the *deployed* instance switched from SQLite to a free Postgres, while local dev keeps SQLite.

**Why**: Vercel's serverless model can't host our backend as-is — its functions are short-lived and stateless, which breaks two things our design depends on: the long-running background poller (an asyncio loop that has to keep running between requests) and SQLite's on-disk file (serverless filesystems are ephemeral, so the db would reset on every cold start). Rather than redesign the backend around a platform constraint, we deploy it somewhere that supports a persistent process, and use the one-line env-var swap already built into `database.py` to point the deployed copy at real Postgres instead of a file that wouldn't survive a restart. Demo link is optional per the actual rules, but a broken/reset demo would look worse than no demo, so we don't cut this corner if we ship one at all.
