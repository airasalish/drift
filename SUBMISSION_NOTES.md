# Drift — Submission Notes

## Honest pitch

Most watchlists store symbols but do not answer the question that matters after a user returns: **what actually changed, and does it deserve attention?** Drift remembers the user's last real visit, compares each holding with its own normal behavior, checks volume and 52-week context, and ranks the changes worth investigating.

The differentiator is an explainable attention layer, not an AI-generated score. Explicit rules flag unusual volatility-adjusted moves, volume spikes, 52-week extremes, and portfolio-level movement. Each signal carries numeric evidence, so a reviewer can ask why something appeared and get a defensible answer. The since-last-view baseline is persisted to the account, which makes review cadence part of the product rather than assuming everyone checks daily.

Drift is intentionally bounded: it is a watchlist and attention system, not a broker, predictor, or automated adviser. It identifies unusual movement without pretending to know unsupported causes.

## Five-minute demo script

### 0:00–0:30 — Frame the problem

Show the landing page and questionnaires. Say: “Most watchlists tell me what moved. Drift tells me what changed since I last looked, and whether it is unusual enough to deserve attention.” Answer the two questions, then choose **Try the demo**.

### 0:30–1:15 — Establish the workspace

Show the command-center overview. Point out market context, tracked symbols, quiet moves filtered out, refresh time, and market status. Say: “Normal moves remain visible below; Drift prioritizes rather than hides.”

### 1:15–2:15 — Show the differentiator

Open an attention card and its details. Say: “This is not a feeling or a black-box score. The card shows the move since my last view, the symbol's normal range, volume context, or 52-week evidence. The rules are explicit and the ranking is explainable.” Open the drawer and point to the chart and raw statistics.

### 2:15–3:00 — Demonstrate persistence

Mark an item as seen, leave or refresh, and return. Say: “The baseline is tied to a real visit, not just a background poll. Drift can therefore answer ‘since you last looked’ rather than only ‘since yesterday.’” Mention that demo mode is zero setup while real accounts persist separately.

### 3:00–3:45 — Show the broader workspace

Show Charts, History, and the watchlist switcher. Say: “The attention feed is the entry point, not the whole product. Charts add context, History shows what was surfaced, and multiple watchlists support different strategies or time horizons.”

### 3:45–4:25 — Explain the technical judgment

Say: “Detection is rule-based rather than LLM-scored so the finance-adjacent part remains auditable. The optional digest only rephrases computed signals; it never decides what is flagged or invents a cause. Market data is cached and invalid or stale values are handled explicitly.”

### 4:25–5:00 — Close honestly

Say: “Drift does not promise to predict the market. It helps an investor return to a watchlist and quickly understand what changed, what is normal, and what deserves a closer look. Broader data context and threshold tuning are sensible next steps, but the core loop is real: persist the last view, calculate explainable signals, filter noise, and show the evidence.”

## Honest limitations

The MVP uses yfinance and is not a news or fundamentals product, so it can identify an unusual move without knowing the cause. Its benchmark is simplified around Nifty 50, and it does not yet include moving-average crossovers, event calendars, or a second data source. Thresholds need further validation with real investors.

## Clean archive

`code.zip` should include source, backend, frontend, README, project brief, engineering decisions, and screenshots. Exclude `.git`, `node_modules`, virtual environments, databases, caches, `.env` files, editor/agent configuration, prompt artifacts, and the duplicate `drift/` working copy.
