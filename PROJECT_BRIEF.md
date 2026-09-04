# PROJECT_BRIEF.md

## Challenge (verbatim intent, confirmed from the official HackerEarth page)
"Code, by Groww" — a 72-hour solo build, **Sep 4 11:00 AM to Sep 7 11:00 AM, Asia/Kolkata**. Theme: "Build a Smart Market Watchlist." Minimum: create/manage a watchlist, view latest market info, return later and see what changed. Explicitly open-ended: we decide what "meaningful change" means, what info surfaces, how state persists, how staleness/conflict is handled, how it scales, and where to keep it simple. Explicitly told not to build the obvious watchlist.

**Required submission** (per the event FAQ, verbatim): source code (ZIP or Git repo) with a README with clear setup instructions, **a 100-word product pitch** explaining what was built, how it was designed, and the thinking behind key choices — plus "submit something that actually works." Video URL / Demo Link / Repository URL fields on the submission form are not marked required — source code + README + the 100-word pitch are the load-bearing deliverables.

**Evaluation criteria** (verbatim): "engineering depth, problem interpretation, resilience and edge cases, code quality, simplicity, and originality of thought." Explicitly: "Don't optimise for what you think we want to see. Build the solution you can defend. Because eventually, we're going to ask you why." AI tools are explicitly allowed — the FAQ says they're specifically interested in "what the tools can't decide for you: architecture, judgement, edge cases, trade-offs and why you made the choices you did." This directly validates the ENGINEERING_DECISIONS.md approach already in place.

This document turns that into a literal spec with teeth, decided before feature code exists, so every later choice traces back to a rule written here — not a vibe argued after the fact.

---

## 1. What counts as a "meaningful change" (rule-based, not vibes)

Computed **since the user's last actual visit** (a real timestamp), not "since yesterday's close" — visiting twice in one volatile hour should show a different diff than visiting once a week.

A symbol is flagged into the "what changed" feed if **any** rule fires:

| Rule | Threshold | Why this shape |
|---|---|---|
| Abnormal price move (has a last-view baseline) | `\|% change since last_viewed\|` ≥ `max(1%, 1.5 × that symbol's own trailing-20-day avg daily \|move\|)` | Volatility-adjusted on purpose — a 2% move is huge for a stable blue chip and noise for a stock that swings 5% daily. A flat threshold would either spam on volatile names or miss quiet ones. |
| Intraday move from prev close (no last-view baseline yet) | `\|% change vs prev close\|` ≥ `max(2%, 1.5 × avg daily move)`, at 0.8× the weight | A freshly-added symbol has no `price_at_last_view` yet, so the rule above can never fire for it even if it moved sharply today — this closes that gap without conflating "since you looked" with "since yesterday" (the two stay mutually exclusive: this only runs when the first doesn't apply). |
| Unusual volume | current volume ≥ `2 × trailing-20-day avg volume` | Volume spikes precede/confirm price moves and catch stocks that haven't moved yet but are being accumulated. |
| 52-week high/low crossed, or within 3% of it | boolean, or reduced weight (0.6×) if within 3% without crossing | Cheap, unambiguous, high signal-to-noise. The "near" tier surfaces a stock approaching an extreme before it actually crosses, at a deliberately lower weight so it doesn't rank alongside an actual new high/low. |
| Key moving-average cross (50/200-day) | boolean | Stretch goal, not MVP — only if time allows. |

Each fired rule contributes to a per-symbol **attention score** (simple sum, each rule pre-weighted). Symbols are ranked by score in the "what changed" feed. This is deliberately rule-based and explainable, not ML — a system you can defend line-by-line beats a black box when the brief says "be ready to explain why."

## 2. What information surfaces

- **Attention feed** (top, only populated with fired rules): per symbol — *which* rule(s) fired, the actual numbers ("+4.2% since you last checked, vs its usual ±1.1%"), not just a colored badge.
- **Full watchlist** (below, always visible): every symbol, current price, change since `last_viewed`, and an explicit data-freshness timestamp.
- **Per-symbol detail**: price chart + the raw stats behind its attention score.

## 3. State persistence across sessions/devices

One account per user. Watchlists and a `last_viewed_at` timestamp live in Postgres, keyed to the account — not to a browser/device. `last_viewed_at` updates only on an explicit "seen" action — leaving the page (auto, via a `visibilitychange` listener + `navigator.sendBeacon` for reliable delivery even mid-unload) or dismissing a card manually — never on every background poll, so the diff always reflects a real prior visit. Only flagged or never-before-viewed items auto-anchor on leave, so a brief tab-switch doesn't churn the baseline for things the user hasn't actually reviewed.

## 4. Stale, delayed, or conflicting data

- Every price carries a visible `as of HH:MM` fetch timestamp — never a fake "live" dot.
- A failed background fetch leaves the last-known price visible but visibly marked stale (not silently presented as current).
- MVP is single-source (yfinance), so no real conflict case yet — but the data source sits behind an interface so a second source can be added later without touching change-detection logic.

## 5. Scaling for larger watchlists / more users

- A symbol is fetched **once per polling interval and cached**, fanned out to every user watching it — never one API call per user per symbol.
- Polling frequency is popularity-weighted (symbols watched by more users refresh more often) — a simple budget that states explicitly why the design wouldn't fall over, even though a hackathon demo won't hit real scale.

## 6. Simple vs. complex, on purpose

- Change-detection: rule-based, explainable — not ML. Chosen deliberately (see §1).
- No trading/order execution — this is a watchlist, not a broker; out of scope by definition.
- Auth and multi-user scope: **open — see open questions below.**

---

## Resolved decisions

1. **Auth scope — resolved**: single hardcoded demo account, no signup/login UI. Every table still carries `user_id` as a first-class column (not global/singleton state), so adding real auth later is additive, not a rearchitecture. Rationale logged in [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md).
2. **Deadline — self-imposed, deliberate**: official window is Sep 4 11:00 AM → Sep 7 11:00 AM IST, but **only the first 1,000 of ~2,900 registered submissions get evaluated at all** — so submitting early is a real competitive advantage independent of the 72-hour window. Target is tonight (2026-09-04) through tomorrow morning (2026-09-06), deliberately inside the official window, not a misunderstanding of it. Full process: Build (submit) → Present (Top 40, virtual, 18 Sep — 5 min demo + 5 min live Q&A on the *decisions*, not just the demo) → Finale (Top 20, Groww HQ Bengaluru, 30 Sep). Moving-average crossovers and any news/sentiment signal remain **v2, deferred on purpose** — MVP is price-move + volume-spike + 52-week-cross rules only; extra time goes to polish/resilience/edge cases (explicitly judged) over new rule types.
3. **Git identity — resolved**: commits authored as `airasalish` / anakhdee12@gmail.com.
4. **Repo — resolved**: https://github.com/airasalish/drift (recreated once, after the first repo's GitHub UI persistently showed a spurious "claude" contributor entry despite verified-clean commit data — see DEV_LOG.md).
