# Task for Devin: Per-user sensitivity — thresholds that adapt to the user, not just the stock

## Context

The rule engine already adapts thresholds to each *stock* (`MOVE_SENSITIVITY *
avg_daily_move` in `change_detection.py`, shared with `compute_drifty()` since the
unification work). What it doesn't do yet: adapt to the *user*. Every account uses
the exact same sensitivity multiplier — a cautious long-term investor and someone
who wants every 1% blip get the identical threshold. This was scoped from the
start (see the original onboarding plan) but never built.

## What to do

**1. Add a per-user sensitivity setting.**
- `User` model (`backend/app/models.py`): add a `sensitivity: Mapped[str]` column,
  default `"balanced"`. Three levels: `"conservative"` (fewer flags — only bigger
  moves), `"balanced"` (today's default behavior, unchanged), `"aggressive"` (more
  flags — smaller moves count).
- Map each level to a multiplier applied on top of the existing
  `MOVE_SENSITIVITY` constant in `change_detection.py` — e.g. conservative ×1.4,
  balanced ×1.0, aggressive ×0.7 (numbers are a starting point, not sacred; the
  point is conservative raises the bar, aggressive lowers it). Thread this through
  both `change_detection.evaluate()` and `compute_drifty()` so the two stay
  consistent with each other, the same way the stock-level thresholds already are
  — don't let this reintroduce the exact kind of engine-disagreement bug the
  Drifty unification task just fixed.

**2. Expose it via API.**
- `GET /api/users/me/settings` (or similar — match this codebase's existing
  auth/routing conventions) returning the current sensitivity.
- `PATCH /api/users/me/settings` to change it, body `{ "sensitivity": "..." }`,
  validated against the three allowed values.

**3. Don't touch onboarding UI or copy.** That's frontend/Manus's territory if the
user wants it surfaced in the signup/onboarding flow later — this task is just the
backend making the setting real and load-bearing. Frontend can wire a UI to it
whenever it wants.

## Test

- Same stock, same quote data, three different user sensitivities → three
  different `has_attention`/`attention_score` outcomes at the boundary (a move
  that trips "aggressive"'s lower threshold but not "conservative"'s higher one).
- `compute_drifty()` respects the same setting for the same user (the consistency
  test from the unification task should still pass per sensitivity level, not just
  at the default).
- Settings endpoint: get/patch round-trip, and a rejected invalid value.

## Workflow

`git fetch` before committing. Run the full backend suite before pushing and paste
actual test output, not just a pass count.

**Push your commit when you're done.** If you can't push for any reason, say so
explicitly in your summary — don't leave the work committed locally but silently
unpushed.
