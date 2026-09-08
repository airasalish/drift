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

The backend test suite covers change detection, market data behavior, authentication, watchlist CRUD, templates, charts, history, and related-stock behavior.

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
