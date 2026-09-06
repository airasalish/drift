# Drift Demo Script

## Demo goal

Show that Drift is not a normal ticker list. It remembers the user's last real visit, identifies unusual movement using explainable rules, filters normal noise, and gives the user context through charts, history, multiple watchlists, Beginner mode, and the optional Drifty AI summary.

Use the demo account for the recording so the flow is reliable and requires no signup. If the demo account loads empty, use **Reset to sample data** first.

## Symbols to use

Use these well-known companies so the audience immediately understands the examples:

| Symbol | Company | Why to use it |
|---|---|---|
| `AAPL` | Apple | Familiar stable large-cap example |
| `MSFT` | Microsoft | Familiar technology comparison |
| `NVDA` | NVIDIA | Useful high-volatility technology example |
| `TSLA` | Tesla | Familiar volatile stock and chart example |
| `AMZN` | Amazon | Adds a different large-cap technology name |
| `RELIANCE.NS` | Reliance Industries | Demonstrates that the app can handle an Indian exchange symbol |
| `TCS.NS` | Tata Consultancy Services | Optional second Indian-market example |

For a five-minute recording, add **AAPL**, **MSFT**, **NVDA**, and **TSLA**. Add `RELIANCE.NS` only if the live search returns it quickly and the recording has time. Do not add every symbol; four is enough to make the workspace readable.

## Before recording

Open the deployed app or local preview in a fresh browser tab. Confirm the page loads at `/`. Keep the browser at a readable desktop width. Have the demo account path available. If using a live deployment, allow extra time for the first backend request to wake up.

The ideal recording is five to seven minutes. The wording below is written to be spoken naturally; it does not need to be read mechanically.

## Full walkthrough

### 0:00–0:35 — Landing page and product promise

**Action:** Open `/` and show the full landing page hero.

**Say:**

> “Most watchlists tell me what moved. Drift is built to tell me what actually changed since I last looked, and whether that change deserves my attention. It is a calmer way to return to a watchlist instead of scanning every ticker from scratch.”

Point to the hero copy and the banner:

> “The product is designed around a simple idea: markets move, so do you. Drift remembers the context of my last visit.”

Scroll briefly past **The problem with most watchlists**, then show the rules and questionnaire section.

### 0:35–1:00 — The two onboarding questions

**Action:** In the questionnaire, choose:

- **Long-term conviction**
- **A few times a week**

**Say:**

> “The landing page asks two lightweight questions. These are not financial advice or a risk score. They establish how I want to think about attention: what I care about and how often I review.”

Point out the **Your starting point** card:

> “Once both answers are selected, the action becomes available and takes me into the product. Before that, it clearly tells me to complete the questions, so the button never feels disconnected from the form.”

If demonstrating the page only, select both answers and show the button changing to **Build my watchlist**.

### 1:00–1:20 — Enter the demo

**Action:** Click **Try the demo** from the hero or CTA. On the login screen, choose the demo path.

**Say:**

> “I will use the demo account so there is no setup friction. A real account is also available, and the watchlist state is account-based rather than tied only to this browser.”

Wait for the command center to load. If it is empty, click **Reset to sample data**.

### 1:20–2:00 — Build a recognizable watchlist

**Action:** In the search field, add the following one at a time:

1. Search `AAPL`, select **Apple**, add it to the active watchlist.
2. Search `MSFT`, select **Microsoft**, add it.
3. Search `NVDA`, select **NVIDIA**, add it.
4. Search `TSLA`, select **Tesla**, add it.

If the product opens the watchlist picker, choose the current watchlist and confirm. If you want to show the multi-watchlist feature, create a second watchlist called **Long-term technology**, then add `AAPL` and `MSFT` to it as well.

**Say:**

> “I am adding four familiar companies: Apple, Microsoft, NVIDIA, and Tesla. The search is connected to a real market-symbol index, so I select a verified company result instead of guessing a ticker. Symbols can belong to more than one watchlist.”

Optional international proof:

> “The same search can handle exchange-qualified symbols such as `RELIANCE.NS` or `TCS.NS`, which is important because the currency and exchange context should not be assumed from the ticker text alone.”

### 2:00–2:50 — Explain the command center

**Action:** Return to the overview and point to the top metrics.

**Say:**

> “This is the command center. The top tells me the market benchmark, how many symbols are tracked, and how many quiet movements were filtered out. The goal is not to hide the watchlist; it is to separate normal movement from movement that deserves a look.”

Point out:

- Market status: open or closed
- Last refresh time
- Next refresh countdown
- Tracked symbol count
- Quiet-today count
- The **Since you checked** or **Since you added these** label

Then say:

> “Every price has freshness context. If a fetch is stale or unavailable, the interface does not pretend the old value is current.”

### 2:50–3:45 — Show the core attention signal

**Action:** If an attention card is present, open it. If not, explain the quiet state and open a stock from the full watchlist. Show the detail drawer.

**Say:**

> “This is Drift’s main difference. It does not simply show that a price changed. It asks whether the move is unusual for this particular symbol and whether other signals confirm it.”

Point to the card or drawer and say:

> “The rules can include a volatility-adjusted move, an unusual volume spike, a 52-week high or low, and a portfolio-level move where several holdings move together. Each reason includes evidence. A reviewer can ask why this stock appeared and get a number, not a vague AI label.”

Point to the chart:

> “The chart adds context, including the price at the last view when that baseline exists. The full drawer also lets me edit my thesis, mark the item as seen, manage watchlists, remove it, or open the full chart.”

### 3:45–4:15 — Demonstrate Beginner mode

**Action:** In the header, click **Beginner mode**. Open an attention card or detail drawer and compare the rule explanation before and after.

**Say:**

> “Beginner mode does not change the underlying signal, score, price, or data. It changes the wording of the rule explanations into simpler language. The control explains that directly: simpler explanations, same signals.”

Show the same reason in its plain-language version. Mention that this is deterministic rewording, not a separate model making a new decision.

### 4:15–4:45 — Demonstrate Drifty AI responsibly

**Action:** If there is an attention item, click **Drifty AI — Summarize the moves** or open a stock and click **Drifty AI — Explain this**. Wait for the response.

**Say:**

> “Drifty AI is optional and sits on top of the rule engine. It rephrases signals that were already computed. It does not decide what is flagged, does not change the score, and should not invent a causal news explanation. The rule list below remains the source of truth.”

Point to the **DRIFTY AI SUMMARY** label and the rule list beneath it.

If the API is unavailable, say:

> “The core product still works if the optional summary is unavailable. The computed rules and evidence remain visible.”

### 4:45–5:25 — Charts, history, and multiple watchlists

**Action:** Click **Charts**. Select AAPL, then TSLA or NVDA. Open **History**. Switch between the watchlists if you created a second one.

**Say:**

> “The attention feed is the entry point, not the entire product. Charts let me compare the shape of a move across companies. History shows what Drift surfaced before. Multiple watchlists let me separate long-term holdings from another strategy without losing account persistence.”

Point out that selecting a different chart stock keeps the user in the chart view rather than unexpectedly navigating away.

### 5:25–6:00 — Demonstrate since-last-view persistence

**Action:** Open an attention item, click **Mark as seen**, then navigate away or refresh and return to the overview.

**Say:**

> “The important baseline is a real visit, not merely the last background poll. When I mark this as seen, Drift records that I reviewed it. The next time I return, the comparison can be measured from that visit. That is how Drift answers ‘since you last looked’ rather than only ‘since yesterday.’”

If the market is closed or no new movement occurs, explain:

> “A quiet result is still a successful result. It means the rules did not find a meaningful change, and normal movement was filtered rather than falsely promoted.”

### 6:00–6:25 — Account separation and logout

**Action:** Log out and show the login screen. Optionally create a test account only if the recording has time; do not risk a long signup flow during the main demo.

**Say:**

> “The demo path is frictionless, but the product also supports real signup and login. Watchlists and last-view state are associated with the account, so separate users do not share one global watchlist.”

Do not show or speak any real password on the recording.

### 6:25–6:50 — Close with the honest value proposition

**Action:** Return to the landing page or leave the app on the attention feed.

**Say:**

> “Drift is not trying to predict the market or place trades. It solves a focused problem: when I return to a watchlist, it tells me what changed, what is normal, and what deserves a closer look. The detection is explainable, the last-view context is persistent, and the optional Drifty AI summary improves readability without taking over the decision.”

Finish with:

> “That is Drift: less ticker scanning, more informed attention.”

## Recovery lines for common demo states

### No attention items

Say: “This is the calm state working as designed. Drift found no meaningful change, and the normal movement count shows that it filtered noise rather than leaving the page empty.” Then open a stock from the full watchlist and show the chart and details.

### Backend is waking up

Say: “The backend is waking from an idle free-tier instance. The UI preserves the loading state rather than presenting made-up prices. Once the first response arrives, the same flow continues.”

### Drifty AI is unavailable

Say: “The optional readability layer is unavailable, but the underlying rule engine remains available. This separation is deliberate: a summary failure cannot change detection.”

### Search does not return an exact result

Try the exchange-qualified symbol, such as `RELIANCE.NS` or `TCS.NS`, or use the familiar US examples `AAPL`, `MSFT`, `NVDA`, and `TSLA`. Select a result from the search dropdown rather than pressing enter on an unverified string.

## Claims to avoid

Do not say Drift predicts prices, knows why a company moved, provides investment advice, guarantees real-time data, or uses AI to decide what matters. Say that it surfaces unusual, explainable changes from the available market data and lets the user decide what to do next.
