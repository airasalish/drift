import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CompanyFavicon } from "./CompanyFavicon";
import { simplifyRuleMessage } from "../lib/beginner";
import { formatPct, formatPrice, pctClass } from "../format";
import { Sparkline } from "../Sparkline";
import type { WatchlistItem } from "../types";
import { ThesisChips } from "./ThesisChips";

// The stock detail interaction: a right-side drawer, not a navigation to a
// separate page. Every piece of information here answers one question --
// "what happened to this stock while I was away" -- nothing that doesn't.
export function StockDrawer({
  item,
  beginnerMode,
  onClose,
  onSeen,
  onRemove,
  onUpdateNote,
}: {
  item: WatchlistItem | null;
  beginnerMode: boolean;
  onClose: () => void;
  onSeen: (id: number) => void;
  onRemove: (id: number) => void;
  onUpdateNote: (id: number, note: string) => void;
}) {
  const [editingThesis, setEditingThesis] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // reset local UI state whenever the open item changes (including close)
  useEffect(() => {
    setDigest(null);
    setEditingThesis(false);
    setConfirmingRemove(false);
    setDraftNote(item?.note ?? "");
  }, [item?.id]);

  useEffect(() => {
    if (item) drawerRef.current?.focus({ preventScroll: true });
  }, [item?.id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (item) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [item, onClose]);

  if (!item) return null;

  async function handleExplain() {
    setDigestLoading(true);
    try {
      const { digest } = await api.digest(item!.symbol);
      setDigest(digest ?? "Couldn't generate a summary right now — the details below still apply.");
    } catch {
      setDigest("Couldn't generate a summary right now — the details below still apply.");
    } finally {
      setDigestLoading(false);
    }
  }

  function saveThesis() {
    onUpdateNote(item!.id, draftNote.trim());
    setEditingThesis(false);
  }

  const dayChangePct =
    item.quote?.price != null && item.quote?.prev_close
      ? (item.quote.price - item.quote.prev_close) / item.quote.prev_close
      : null;

  // "Since last look" is Drift's headline metric -- current price is
  // supporting context, not the primary number. Falls back down the chain
  // only when the stronger signal genuinely isn't available yet.
  const stats = [
    { label: "Since last view", value: item.change_since_last_view_pct },
    { label: "Since added", value: item.change_since_added_pct },
    { label: "Today", value: dayChangePct },
  ];
  const primaryIdx = stats.findIndex((s) => s.value != null);
  const primary = primaryIdx >= 0 ? stats[primaryIdx] : null;
  const secondary = stats.filter((_, i) => i !== primaryIdx);

  return (
    // Non-modal by design: no dimming scrim over the rest of the page.
    // The watchlist (and the quick-jump rail) stay fully interactive while
    // the drawer is open, so switching between stocks is a single click
    // instead of close-then-reopen -- Koyfin's "persistent context"
    // principle, not a dialog. Closed via the ✕ button or Escape.
    <aside ref={drawerRef} className="drawer" role="dialog" aria-label={`${item.symbol} detail`} tabIndex={-1}>
        <div className="drawer-head">
          <div className="drawer-head-main">
            <span className="drawer-symbol">
              <CompanyFavicon domain={item.company_website} symbol={item.symbol} />
              {item.symbol}
              {item.company_name && <span className="drawer-company"> · {item.company_name}</span>}
            </span>
            {primary && (
              <div className="drawer-primary">
                <span className={`drawer-primary-value ${pctClass(primary.value)}`}>{formatPct(primary.value)}</span>
                <span className="drawer-primary-label">{primary.label.toLowerCase()}</span>
              </div>
            )}
            <div className="drawer-now">
              {formatPrice(item.quote?.price ?? null, item.quote?.currency)}
              <span className="drawer-now-label">now</span>
            </div>
          </div>
          <button className="drawer-close" type="button" onClick={onClose} aria-label="Close detail">
            ✕
          </button>
        </div>

        <div className="drawer-spark">
          <Sparkline
            values={item.quote?.spark ?? []}
            markerValue={item.price_at_last_view}
            width={332}
            height={96}
            interactive
            onHover={(v) => setHoverPrice(v)}
          />
          <p className="drawer-spark-legend">
            {hoverPrice != null
              ? formatPrice(hoverPrice, item.quote?.currency)
              : item.price_at_last_view != null
                ? "Dashed line — price when you last checked"
                : "Last 30 sessions"}
          </p>
        </div>

        <div className="drawer-stats">
          <div className="drawer-stat">
            <span className="ds-label">{secondary[0].label}</span>
            <span className={`ds-value ${pctClass(secondary[0].value)}`}>{formatPct(secondary[0].value)}</span>
          </div>
          <div className="drawer-stat-divider" />
          <div className="drawer-stat">
            <span className="ds-label">{secondary[1].label}</span>
            <span className={`ds-value ${pctClass(secondary[1].value)}`}>{formatPct(secondary[1].value)}</span>
          </div>
        </div>

        {item.fired.length > 0 && (
          <div className="drawer-section">
            <div className="drawer-section-head">
              <h3>Why Drift surfaced this</h3>
              <button className="explain-btn" onClick={handleExplain} disabled={digestLoading}>
                {digestLoading ? "Summarizing…" : "Explain this"}
              </button>
            </div>
            {digest && <p className="digest">{digest}</p>}
            <ul className="reasons">
              {item.fired.map((f, idx) => (
                <li key={idx} className={f.rule}>
                  {beginnerMode ? simplifyRuleMessage(f) : f.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="drawer-section">
          <h3>Your thesis</h3>
          {editingThesis ? (
            <div className="drawer-thesis-edit">
              <ThesisChips value={draftNote} onChange={setDraftNote} />
              <div className="drawer-thesis-actions">
                <button onClick={saveThesis}>Save</button>
                <button
                  className="ghost"
                  onClick={() => {
                    setDraftNote(item.note ?? "");
                    setEditingThesis(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="drawer-thesis-display" onClick={() => setEditingThesis(true)}>
              {item.note ? `"${item.note}"` : "Add why you're watching this →"}
            </button>
          )}
        </div>

        <div className="drawer-actions">
          <button onClick={() => onSeen(item.id)}>Mark as seen</button>
          {confirmingRemove ? (
            <div className="confirm-remove">
              <span>Remove?</span>
              <button className="yes" onClick={() => onRemove(item.id)}>
                Yes
              </button>
              <button className="no" onClick={() => setConfirmingRemove(false)}>
                No
              </button>
            </div>
          ) : (
            <button className="ghost" onClick={() => setConfirmingRemove(true)}>
              Remove from watchlist
            </button>
          )}
        </div>
      </aside>
  );
}
