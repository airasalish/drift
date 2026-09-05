import { useEffect, useState } from "react";
import { api } from "../api";
import { formatPct, formatPrice, pctClass } from "../format";
import { Sparkline } from "../Sparkline";
import type { WatchlistItem } from "../types";
import { ThesisChips } from "./ThesisChips";

// The stock detail interaction: a right-side drawer, not a navigation to a
// separate page. Every piece of information here answers one question --
// "what happened to this stock while I was away" -- nothing that doesn't.
export function StockDrawer({
  item,
  onClose,
  onSeen,
  onRemove,
  onUpdateNote,
}: {
  item: WatchlistItem | null;
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

  // reset local UI state whenever the open item changes (including close)
  useEffect(() => {
    setDigest(null);
    setEditingThesis(false);
    setConfirmingRemove(false);
    setDraftNote(item?.note ?? "");
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

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`${item.symbol} detail`}>
        <div className="drawer-head">
          <div className="drawer-head-main">
            <span className="drawer-symbol">{item.symbol}</span>
            <span className="drawer-price">{formatPrice(item.quote?.price ?? null, item.quote?.currency)}</span>
            {dayChangePct != null && (
              <span className={`drawer-day-change ${pctClass(dayChangePct)}`}>{formatPct(dayChangePct)} today</span>
            )}
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
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
            <span className="ds-label">Since last view</span>
            <span className={`ds-value ${pctClass(item.change_since_last_view_pct)}`}>
              {formatPct(item.change_since_last_view_pct)}
            </span>
          </div>
          <div className="drawer-stat-divider" />
          <div className="drawer-stat">
            <span className="ds-label">Since added</span>
            <span className={`ds-value ${pctClass(item.change_since_added_pct)}`}>
              {formatPct(item.change_since_added_pct)}
            </span>
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
                  {f.message}
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
    </>
  );
}
