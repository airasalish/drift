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
