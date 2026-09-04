# Smart Market Watchlist

<!-- badges: fill in once CI/deploy exist -->
![status](https://img.shields.io/badge/status-in--progress-yellow)
![stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI%20%2B%20Postgres-blue)

<!-- tagline: TODO, one line, once the product POV is proven not just planned -->
> TODO — one-line tagline

Built for CODE 2026 — "Build a Smart Market Watchlist." Full spec/rationale: [PROJECT_BRIEF.md](PROJECT_BRIEF.md) · decision log: [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md).

## At a glance

| | |
|---|---|
| **What it does** | TODO — one sentence |
| **Meaningful change** | Volatility-adjusted price move, volume spike vs. trailing average, 52-week high/low cross — see [§1](PROJECT_BRIEF.md#1-what-counts-as-a-meaningful-change-rule-based-not-vibes) |
| **Persistence** | Per-account watchlists + `last_viewed_at` in Postgres — diffs are always "since your last real visit" |
| **Data source** | yfinance (MVP) |
| **Demo** | TODO link |
| **Video** | TODO link |

## Running it locally

TODO — filled in once backend/frontend scaffolds exist.

## Architecture

TODO — one diagram + short explanation once the shape is real.
