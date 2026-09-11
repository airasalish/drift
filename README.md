<p align="center">
  <img src="frontend/public/drift-d-mark.png" alt="Drift logo" width="92" />
</p>

<h1 align="center">Drift</h1>

<p align="center">
  <strong>A smarter watchlist for what actually changed.</strong>
</p>

<p align="center">
  Drift turns market movement into clear, explainable attention signals so you can spend less time scanning prices and more time understanding what deserves a closer look.
</p>

<p align="center">
  <a href="https://frontend-dusky-omega-11.vercel.app"><strong>Try the live demo</strong></a>
  ·
  <a href="https://youtu.be/CCS5dqicIbY?si=9yuoYiZHtxWYS-v6">Watch the walkthrough</a>
  ·
  <a href="https://youtu.be/l2lPWKitNJ0?si=-qI_nW5JpMC_6w-T">See the technical explanation</a>
</p>

---

## The problem

A normal watchlist tells you that a price moved. It does not tell you whether that move is unusual for the stock, whether it happened with meaningful volume, whether it is close to a 52-week extreme, or whether you have already reviewed it.

Drift is built around that missing layer of context. It remembers where you last looked, compares new market data against each symbol’s own behavior, and surfaces the changes that are most worth investigating.

> **Drift is not trying to predict the market. It helps you decide what deserves your attention next.**

## What makes Drift different

| Typical watchlist | Drift |
|---|---|
| Shows a stream of prices | Groups symbols by attention level |
| Treats every move equally | Compares movement with each stock’s own baseline |
| Leaves the “why” to the user | Shows the exact rules and numbers behind a signal |
| Makes revisiting difficult | Tracks what changed since the last real visit |
| Adds complexity without context | Keeps the workflow focused and explainable |

## Product highlights

### Attention, not noise

Drift separates meaningful changes from normal movement. The overview is organized into clear attention tiers, so the most relevant symbols rise to the top instead of getting buried in a long ticker list.

### Explainable signals

Every surfaced item has visible evidence. Drift can flag abnormal movement, unusual volume, 52-week context, portfolio-wide movement, and behavior that differs from the benchmark. The rules are readable, inspectable, and designed to be audited.

### Personal baselines

The key comparison is not only “what happened today.” Drift remembers the price and time associated with your last real review, then shows what changed since you were actually there.

### Watchlists that fit the way you think

Create a watchlist from scratch, add symbols to one or more lists, or start with a premade collection for themes such as technology, banking, pharma, EVs, and more.

### Charts with context

Explore historical ranges with hover inspection, price changes, OHLC data, volume, range returns, and candlestick or line views where the underlying data supports them.

### History and thesis

Review what Drift has surfaced over time, mark items as seen, and save a short thesis for why a symbol is on your list. The product keeps both the signal and your own reasoning in view.

### Optional plain-English summaries

Drifty AI can turn already-computed signals into a concise explanation. It does not decide what gets flagged; the deterministic rule engine does that first.

## How Drift decides what matters

A symbol can enter the attention feed when one or more transparent checks fire:

1. **Abnormal movement:** the move is large compared with the symbol’s recent behavior.
2. **Unusual volume:** trading volume is meaningfully above its recent average.
3. **52-week context:** price is approaching or crossing a relevant yearly high or low.
4. **Portfolio context:** several symbols in the watchlist are moving together.
5. **Market context:** the symbol is behaving differently from its benchmark.

These rules contribute to an attention score and produce a readable reason. Drift does not present an opaque recommendation or pretend certainty about the future.

## A quick product tour

1. Open the [live demo](https://frontend-dusky-omega-11.vercel.app).
2. Complete the two short onboarding questions.
3. Choose a premade watchlist or create a new one.
4. Search for and add symbols such as `NFLX`, `DIS`, or `UBER`.
5. Return to Overview to see market context, tracked symbols, quiet movement, and attention items.
6. Open a symbol to inspect its reasons, chart, thesis, and available actions.
7. Mark it as seen to establish a personal review baseline.
8. Use Charts, History, and the optional Drifty AI explanation when you need more context.

## See it in action

| Resource | What it shows |
|---|---|
| [Product walkthrough](https://youtu.be/CCS5dqicIbY?si=9yuoYiZHtxWYS-v6) | The end-to-end user journey, from watchlist creation to understanding a surfaced signal |
| [Technical explanation](https://youtu.be/l2lPWKitNJ0?si=-qI_nW5JpMC_6w-T) | The rule engine, personal baselines, shared market-data cache, and design decisions |

## Run Drift locally

Drift has a React and Vite frontend backed by a FastAPI service.

### Requirements

- Python 3.11 or newer
- Node.js 20 or newer
- npm

### 1. Start the backend

```bash
cd backend
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend runs at `http://127.0.0.1:8000`. SQLite is created automatically on first run. Set `DATABASE_URL` if you want to use PostgreSQL instead.

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

The frontend uses `VITE_API_BASE=http://127.0.0.1:8000` by default. Adjust the local environment file if your backend runs elsewhere.

### Optional Drifty AI setup

The product works without an AI key. To enable optional plain-English summaries, add one or more comma-separated `GROQ_API_KEYS` values to `backend/.env`. AI only rephrases signals that Drift’s deterministic engine has already computed.

## Architecture

```text
React + Vite
     │
     │ polls for watchlist state
     ▼
FastAPI + SQLAlchemy ─── SQLite or PostgreSQL
     │
     │ background refresh and shared cache
     ▼
  yfinance market data
```

The backend refreshes market data through a shared cache rather than fetching the same symbol independently for every request. The market-data layer, change-detection rules, API routes, and presentation layer are kept separate so the core behavior remains testable and explainable.

Every non-obvious choice behind this shape, and the real bugs found along the way, is written down with dates and reasoning in [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md) — 20+ entries covering why change detection is rule-based instead of ML, why an LLM layer was considered and declined, why polling is popularity-weighted, and production issues that were hit and fixed (a CORS misconfiguration, an incomplete NaN fix, a currency-column bug).

## Project structure

```text
backend/
  app/
    routers/          auth, watchlists, charts, history, and related symbols
    services/         market data, change detection, and optional summaries
    models.py         database models
  tests/              backend behavior and rule tests
frontend/
  src/
    components/       dashboard, charts, drawers, watchlists, and navigation
    pages/             landing and authentication screens
    hooks/             watchlist state and refresh behavior
  public/              Drift logo and product artwork
PROJECT_BRIEF.md       product specification and rule rationale
ENGINEERING_DECISIONS.md architecture and scope decisions
vercel.json            production build configuration
```

## Validation

Build the frontend with:

```bash
cd frontend
npm run build
```

**121 backend tests across 6 files**, all passing:

```bash
cd backend
python -m pytest -q
```

| File | Covers |
|---|---|
| `test_change_detection.py` | The rule engine: abnormal move, volume spike, 52-week context, benchmark comparison |
| `test_drifty_intelligence.py` | Self/peer/market attention scoring and its agreement with the rule engine |
| `test_watchlist_crud.py` | Watchlist and symbol lifecycle, auth boundaries |
| `test_watchlist_features.py` | Charts, history, related-stock suggestions |
| `test_market_data.py` | Market-data fetch behavior, stale/failed-fetch handling |
| `test_demo_user.py` | The seeded demo account and its reset path |

## Known limitations, on purpose

Built the solution that could be defended, not the one that looks complete from a distance:

- **Single market-data source (yfinance).** No fallback provider yet — a failed fetch is shown as visibly stale, never silently swapped for cached-as-current data, but there's no second source to fail over to. The data layer sits behind an interface specifically so one could be added without touching change-detection logic.
- **One fixed benchmark (Nifty 50)** for every symbol, not smart-matched to a stock's home exchange — a real simplification for a mixed US/India watchlist, disclosed rather than assumed correct.
- **Polling is popularity-weighted, not load-tested at real scale.** Each symbol is fetched once per interval and fanned out to every watcher, never once per user, but this hasn't been proven under production-scale concurrent load.
- **Moving-average crossovers and any news/sentiment signal are deliberately out of scope (v2).** MVP is price-move + volume-spike + 52-week-cross rules only; the remaining time went to resilience and edge cases instead of a fourth rule type.
- **No automated accessibility or cross-browser testing.** Manually checked, not covered by the test suite above.

## Scope

Drift is an explainable watchlist and attention tool. It is not a broker, does not place trades, and does not tell users what to buy or sell. It helps investors understand what changed and decide what to investigate next.

## Links

- [Live demo](https://frontend-dusky-omega-11.vercel.app)
- [GitHub repository](https://github.com/airasalish/drift)
- [Product walkthrough](https://youtu.be/CCS5dqicIbY?si=9yuoYiZHtxWYS-v6)
- [Technical explanation](https://youtu.be/l2lPWKitNJ0?si=-qI_nW5JpMC_6w-T)
- [Product brief](PROJECT_BRIEF.md)
- [Engineering decisions](ENGINEERING_DECISIONS.md)

## License

This project is provided for demonstration and evaluation purposes.
