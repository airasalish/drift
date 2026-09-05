import { formatRelative } from "../format";

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

function BrandMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="brand-mark" aria-hidden>
      <rect width="34" height="34" rx="9" />
      <path
        d="M7 21 L13 14 L18 18 L27 8"
        stroke="currentColor"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
