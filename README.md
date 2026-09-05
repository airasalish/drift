# Drift

<!-- badges: fill in once CI/deploy exist -->
![status](https://img.shields.io/badge/status-live-brightgreen)
![stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI%20%2B%20SQLite%2FPostgres-blue)

> Not just prices — what actually drifted since you last looked, and why it deserves your attention now.

Built solo by Aira Salish for Code, by Groww (2026).

Full spec/rationale: [PROJECT_BRIEF.md](PROJECT_BRIEF.md) · decision log: [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md).

## At a glance

| | |
|---|---|
| **What it does** | Tracks stocks, and ranks them by what actually changed since your last visit — not just today's price |
| **Meaningful change** | Volatility-adjusted price move, volume spike vs. trailing average, 52-week high/low cross — see [§1](PROJECT_BRIEF.md#1-what-counts-as-a-meaningful-change-rule-based-not-vibes) |
| **Persistence** | Per-account watchlists + `last_viewed_at` in Postgres — diffs are always "since your last real visit" |
| **Data source** | yfinance (MVP) |
| **"Explain this"** | Optional, on-demand: Groq rephrases the already-computed signals into one plain-English paragraph — never decides what's flagged, never invents a cause. Degrades gracefully without an API key. |
| **Live demo** | https://frontend-dusky-omega-11.vercel.app |
| **Backend API** | https://drift-api-swbj.onrender.com (free tier — first request after idle can take ~50s to wake up) |
| **Video** | TODO link |

## Running it locally

**Backend** (FastAPI, Python 3.11+):
```
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Creates `watchlist.db` (SQLite) automatically on first run — no separate database install needed. Runs at http://127.0.0.1:8000.

**Frontend** (React + Vite):
```
cd frontend
cp .env.example .env   # sets VITE_API_BASE=http://127.0.0.1:8000 for local dev
npm install
npm run dev
```
Runs at http://localhost:5173. `VITE_API_BASE` tells the frontend where your backend lives. The default in `.env.example` points at the local backend above; change it to the Render URL if you want to run the frontend against the deployed API instead.

Sign up for your own account, or click "Try the demo" for a zero-setup look with real seeded data. Add a symbol (e.g. `AAPL`), optionally note why you're watching it — it drifts back to you on the card later — then use "Mark as seen" (or just navigate away; it anchors automatically) to set the baseline the next visit compares against.

## Screenshots

| Login | Watchlist | Stock detail |
|---|---|---|
| ![Login screen](docs/screenshots/login.png) | ![Watchlist with drift feed](docs/screenshots/watchlist.png) | ![Stock detail drawer](docs/screenshots/drawer.png) |

> Screenshots live in `docs/screenshots/`. To update them after UI changes, take a fresh capture of each view and replace the PNGs — filenames are stable so the table above stays correct automatically.

## Architecture

```
React (Vite)  --polls-->  FastAPI  --reads-->  SQLite (SQLAlchemy)
                              ^
                              | background poller, once per symbol per interval
                              v
                          yfinance
```

The API never calls yfinance on a request path — only the background poller does, once per watched symbol per interval, writing into a shared `symbol_quotes` cache table that every user's requests read from. See [PROJECT_BRIEF.md §5](PROJECT_BRIEF.md#5-scaling-for-larger-watchlists--more-users) for why, and [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md) for what's deliberately simplified for this deadline vs. built to extend cleanly later.

*Repo is private during development; both Vercel and Render already have app-level access, so this doesn't affect either deployment.*
