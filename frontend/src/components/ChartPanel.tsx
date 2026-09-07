import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { WatchlistItem } from "../types";
import "./ChartPanel.css";

type TimeRange = "1D" | "1M" | "3M" | "6M" | "1Y" | "ALL";
type Point = { date: string; close: number; open?: number; high?: number; low?: number; volume?: number };

function formatCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatDate(raw: string) {
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? raw : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Simple, single-line-of-truth reference chart (area + line, dotted
// baseline, hover crosshair) -- deliberately not a candlestick/toolbar
// terminal. Matches the clean stock-chart pattern most people already
// recognize (Google's finance widget) rather than a trading-platform
// aesthetic this product never claimed to be. The previous version had
// "Indicators" / "Alert" / "+" toolbar buttons that did nothing when
// clicked -- removed rather than kept as decoration.
export function ChartPanel({ item }: { item: WatchlistItem }) {
  const [range, setRange] = useState<TimeRange>("1M");
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHoverIndex(null);
    api.watchlists
      .chart(item.symbol, range)
      .then((chart) => {
        if (cancelled) return;
        setData(
          chart.dates.map((date, index) => ({
            date,
            close: chart.closes[index],
            open: chart.opens?.[index],
            high: chart.highs?.[index],
            low: chart.lows?.[index],
            volume: chart.volumes?.[index],
          }))
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load chart");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.symbol, range]);

  const fetchedVisible = useMemo(() => data.filter((point) => Number.isFinite(point.close)), [data]);
  // This app deliberately fetches daily-granularity data only, never
  // intraday (see PROJECT_BRIEF.md) -- so a "1D" range genuinely has just
  // one data point from the backend, not enough to draw a line. Rather
  // than show an empty chart under a perfectly good "+0.13% today"
  // number, synthesize the one real two-point line that IS honestly
  // available: yesterday's actual close to today's actual price.
  const visible = useMemo(() => {
    if (range !== "1D" || fetchedVisible.length >= 2) return fetchedVisible;
    if (item.quote?.prev_close == null || item.quote?.price == null) return fetchedVisible;
    const today = fetchedVisible[0]?.date ?? new Date().toISOString().slice(0, 10);
    return [
      { date: "Previous close", close: item.quote.prev_close },
      { date: today, close: item.quote.price, volume: item.quote.volume ?? undefined },
    ];
  }, [range, fetchedVisible, item.quote?.prev_close, item.quote?.price, item.quote?.volume]);
  const last = visible[visible.length - 1];
  const first = visible[0];

  // Daily change (today's quote vs. yesterday's real close) is independent
  // of whatever range is selected; range return is first-to-last of
  // whichever timeframe is picked. Only one is ever shown at a time, and
  // it's always labeled for which one it is -- see the chart-change-row
  // below and ChartView.tsx's sibling fix for the bug this avoids.
  const dailyChange =
    item.quote?.price != null && item.quote?.prev_close
      ? ((item.quote.price - item.quote.prev_close) / item.quote.prev_close) * 100
      : null;
  const rangeChange = first && last ? ((last.close - first.close) / first.close) * 100 : null;
  const change = range === "1D" ? dailyChange : rangeChange;
  const active = hoverIndex != null ? visible[hoverIndex] : last;

  // The dotted reference line: previous close for the 1D view (matches
  // the daily-change number above it), or the range's own starting price
  // for longer views (matches the range-return number instead) -- always
  // the same baseline the displayed change is measured against.
  const referenceValue = range === "1D" ? item.quote?.prev_close ?? first?.close ?? 0 : first?.close ?? 0;

  const min = visible.length ? Math.min(...visible.map((p) => p.low ?? p.close), referenceValue) : 0;
  const max = visible.length ? Math.max(...visible.map((p) => p.high ?? p.close), referenceValue) : 1;
  const span = Math.max(max - min, 0.0001);

  const width = 900;
  const plotLeft = 8;
  const plotRight = 64;
  const plotTop = 16;
  const plotBottom = 220;
  const plotWidth = width - plotLeft - plotRight;
  const plotHeight = plotBottom - plotTop;
  const yFor = (value: number) => plotTop + ((max - value) / span) * plotHeight;
  const xFor = (index: number) => plotLeft + (index / Math.max(visible.length - 1, 1)) * plotWidth;

  const linePath = visible.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.close).toFixed(1)}`).join(" ");
  const areaPath = visible.length
    ? `${linePath} L${xFor(visible.length - 1).toFixed(1)},${plotBottom} L${xFor(0).toFixed(1)},${plotBottom} Z`
    : "";

  const isUp = (change ?? 0) >= 0;
  const lineColor = isUp ? "var(--green)" : "var(--red)";
  const absoluteChange = active ? active.close - referenceValue : 0;

  // Sparse date labels across the x-axis, ~5 evenly spaced -- not one
  // per data point, which would overlap on anything but a 1D view.
  const axisTicks = useMemo(() => {
    if (visible.length < 2) return [];
    const count = Math.min(5, visible.length);
    const step = (visible.length - 1) / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round(i * step));
  }, [visible.length]);

  return (
    <div className="chart-panel">
      <div className="chart-symbol-row">
        <span className="chart-symbol-badge">{item.symbol.slice(0, 2)}</span>
        <div>
          <strong>{item.symbol}</strong>
          <small>{item.company_name ?? "Tracked symbol"}</small>
        </div>
      </div>

      <div className="chart-price-block">
        <div className="chart-price-main">
          {active ? active.close.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
          <span className="chart-currency">{item.quote?.currency ?? ""}</span>
        </div>
        {change != null && (
          <div className="chart-change-row">
            <span className={`chart-change-pill ${isUp ? "up" : "down"}`}>
              {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
            </span>
            <span className={`chart-change-abs ${isUp ? "up" : "down"}`}>
              {isUp ? "+" : ""}
              {absoluteChange.toFixed(2)} {range === "1D" ? "today" : `over ${range}`}
            </span>
          </div>
        )}
        <div className="chart-meta-line">
          {active ? formatDate(active.date) : "Loading market data"}
          {range === "1D" && item.quote?.prev_close != null
            ? ` · Previous close ${item.quote.prev_close.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : ""}
        </div>
      </div>

      <div className="range-tabs">
        {(["1D", "1M", "3M", "6M", "1Y", "ALL"] as TimeRange[]).map((r) => (
          <button type="button" key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
            {r}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="chart-loading">Loading chart…</div>
      ) : error ? (
        <div className="chart-error">{error}</div>
      ) : visible.length < 2 ? (
        <div className="chart-empty">No chart data available for this symbol.</div>
      ) : (
        <div className="market-chart-wrap">
          <svg
            className="market-chart"
            viewBox={`0 0 ${width} ${plotBottom + 34}`}
            role="img"
            aria-label={`${item.symbol} price chart`}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - rect.left) / rect.width) * width;
              const idx = Math.round(((px - plotLeft) / plotWidth) * (visible.length - 1));
              setHoverIndex(Math.max(0, Math.min(visible.length - 1, idx)));
            }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={`chartFill-${item.symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
              </linearGradient>
            </defs>

            <line
              x1={plotLeft}
              x2={width - plotRight}
              y1={yFor(referenceValue)}
              y2={yFor(referenceValue)}
              className="reference-line"
            />
            <text x={width - plotRight + 8} y={yFor(referenceValue) + 4} className="reference-label">
              {referenceValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </text>

            <path d={areaPath} fill={`url(#chartFill-${item.symbol})`} />
            <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" />

            {axisTicks.map((i) => (
              <text key={i} x={xFor(i)} y={plotBottom + 22} className="axis-label" textAnchor="middle">
                {formatDate(visible[i].date)}
              </text>
            ))}

            {hoverIndex != null && (
              <>
                <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={plotTop} y2={plotBottom} className="crosshair" />
                <circle
                  cx={xFor(hoverIndex)}
                  cy={yFor(visible[hoverIndex].close)}
                  r="4"
                  fill={lineColor}
                  stroke="var(--bg)"
                  strokeWidth="2"
                />
              </>
            )}
          </svg>
        </div>
      )}

      <div className="chart-footer">
        <span>
          Open <strong>{active?.open?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</strong>
        </span>
        <span>
          High <strong>{active?.high?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</strong>
        </span>
        <span>
          Low <strong>{active?.low?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</strong>
        </span>
        <span>
          Volume <strong>{formatCompact(active?.volume ?? 0)}</strong>
        </span>
        <span className="footer-live">● {item.quote?.is_stale ? "Stale" : "Live"}</span>
      </div>
    </div>
  );
}
