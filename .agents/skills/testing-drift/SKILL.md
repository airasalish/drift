---
name: testing-drift
description: Run local Drift browser tests with demo authentication and stable market-quote fixtures.
---

# Local browser testing

- Run the backend from `backend` so its default SQLite URL resolves to `backend/watchlist.db`: `.venv/bin/uvicorn app.main:app --port 8000`.
- Copy `frontend/.env.example` to `frontend/.env` if absent. Use a Node version supported by the frontend toolchain (Node 22.12.0 worked), then `npm ci` and `npm run dev -- --host 0.0.0.0` from `frontend`.
- If Vite reports a missing optional Rolldown native binding, try a clean `npm ci` under the supported Node version rather than installing individual optional packages.
- Open `http://localhost:5173` and use **Try the demo**. The demo is shared; previously seen symbols may already be quiet.
- Open a symbol from the left rail, inspect **Why Drift surfaced this**, and use **Open full chart** to inspect the Drifty score and reasons. Scroll down if the workspace header pushes analysis below the fold.
- **Mark as seen** suppresses structural list signals, while Drifty reports current quote state. Verify the list dot/reasons and Drifty independently.

## Controlled quote fixtures

- Only seed data when authorized. Back up SQLite with its backup API first, and restore it afterward.
- Start the backend with `POLL_INTERVAL_SECONDS=86400` and let its initial quote poll complete before seeding so subsequent polling does not overwrite fixtures.
- Quote inputs live in `symbol_quotes`; baseline/suppression fields live in `watchlist_items`. Use fractional percentages (0.01 means 1%).
- Neutralize unrelated signals and benchmark/peer context when asserting exact scores. Reload through the browser after updates; list ordering can change, so re-identify symbols before clicking.
- Quote fixtures do not replace chart-history responses. Clearly distinguish live chart history from synthetic quote inputs in evidence.

## Devin Secrets Needed

None for local demo authentication.
