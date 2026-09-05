import { useEffect, useLayoutEffect, useMemo, useState } from "react";

const STEPS: { selector: string; title: string; body: string }[] = [
  {
    selector: "[data-tour='demo-reset']",
    title: "Start with a clean signal",
    body: "The demo is shared. Resetting loads the curated sample and clears someone else’s old baseline, so your first Drift session actually has context.",
  },
  {
    selector: "[data-tour='hero']",
    title: "Since you checked",
    body: "This is what changed while you were away, not just your stock prices.",
  },
  {
    selector: "[data-tour='drift-pct']",
    title: "The % is the point",
    body: "On a drift card, the large number is the move since you last looked, the price underneath is just context.",
  },
  // Mutually exclusive with the step above -- exactly one of the two
  // selectors exists in the DOM at a time (SinceYouLeft.tsx renders drift
  // cards OR the calm-state paragraph, never both), so `visible` below
  // naturally picks whichever is real right now. Real market data means
  // there's no guarantee anything is flagged when this tour runs -- "all
  // quiet" is a genuine, designed outcome of the product, not an empty
  // demo, and it deserves its own explanation rather than silently
  // dropping the tour's core idea when nothing happens to be drifting.
  {
    selector: "[data-tour='calm-state']",
    title: "Quiet is a real feature",
    body: "When nothing meaningfully changed, Drift says so directly, filtering out normal noise is the point, not a fallback for an empty demo.",
  },
  {
    selector: "[data-tour='rail']",
    title: "Jump anywhere",
    body: "The rail lists every watched symbol and History, your own timeline of when you last checked.",
  },
  {
    selector: "[data-tour='watchlist-row']",
    title: "Open any row",
    body: "Click a row to open its detail. The drawer is meant to be found on purpose, not by accident.",
  },
];

function measure(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  return rect;
}

export function FirstLookTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [tick, setTick] = useState(0);

  const visible = useMemo(
    () => STEPS.filter((s) => measure(s.selector) != null),
    [open, tick]
  );
  const step = visible[Math.min(stepIndex, Math.max(0, visible.length - 1))] ?? null;
  const rect = step ? measure(step.selector) : null;

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      setTick((n) => n + 1);
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, stepIndex]);

  // The anchor for a later step (e.g. a watchlist row) can sit well below
  // the fold on a long page -- without this, its rect still "measures"
  // fine (getBoundingClientRect doesn't care if the element is on screen),
  // so the tooltip silently renders off-viewport instead of failing loudly.
  useLayoutEffect(() => {
    if (!open || !step) return;
    document.querySelector(step.selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open, stepIndex, step?.selector]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !step || visible.length === 0) return null;

  const pad = 8;
  const spot = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const tooltipStyle = (() => {
    if (!spot) return { top: "40%", left: "50%", transform: "translateX(-50%)" as const };
    const below = spot.top + spot.height + 12;
    const placeBelow = below + 168 < window.innerHeight;
    return {
      top: placeBelow ? below : Math.max(12, spot.top - 156),
      left: Math.min(Math.max(12, spot.left), window.innerWidth - 332),
    };
  })();

  const last = stepIndex >= visible.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="First-look walkthrough">
      <button type="button" className="tour-scrim" onClick={onClose} aria-label="Skip walkthrough" />
      {spot && (
        <div
          className="tour-spot"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
        />
      )}
      <div className="tour-tooltip" style={tooltipStyle}>
        <p className="tour-step-meta">
          {stepIndex + 1} / {visible.length}
        </p>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          {!last && (
            <button type="button" className="tour-skip" onClick={onClose}>
              Skip
            </button>
          )}
          <button
            type="button"
            className={last ? "tour-next tour-cta" : "tour-next"}
            onClick={() => {
              if (last) onClose();
              else setStepIndex((i) => i + 1);
            }}
          >
            {last ? "Start tracking →" : "Next signal →"}
          </button>
        </div>
      </div>
    </div>
  );
}
