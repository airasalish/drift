import type { BenchmarkOut } from "../api";
import { formatPct, formatPoints, pctClass } from "../format";

// Surfaces the /api/watchlist/benchmark endpoint -- computed on the
// backend, wired here for the first time. Deliberately just three numbers,
// not a market dashboard: your watchlist's average day move, the
// benchmark's, and the gap between them in percentage points.
export function MarketContext({ benchmark }: { benchmark: BenchmarkOut | null }) {
  if (!benchmark || benchmark.watchlist_pct == null || benchmark.benchmark_pct == null) return null;

  const out = benchmark.outperformance_pct;

  return (
    <div className="market-context">
      <span className="mc-item">
        <span className="mc-label">Your watchlist</span>
        <span className={`mc-value ${pctClass(benchmark.watchlist_pct)}`}>{formatPct(benchmark.watchlist_pct)}</span>
      </span>
      <span className="mc-sep" aria-hidden>
        /
      </span>
      <span className="mc-item">
        <span className="mc-label">{benchmark.benchmark_label}</span>
        <span className={`mc-value ${pctClass(benchmark.benchmark_pct)}`}>{formatPct(benchmark.benchmark_pct)}</span>
      </span>
      {out != null && (
        <span className="mc-note">
          {out >= 0 ? "Outperforming the market by " : "Trailing the market by "}
          {formatPoints(Math.abs(out))}
        </span>
      )}
    </div>
  );
}
