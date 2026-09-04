export function formatPrice(v: number | null): string {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

export function formatPct(v: number | null): string {
  if (v == null) return "—";
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
