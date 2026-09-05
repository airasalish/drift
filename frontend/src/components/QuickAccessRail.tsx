import { useState } from "react";
import { attentionTier } from "../lib/attention";
import type { Watchlist, WatchlistItem } from "../types";
import { BrandMark } from "./BrandMark";
import "./QuickAccessRail.css";

// A persistent quick-jump list plus a real second destination (History),
// not fake page navigation -- Drift doesn't get a "Markets" or
// "Dashboards" section here because there's no real content behind one.
// This borrows Koyfin's actual useful pattern: the watchlist stays visible
// and clickable while a detail panel is open, so switching between stocks
// is one click instead of close-then-reopen. Hidden below a width where
// there isn't room for it (see App.css); the drawer already covers
// "get to a stock's detail" fine on narrow screens.
export function QuickAccessRail({
  items,
  selectedId,
  view,
  onSelect,
  onShowHome,
  onShowHistory,
  onShowInsights,
  onShowPro,
  watchlists,
  activeWatchlistId,
  onCreateWatchlist,
  onRenameWatchlist,
  onDeleteWatchlist,
  onSwitchWatchlist,
}: {
  items: WatchlistItem[];
  selectedId: number | null;
  view: "watchlist" | "history";
  onSelect: (item: WatchlistItem) => void;
  onShowHome: () => void;
  onShowHistory: () => void;
  onShowInsights: () => void;
  onShowPro: () => void;
  watchlists: Watchlist[];
  activeWatchlistId: number | null;
  onCreateWatchlist: (name: string) => Promise<Watchlist>;
  onRenameWatchlist: (id: number, name: string) => Promise<Watchlist>;
  onDeleteWatchlist: (id: number) => Promise<void>;
  onSwitchWatchlist: (id: number) => void;
}) {
  const sorted = [...items].sort((a, b) => b.attention_score - a.attention_score);
  const [showWatchlistMenu, setShowWatchlistMenu] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [renameWatchlistId, setRenameWatchlistId] = useState<number | null>(null);
  const [renameWatchlistName, setRenameWatchlistName] = useState("");
  const [deleteWatchlistId, setDeleteWatchlistId] = useState<number | null>(null);

  const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId);
  // Always reachable, not gated on already having 2+ watchlists -- that
  // gate made "+ New watchlist" undiscoverable for literally everyone,
  // since every account starts with exactly one and the control that
  // creates a second one lived inside a menu that only appeared once a
  // second one already existed. The menu itself still stays compact for
  // a single-watchlist user (name + count + "New watchlist"), it's just
  // never fully hidden.

  async function handleCreateWatchlist() {
    if (!newWatchlistName.trim()) return;
    try {
      await onCreateWatchlist(newWatchlistName.trim());
      setNewWatchlistName("");
      setShowCreateDialog(false);
      setShowWatchlistMenu(false);
    } catch (e) {
      console.error("Failed to create watchlist:", e);
    }
  }

  async function handleRenameWatchlist() {
    if (!renameWatchlistId || !renameWatchlistName.trim()) return;
    try {
      await onRenameWatchlist(renameWatchlistId, renameWatchlistName.trim());
      setRenameWatchlistId(null);
      setRenameWatchlistName("");
      setShowRenameDialog(false);
      setShowWatchlistMenu(false);
    } catch (e) {
      console.error("Failed to rename watchlist:", e);
    }
  }

  async function handleDeleteWatchlist() {
    if (!deleteWatchlistId) return;
    try {
      await onDeleteWatchlist(deleteWatchlistId);
      setDeleteWatchlistId(null);
      setShowDeleteConfirm(false);
      setShowWatchlistMenu(false);
    } catch (e) {
      console.error("Failed to delete watchlist:", e);
    }
  }

  function openRenameDialog(watchlist: Watchlist) {
    setRenameWatchlistId(watchlist.id);
    setRenameWatchlistName(watchlist.name);
    setShowRenameDialog(true);
  }

  function openDeleteConfirm(watchlist: Watchlist) {
    setDeleteWatchlistId(watchlist.id);
    setShowDeleteConfirm(true);
  }

  return (
    <nav className="rail" aria-label="Watched symbols" data-tour="rail">
      <div className="rail-brand">
        <BrandMark />
      </div>

      {/* Watchlist switcher: always reachable so "+ New watchlist" (inside
          the menu below) isn't locked behind already having a second one. */}
      <>
        <div className="rail-watchlist-section">
          <button
            type="button"
            className="rail-watchlist-toggle"
            onClick={() => setShowWatchlistMenu(!showWatchlistMenu)}
            aria-expanded={showWatchlistMenu}
            aria-label="Switch watchlist"
          >
            <span className="rail-watchlist-name">{activeWatchlist?.name || "Watchlist"}</span>
            <span className="rail-watchlist-count">{watchlists.length}</span>
          </button>

          {showWatchlistMenu && (
            <div className="rail-watchlist-menu">
              {watchlists.map((watchlist) => (
                <div key={watchlist.id} className="rail-watchlist-item">
                  <button
                    type="button"
                    className={`rail-watchlist-option${watchlist.id === activeWatchlistId ? " active" : ""}`}
                    onClick={() => {
                      onSwitchWatchlist(watchlist.id);
                      setShowWatchlistMenu(false);
                    }}
                  >
                    <span className="rail-watchlist-option-name">{watchlist.name}</span>
                    {watchlist.id === activeWatchlistId && <span className="rail-watchlist-active-indicator">●</span>}
                  </button>
                  <div className="rail-watchlist-actions">
                    <button
                      type="button"
                      className="rail-watchlist-action"
                      onClick={() => openRenameDialog(watchlist)}
                      aria-label={`Rename ${watchlist.name}`}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="rail-watchlist-action rail-watchlist-action-danger"
                      onClick={() => openDeleteConfirm(watchlist)}
                      aria-label={`Delete ${watchlist.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="rail-watchlist-create"
                onClick={() => {
                  setShowCreateDialog(true);
                }}
              >
                + New watchlist
              </button>
            </div>
          )}
        </div>
      </>

      <button
        type="button"
        className={`rail-nav-item${view === "watchlist" ? " selected" : ""}`}
        onClick={onShowHome}
        aria-label="Open home"
        aria-current={view === "watchlist" ? "page" : undefined}
      >
        <span className="rail-nav-icon" aria-hidden="true">⌂</span>
        Home
      </button>

      <button
        type="button"
        className={`rail-nav-item${view === "history" ? " selected" : ""}`}
        onClick={onShowHistory}
        aria-label="Open history"
        aria-current={view === "history" ? "page" : undefined}
      >
        <span className="rail-nav-icon" aria-hidden="true">◷</span>
        History
      </button>

      <button type="button" className="rail-nav-item" onClick={onShowInsights}>
        <span className="rail-nav-icon" aria-hidden="true">⌁</span>
        Insights
      </button>
      {sorted.length > 0 && (
        <div className="rail-list">
          <span className="rail-label">Watching</span>
          {sorted.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rail-item${view === "watchlist" && item.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(item)}
              title={item.company_name ?? item.symbol}
              aria-label={`Open ${item.symbol}${item.company_name ? `, ${item.company_name}` : ""}`}
              aria-current={view === "watchlist" && item.id === selectedId ? "true" : undefined}
            >
              <span className={`rail-dot tier-${attentionTier(item)}`} />
              <span className="rail-symbol">{item.symbol}</span>
            </button>
          ))}
        </div>
      )}

      <button type="button" className="rail-upgrade" onClick={onShowPro}>
        <span className="rail-upgrade-title">Upgrade to Pro <b>→</b></span>
        <span className="rail-upgrade-copy">Get real-time alerts, advanced insights and more.</span>
        <span className="rail-upgrade-glow" aria-hidden="true" />
      </button>

      {/* Create Watchlist Dialog */}
      {showCreateDialog && (
        <div className="rail-dialog-overlay" onClick={() => setShowCreateDialog(false)}>
          <div className="rail-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Create new watchlist</h3>
            <input
              type="text"
              value={newWatchlistName}
              onChange={(e) => setNewWatchlistName(e.target.value)}
              placeholder="Watchlist name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateWatchlist();
                if (e.key === "Escape") setShowCreateDialog(false);
              }}
            />
            <div className="rail-dialog-actions">
              <button type="button" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </button>
              <button type="button" className="rail-dialog-primary" onClick={handleCreateWatchlist}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Watchlist Dialog */}
      {showRenameDialog && (
        <div className="rail-dialog-overlay" onClick={() => setShowRenameDialog(false)}>
          <div className="rail-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Rename watchlist</h3>
            <input
              type="text"
              value={renameWatchlistName}
              onChange={(e) => setRenameWatchlistName(e.target.value)}
              placeholder="New name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameWatchlist();
                if (e.key === "Escape") setShowRenameDialog(false);
              }}
            />
            <div className="rail-dialog-actions">
              <button type="button" onClick={() => setShowRenameDialog(false)}>
                Cancel
              </button>
              <button type="button" className="rail-dialog-primary" onClick={handleRenameWatchlist}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Watchlist Confirm Dialog */}
      {showDeleteConfirm && (
        <div className="rail-dialog-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="rail-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete watchlist?</h3>
            <p className="rail-dialog-warning">This will permanently delete this watchlist and all its items.</p>
            <div className="confirm-remove">
              <span>Are you sure?</span>
              <button className="yes" onClick={handleDeleteWatchlist}>
                Yes, delete
              </button>
              <button className="no" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
