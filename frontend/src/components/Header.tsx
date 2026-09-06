import { useState } from "react";
import { formatRelative } from "../format";
import { BrandMark } from "./BrandMark";

async function shareDrift(): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const shareData = {
    title: "Drift",
    text: "Drift: a calmer watchlist that tells you what actually changed since you last looked.",
    url: window.location.origin,
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (e) {
      // user closed the native share sheet -- not an error, just no-op
      return e instanceof Error && e.name === "AbortError" ? "cancelled" : "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(shareData.url);
    return "copied";
  } catch {
    return "failed";
  }
}

export function Header({
  username,
  onLogout,
  itemCount,
  marketOpen,
  lastRefreshedAt,
  countdown,
  loading,
  error,
  beginnerMode,
  onToggleBeginnerMode,
  onRefresh,
}: {
  username: string | null;
  onLogout: () => void;
  itemCount: number;
  marketOpen: boolean;
  lastRefreshedAt: Date | null;
  countdown: number;
  loading: boolean;
  error: string | null;
  beginnerMode: boolean;
  onToggleBeginnerMode: () => void;
  onRefresh: () => void;
}) {
  const [shareStatus, setShareStatus] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  async function handleShare() {
    const result = await shareDrift();
    if (result === "cancelled") return;
    setShareStatus(result === "failed" ? "failed" : result);
    setTimeout(() => setShareStatus("idle"), 2200);
  }

  return (
    <header className="header">
      <div className="brand">
        <BrandMark />
        <div>
          <h1>Drift</h1>
          <p className="tagline">Not just prices, what actually drifted since you last looked.</p>
        </div>
      </div>

      <div className="header-right">
        {!loading && (
          <div className="status-meta" aria-live="polite">
            <span className={`dot${error ? " stale" : ""}`} />
            {lastRefreshedAt ? `Updated ${formatRelative(lastRefreshedAt.toISOString())}` : "Loading…"}
            <span className="sep">·</span>
            {`Next in ${countdown}s`}
            {itemCount > 0 && (
              <>
                <span className="sep">·</span>
                {`${itemCount} tracked`}
              </>
            )}
            <span className="sep">·</span>
            <span className={marketOpen ? "market-open" : "market-closed"}>
              {marketOpen ? "Market open" : "Market closed"}
            </span>
          </div>
        )}
        <div className="account">
          <button
            type="button"
            className={`beginner-toggle${beginnerMode ? " on" : ""}`}
            onClick={onToggleBeginnerMode}
            title="Reword rule explanations into plain language -- deterministic rewording, not AI: same rule, same numbers, simpler sentence"
          >
            {beginnerMode ? "Beginner mode: on" : "Beginner mode"}
          </button>
          <span className="beginner-help">Simpler explanations, same signals</span>
          <button
            type="button"
            className="refresh-btn"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh market data now"
            aria-label="Refresh market data now"
          >
            <span className={loading ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">↻</span>
            <span>{loading ? "Updating" : "Refresh"}</span>
          </button>
          <button
            type="button"
            className="share-btn"
            onClick={handleShare}
            title="Share Drift"
            aria-label="Share Drift"
          >
            <span aria-hidden="true">⇪</span>
            <span>{shareStatus === "shared" ? "Shared" : shareStatus === "copied" ? "Link copied" : shareStatus === "failed" ? "Couldn't share" : "Share"}</span>
          </button>
          {username && (
            <button className="logout-btn" onClick={onLogout}>
              Log out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
