# Task for Manus: Redo the Landing page — it reads as a template, not a product

## The problem

`frontend/src/pages/Landing.tsx` (+ `Landing.css`) is the marketing page at `/` —
the first thing anyone sees before logging in. Right now every single icon on it
is a raw emoji used as a logo: 📊 ⏰ 🔍 for the problem cards, 📈 🧠 🔐 📊 🎯 📝 for
the features grid. Combined with fairly generic, low-specificity copy, it reads as
an AI-generated template rather than a real product's front door — especially next
to the rest of the app, which has an actual design system (dark theme, real CSS
custom properties, considered spacing/typography — see `App.css`).

This page is the one place in the whole product that doesn't look like it belongs
to it.

## What to actually build

**1. Replace every emoji icon with real iconography.** Use inline SVGs (small,
hand-drawn or from a consistent icon set — Lucide/Feather-style line icons match
this product's restrained aesthetic better than filled/colorful icons) for: the
three problem cards, the six feature-grid items, and anywhere else an emoji is
currently standing in for a visual. No emoji left as a primary visual element
anywhere on this page.

**2. Ground the page in what the product actually does, not generic claims.**
Concretely:
- The four "rules that matter" cards already have good, specific examples (AAPL
  ±1.2%, TSLA 52-week high, etc.) — keep that pattern and extend it to the rest of
  the page. The features grid right now is six one-line abstractions ("Drifty
  intelligence: compare a stock against itself, your watchlist, and the market")
  with no concrete backing. Replace at least the Drifty and multi-watchlist feature
  entries with a real example: a short, specific scenario (e.g. "DKNG moves -0.7%
  today — normal for DKNG, so Drifty stays quiet. The same day, three of your
  gaming-and-entertainment names all drop together — that's flagged, because it's
  not one stock being noisy, it's a sector move") rather than restating the
  capability abstractly.
- The multi-watchlist feature claim should reflect what's actually built: real
  templates (Technology, Banking, AI & Semiconductors, etc. — see
  `GET /api/watchlists/templates` for the live list, don't hardcode a stale one),
  not just "organize by strategy."

**3. Add actual visual proof, not just a wall of text.** The page currently has zero
screenshots or product visuals below the hero — six sections of copy in a row with
no break in visual rhythm. At minimum, add one real screenshot or a simplified
static mockup of the Charts view (watchlist / chart / Drifty panel) somewhere
between the "How Drift works" and "Built for serious investors" sections, so a
visitor sees the actual product once before hitting the CTA. Doesn't need to be
interactive — a static image/SVG mockup styled to match the dark theme is enough,
just not another wall of icon-cards.

**4. Keep the existing structure that's already working.** The hero copy
("Not just prices. What actually drifted since you last looked."), the CTA
placement, and the rules-with-examples section are fine as-is — this is a visual
and depth pass, not a rewrite of the whole page's information architecture.

## Design constraints

- Reuse this app's existing CSS custom properties (`--surface`, `--accent`,
  `--border`, `--muted`, etc. — check `App.css` / `Landing.css` for what's already
  defined) rather than introducing new colors. The rest of the app has a
  consistent dark theme; the landing page should look like it's the same product,
  not a different one with the same words.
- No new npm dependencies for icons — inline SVG (hand-authored or copied from an
  MIT-licensed icon set's raw SVG source) keeps this dependency-free and consistent
  with how the rest of the app is built.

## Verify before calling this done

Load `/` in a browser and actually look at it — this is a visual task, a build
that compiles isn't evidence it looks right. Check both the emoji are gone and
that the page doesn't feel visually thinner than the rest of the app.
