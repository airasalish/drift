import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import type { Watchlist } from "../types";
import "./WatchlistPickerModal.css";

// The actual point of having multiple watchlists: every "add" flow in the
// app (suggestions, manual add, the detail drawer) opens this same picker
// instead of silently dropping the symbol into whichever watchlist happens
// to be active. Mirrors the "add to playlist / board" pattern from
// Spotify, Pinterest, and Zerodha's own watchlist-add sheet -- a checklist
// of your collections, membership state fetched live, toggle any of them,
// create a new one inline without leaving the flow.
export function WatchlistPickerModal({
  symbol,
  companyName,
  note,
  watchlists,
  onClose,
  onCreateWatchlist,
  onChanged,
}: {
  symbol: string;
  companyName?: string;
  note?: string;
  watchlists: Watchlist[];
  onClose: () => void;
  onCreateWatchlist: (name: string) => Promise<Watchlist>;
  onChanged: () => void;
}) {
  const [memberIds, setMemberIds] = useState<Set<number> | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.watchlists
      .memberships(symbol)
      .then((res) => {
        if (!cancelled) setMemberIds(new Set(res.memberships.map((m) => m.watchlist_id)));
      })
      .catch(() => {
        if (!cancelled) setMemberIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function toggle(watchlistId: number) {
    if (!memberIds || pending.has(watchlistId)) return;
    const isMember = memberIds.has(watchlistId);
    setPending((p) => new Set(p).add(watchlistId));
    setError(null);
    try {
      if (isMember) {
        await api.watchlists.removeItemBySymbol(watchlistId, symbol);
        setMemberIds((prev) => {
          const next = new Set(prev);
          next.delete(watchlistId);
          return next;
        });
      } else {
        try {
          await api.watchlists.addItem(watchlistId, symbol, note ?? "", companyName);
        } catch (e) {
          // 409 just means it's already a member -- not a real failure
          // from the user's point of view, so don't surface it as one.
          if (!(e instanceof Error && e.message.toLowerCase().includes("already"))) throw e;
        }
        setMemberIds((prev) => {
          const next = new Set(prev);
          next.add(watchlistId);
          return next;
        });
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(watchlistId);
        return next;
      });
    }
  }

  async function handleCreateAndAdd() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const watchlist = await onCreateWatchlist(name);
      setNewName("");
      setMemberIds((prev) => (prev ? new Set(prev) : new Set()));
      await toggle(watchlist.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't create watchlist");
    } finally {
      setCreating(false);
    }
  }

  return createPortal(
    <div className="picker-overlay" onClick={onClose}>
      <div
        className="picker-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Add ${symbol} to a watchlist`}
      >
        <div className="picker-head">
          <div>
            <h3>Add {symbol} to watchlist</h3>
            {companyName && <p className="picker-subtitle">{companyName}</p>}
          </div>
          <button type="button" className="picker-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {memberIds === null ? (
          <div className="picker-loading">Loading your watchlists…</div>
        ) : watchlists.length === 0 ? (
          <p className="picker-empty">You don't have any watchlists yet. Create one below.</p>
        ) : (
          <ul className="picker-list">
            {watchlists.map((w) => {
              const checked = memberIds.has(w.id);
              const busy = pending.has(w.id);
              return (
                <li key={w.id}>
                  <label className={`picker-row${busy ? " busy" : ""}`}>
                    <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggle(w.id)} />
                    <span>{w.name}</span>
                    {busy && <span className="picker-spinner" aria-hidden="true" />}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="picker-error">{error}</p>}

        <div className="picker-create">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New watchlist name"
            disabled={creating}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateAndAdd();
            }}
          />
          <button type="button" onClick={handleCreateAndAdd} disabled={creating || !newName.trim()}>
            {creating ? "Creating…" : "+ Create & add"}
          </button>
        </div>

        <div className="picker-actions">
          <button type="button" className="picker-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
