import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type WatchlistTemplateOut } from "../api";
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
  watchlists,
  activeWatchlistId,
  onCreateWatchlist,
  onRenameWatchlist,
  onDeleteWatchlist,
  onSwitchWatchlist,
}: {
  items: WatchlistItem[];
  selectedId: number | null;
  view: "watchlist" | "history" | "chart";
  onSelect: (item: WatchlistItem) => void;
  onShowHome: () => void;
  onShowHistory: () => void;
  onShowInsights: () => void;
  watchlists: Watchlist[];
  activeWatchlistId: number | null;
  onCreateWatchlist: (name: string) => Promise<Watchlist>;
  onRenameWatchlist: (id: number, name: string) => Promise<Watchlist>;
  onDeleteWatchlist: (id: number) => Promise<void>;
  onSwitchWatchlist: (id: number) => void;
}) {
  const sorted = [...items].sort((a, b) => b.attention_score - a.attention_score);
  const watchlistToggleRef = useRef<HTMLButtonElement>(null);
  const [showWatchlistMenu, setShowWatchlistMenu] = useState(false);
  // The rail scrolls its own contents (overflow-y: auto), which forces
  // overflow-x to compute as auto too -- a menu positioned to pop out
  // past the rail's own edge gets silently clipped there rather than
  // floating over the page. Portaling to <body> with a viewport-relative
  // position (computed fresh each open) sidesteps that entirely.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  // "+ New watchlist" is a choice, not a single form -- scratch (empty,
  // name it yourself) or a template (real watchlist, pre-populated with a
  // curated set of symbols). "closed" hides the whole flow; "choice" is
  // the fork; "scratch"/"templates" are its two branches.
  const [createStep, setCreateStep] = useState<"closed" | "choice" | "scratch" | "templates">("closed");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [renameWatchlistId, setRenameWatchlistId] = useState<number | null>(null);
  const [renameWatchlistName, setRenameWatchlistName] = useState("");
  const [deleteWatchlistId, setDeleteWatchlistId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<WatchlistTemplateOut[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WatchlistTemplateOut | null>(null);
  const [templateWatchlistName, setTemplateWatchlistName] = useState("");
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);

  const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId);
  // Always reachable, not gated on already having 2+ watchlists -- that
  // gate made "+ New watchlist" undiscoverable for literally everyone,
  // since every account starts with exactly one and the control that
  // creates a second one lived inside a menu that only appeared once a
  // second one already existed. The menu itself still stays compact for
  // a single-watchlist user (name + count + "New watchlist"), it's just
  // never fully hidden.

  function closeCreateFlow() {
    setCreateStep("closed");
    setNewWatchlistName("");
    setSelectedTemplate(null);
    setTemplateWatchlistName("");
    setTemplatesError(null);
  }

  async function handleCreateWatchlist() {
    if (!newWatchlistName.trim()) return;
    try {
      await onCreateWatchlist(newWatchlistName.trim());
      closeCreateFlow();
      setShowWatchlistMenu(false);
    } catch (e) {
      console.error("Failed to create watchlist:", e);
    }
  }

  async function openTemplatesStep() {
    setCreateStep("templates");
    if (templates.length > 0) return;
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      setTemplates(await api.watchlists.templates());
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : "couldn't load templates");
    } finally {
      setTemplatesLoading(false);
    }
  }

  function selectTemplate(template: WatchlistTemplateOut) {
    setSelectedTemplate(template);
    setTemplateWatchlistName(template.display_name);
  }

  async function handleCreateFromTemplate() {
    if (!selectedTemplate || !templateWatchlistName.trim()) return;
    setCreatingFromTemplate(true);
    setTemplatesError(null);
    try {
      const created = await api.watchlists.createFromTemplate(selectedTemplate.template_name, templateWatchlistName.trim());
      onSwitchWatchlist(created.id);
      closeCreateFlow();
      setShowWatchlistMenu(false);
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : "couldn't create watchlist");
    } finally {
      setCreatingFromTemplate(false);
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
            ref={watchlistToggleRef}
            className="rail-watchlist-toggle"
            onClick={() => {
              if (!showWatchlistMenu && watchlistToggleRef.current) {
                const rect = watchlistToggleRef.current.getBoundingClientRect();
                setMenuPos({ top: rect.top, left: rect.right + 8 });
              }
              setShowWatchlistMenu((v) => !v);
            }}
            aria-expanded={showWatchlistMenu}
            aria-label="Switch watchlist"
          >
            <span className="rail-watchlist-name">{activeWatchlist?.name || "Watchlist"}</span>
            <span className="rail-watchlist-count">{watchlists.length}</span>
          </button>

          {showWatchlistMenu && menuPos && createPortal(
            <div className="rail-watchlist-menu" style={{ top: menuPos.top, left: menuPos.left }}>
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
                    <span className="rail-watchlist-option-count">{watchlist.item_count}</span>
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
                onClick={() => setCreateStep("choice")}
              >
                + New watchlist
              </button>
            </div>,
            document.body
          )}
        </div>
      </>

      <button
        type="button"
        className={`rail-nav-item${view === "watchlist" ? " selected" : ""}`}
        onClick={onShowHome}
        aria-label="Open home"
        aria-current={view === "watchlist" ? "page" : undefined}
        data-tooltip="Your tracked symbols, grouped by how much attention each one needs right now."
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
        data-tooltip="A timeline of everything Drift has flagged, and when you acknowledged it."
      >
        <span className="rail-nav-icon" aria-hidden="true">◷</span>
        History
      </button>

      <button
        type="button"
        className="rail-nav-item"
        onClick={onShowInsights}
        data-tooltip="Jumps to the attention feed below: the exact rule and numbers behind each flagged symbol."
      >
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

      {/* New Watchlist: choice -- scratch (empty) or a pre-made template
          (a real, populated watchlist from the first click) */}
      {createStep === "choice" && (
        <div className="rail-dialog-overlay" onClick={closeCreateFlow}>
          <div className="rail-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>New watchlist</h3>
            <div className="rail-create-choice">
              <button type="button" className="rail-create-choice-option" onClick={() => setCreateStep("scratch")}>
                <strong>Start from scratch</strong>
                <small>An empty watchlist you name and build up yourself.</small>
              </button>
              <button type="button" className="rail-create-choice-option" onClick={openTemplatesStep}>
                <strong>Use a pre-made watchlist</strong>
                <small>Pick a curated set (Technology, Banking, AI &amp; Semiconductors...) already populated with symbols.</small>
              </button>
            </div>
            <div className="rail-dialog-actions">
              <button type="button" onClick={closeCreateFlow}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* New Watchlist: from scratch */}
      {createStep === "scratch" && (
        <div className="rail-dialog-overlay" onClick={closeCreateFlow}>
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
                if (e.key === "Escape") closeCreateFlow();
              }}
            />
            <div className="rail-dialog-actions">
              <button type="button" onClick={() => setCreateStep("choice")}>
                Back
              </button>
              <button type="button" className="rail-dialog-primary" onClick={handleCreateWatchlist} disabled={!newWatchlistName.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Watchlist: from a pre-made template */}
      {createStep === "templates" && (
        <div className="rail-dialog-overlay" onClick={closeCreateFlow}>
          <div className="rail-dialog rail-dialog-wide" onClick={(e) => e.stopPropagation()}>
            {selectedTemplate ? (
              <>
                <h3>Name your {selectedTemplate.display_name} watchlist</h3>
                <p className="rail-dialog-warning">{selectedTemplate.symbol_count} symbols, ready to track immediately.</p>
                <input
                  type="text"
                  value={templateWatchlistName}
                  onChange={(e) => setTemplateWatchlistName(e.target.value)}
                  placeholder="Watchlist name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFromTemplate();
                    if (e.key === "Escape") setSelectedTemplate(null);
                  }}
                />
                {templatesError && <p className="rail-dialog-warning">{templatesError}</p>}
                <div className="rail-dialog-actions">
                  <button type="button" onClick={() => setSelectedTemplate(null)} disabled={creatingFromTemplate}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="rail-dialog-primary"
                    onClick={handleCreateFromTemplate}
                    disabled={creatingFromTemplate || !templateWatchlistName.trim()}
                  >
                    {creatingFromTemplate ? "Creating…" : "Create"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>Use a pre-made watchlist</h3>
                {templatesLoading ? (
                  <p className="rail-dialog-warning">Loading templates…</p>
                ) : templatesError ? (
                  <p className="rail-dialog-warning">{templatesError}</p>
                ) : (
                  <div className="rail-template-list">
                    {templates.map((template) => (
                      <button
                        type="button"
                        key={template.template_name}
                        className="rail-template-option"
                        onClick={() => selectTemplate(template)}
                      >
                        <strong>{template.display_name}</strong>
                        <small>{template.description}</small>
                        <span className="rail-template-count">{template.symbol_count} symbols</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="rail-dialog-actions">
                  <button type="button" onClick={() => setCreateStep("choice")}>
                    Back
                  </button>
                </div>
              </>
            )}
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
