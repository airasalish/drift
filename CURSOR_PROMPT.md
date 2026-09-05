# Cursor prompt — visual polish pass

Standalone scratch file, safe to delete whenever it's no longer needed.

---

Drift (a stock watchlist app) needs a deeper visual polish pass. Stack: React + TypeScript + Vite frontend (frontend/src/), FastAPI backend (backend/app/) — don't touch the backend, this is frontend-only.

Current design: dark charcoal/near-black surfaces (--bg #0a0b0e, --surface #121419), a violet accent (--accent #8b7bf7) reserved for brand/focus/urgency (never used for price direction — green/red own that), Inter font. Tokens are in frontend/src/App.css :root.

Goal: make it feel more premium and sophisticated without turning it into a generic AI-dashboard look. Concretely:
- Audit frontend/src/App.css and frontend/src/components/*.tsx for: inconsistent spacing (a --sp-1..--sp-8 scale exists but isn't applied everywhere), weak typography hierarchy, any remaining "wall of identical cards" patterns, borders used decoratively rather than meaningfully.
- Tighten and unify spacing using the existing --sp-* scale.
- Push typography hierarchy further: the hero headline, drift-card primary %, and drawer primary % should feel unmistakably like the most important numbers on the page.
- Keep the existing component structure and class names where reasonable — this is a polish pass, not a rewrite.
- Test in a real browser (light AND the drawer AND mobile width ~375px) before calling it done — don't just eyeball the CSS.
- Do not touch backend/app/, do not change any API contract, do not add fake navigation/sections.
