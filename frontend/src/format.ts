export function formatPrice(v: number | null, currency: string | null = "USD"): string {
  if (v == null) return "N/A";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "narrowSymbol",
    }).format(v);
  } catch {
    // unrecognized currency code -- fall back rather than crash the row
    return `${currency ? currency + " " : "$"}${v.toFixed(2)}`;
  }
}

export function formatPct(v: number | null): string {
  if (v == null) return "N/A";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  // backend datetimes are naive UTC ISO strings (no trailing "Z")
  const then = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function formatTimeOfDay(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Used for the benchmark comparison -- deliberately phrased in percentage
// points, not a multiple ("3x the market"), since a ratio blows up or
// flips sign in confusing ways when the benchmark's own move is near zero.
// Points of difference stays well-defined and honest in every case.
export function formatPoints(v: number | null): string {
  if (v == null) return "N/A";
  return `${(v * 100).toFixed(1)} pts`;
}

export function pctClass(v: number | null): string {
  if (v == null) return "";
  return v >= 0 ? "positive" : "negative";
}
