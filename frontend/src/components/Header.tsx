import { formatRelative } from "../format";
import { BrandMark } from "./BrandMark";

export function Header({
  username,
  onLogout,
  itemCount,
  marketOpen,
  lastRefreshedAt,
  countdown,
  loading,
  error,
}: {
  username: string | null;
  onLogout: () => void;
  itemCount: number;
  marketOpen: boolean;
  lastRefreshedAt: Date | null;
  countdown: number;
  loading: boolean;
  error: string | null;
}) {
  return (
    <header className="header">
      <div className="brand">
        <BrandMark />
        <div>
          <h1>Drift</h1>
          <p className="tagline">Not just prices — what actually drifted since you last looked.</p>
        </div>
      </div>

      <div className="header-right">
        {!loading && (
          <div className="status-meta">
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
        {username && (
          <div className="account">
            <span className="username">{username}</span>
            <button className="logout-btn" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
