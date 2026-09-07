import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { WatchlistItem } from "../types";
import { CompanyFavicon } from "./CompanyFavicon";
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

// Real OHLC candlesticks + volume for daily and intraday ranges. The 1D view
// requests 5-minute bars when the provider has them, and falls back to the
// previous-close/current-price line only when intraday data is unavailable.
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
  // If intraday data is unavailable, synthesize an honest two-point line from
  // yesterday's actual close to today's actual quote. Never invent OHLC bars.
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

  // Scroll-wheel zoom into a sub-range of the plotted points, entirely
  // local to the chart canvas -- a native, non-passive listener is used
  // (rather than React's onWheel) so preventDefault() actually stops the
  // browser's own page-scroll/pinch-zoom while the cursor is over the
  // chart, instead of zooming the whole page. Resets whenever the symbol
  // or range changes, but NOT on a background data refresh (same length),
  // so a live poll never yanks the user back out of a zoomed-in view.
  const chartWrapNodeRef = useRef<HTMLDivElement | null>(null);
  // The SVG's viewBox is kept in sync with the wrap div's actual rendered
  // pixel size (via ResizeObserver) instead of a fixed box -- a fixed
  // viewBox letterboxes inside whatever taller/wider area flexbox
  // actually gives the panel, leaving dead space above/below the chart
  // that has nothing to do with the data. Matching the two exactly means
  // the chart genuinely fills the panel, and CSS-sized text (font-size in
  // ChartPanel.css) stays 1:1 with viewBox units instead of getting
  // scaled oddly by a non-uniform stretch.
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 260 });
  const visibleLengthRef = useRef(visible.length);
  visibleLengthRef.current = visible.length;
  const [zoomRange, setZoomRange] = useState<[number, number]>([0, Math.max(0, visible.length - 1)]);

  useEffect(() => {
    setZoomRange([0, Math.max(0, visible.length - 1)]);
  }, [item.symbol, range, visible.length]);

  // Attached via a callback ref rather than useEffect(..., []) -- the wrap
  // div is conditionally rendered behind loading/error/empty states, so on
  // first paint it doesn't exist yet and an empty-deps effect would only
  // ever see a null ref and never re-run once the chart actually mounts.
  // A callback ref fires exactly when the DOM node itself appears/changes.
  const handleWheelRef = useRef((_e: WheelEvent) => {});
  handleWheelRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const total = visibleLengthRef.current;
    const node = chartWrapNodeRef.current;
    if (total < 6 || !node) return;
    setZoomRange(([s, endIdx]) => {
      const count = endIdx - s + 1;
      const minCount = Math.min(6, total);
      const factor = e.deltaY < 0 ? 0.82 : 1.22;
      const newCount = Math.max(minCount, Math.min(total, Math.round(count * factor)));
      if (newCount === count) return [s, endIdx];
      const rect = node.getBoundingClientRect();
      const frac = rect.width ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0.5;
      const cursorIdx = s + frac * count;
      let newStart = Math.round(cursorIdx - frac * newCount);
      let newEnd = newStart + newCount - 1;
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > total - 1) {
        newStart -= newEnd - (total - 1);
        newEnd = total - 1;
      }
      return [Math.max(0, newStart), newEnd];
    });
  };
  const stableWheelListenerRef = useRef<((e: WheelEvent) => void) | null>(null);
  if (!stableWheelListenerRef.current) {
    stableWheelListenerRef.current = (e: WheelEvent) => handleWheelRef.current(e);
  }
  const chartWrapRef = useCallback((node: HTMLDivElement | null) => {
    const listener = stableWheelListenerRef.current!;
    if (chartWrapNodeRef.current) chartWrapNodeRef.current.removeEventListener("wheel", listener);
    resizeObserverRef.current?.disconnect();
    chartWrapNodeRef.current = node;
    if (node) {
      node.addEventListener("wheel", listener, { passive: false });
      // Measure immediately on mount rather than only waiting on the
      // observer's first callback -- ResizeObserver's initial firing isn't
      // guaranteed to land within the same paint, and a synchronous
      // getBoundingClientRect() here means the very first render already
      // gets the real box instead of the fallback default.
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
      const ro = new ResizeObserver((entries) => {
        const r = entries[0]?.contentRect;
        if (r && r.width > 0 && r.height > 0) {
          setContainerSize({ width: r.width, height: r.height });
        }
      });
      ro.observe(node);
      resizeObserverRef.current = ro;
    }
  }, []);

  // Zooming reshuffles which index in the windowed slice the cursor was
  // last over -- clear it rather than let a stale hoverIndex point past
  // the end of the new (shorter) windowed array.
  useEffect(() => {
    setHoverIndex(null);
  }, [zoomRange]);

  const isZoomed = zoomRange[1] - zoomRange[0] + 1 < visible.length;
  const resetZoom = () => setZoomRange([0, Math.max(0, visible.length - 1)]);
  const windowed = useMemo(() => {
    const end = Math.min(zoomRange[1], Math.max(0, visible.length - 1));
    const start = Math.min(zoomRange[0], end);
    return visible.slice(start, end + 1);
  }, [visible, zoomRange]);
  const active = hoverIndex != null ? windowed[hoverIndex] : last;

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

  // The dotted reference line: previous close for the 1D view (matches
  // the daily-change number above it), or the range's own starting price
  // for longer views (matches the range-return number instead) -- always
  // the same baseline the displayed change is measured against.
  const referenceValue = range === "1D" ? item.quote?.prev_close ?? first?.close ?? 0 : first?.close ?? 0;

  // Candlesticks are available for 1D when real intraday OHLC is returned.
  // The fallback points intentionally remain a line because they have no
  // honest open/high/low values.
  const candleMode =
    windowed.length >= 2 &&
    windowed.every((p) => Number.isFinite(p.open) && Number.isFinite(p.high) && Number.isFinite(p.low));
  const hasVolume = candleMode && windowed.some((p) => Number.isFinite(p.volume) && (p.volume ?? 0) > 0);

  // The reference line only pins the y-axis range when showing the full
  // series -- once zoomed into a sub-range, the axis autoscales to what's
  // actually visible instead of being stretched to an off-screen baseline.
  const min = windowed.length
    ? Math.min(...windowed.map((p) => p.low ?? p.close), ...(isZoomed ? [] : [referenceValue]))
    : 0;
  const max = windowed.length
    ? Math.max(...windowed.map((p) => p.high ?? p.close), ...(isZoomed ? [] : [referenceValue]))
    : 1;
  const span = Math.max(max - min, 0.0001);
  const referenceInRange = referenceValue >= min && referenceValue <= max;

  const width = Math.max(containerSize.width, 240);
  const totalHeight = Math.max(containerSize.height, 160);
  const plotLeft = 8;
  const plotRight = 64;
  const plotTop = 16;
  const axisLabelSpace = 26;
  const usableHeight = Math.max(40, totalHeight - plotTop - axisLabelSpace);
  // Candle mode reserves a band under the price plot for volume bars,
  // sized as a share of whatever height is actually available; line mode
  // uses the full usable height, matching the original layout.
  const volumeGap = candleMode && hasVolume ? 14 : 0;
  const volumeBandHeight = candleMode && hasVolume ? Math.max(36, usableHeight * 0.2) : 0;
  const plotBottom = plotTop + Math.max(40, usableHeight - volumeGap - volumeBandHeight);
  const volumeTop = plotBottom + volumeGap;
  const volumeBottom = candleMode && hasVolume ? volumeTop + volumeBandHeight : plotBottom;
  const plotWidth = width - plotLeft - plotRight;
  const plotHeight = plotBottom - plotTop;
  const yFor = (value: number) => plotTop + ((max - value) / span) * plotHeight;
  const xFor = (index: number) => plotLeft + (index / Math.max(windowed.length - 1, 1)) * plotWidth;

  const linePath = windowed.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.close).toFixed(1)}`).join(" ");
  const areaPath = windowed.length
    ? `${linePath} L${xFor(windowed.length - 1).toFixed(1)},${plotBottom} L${xFor(0).toFixed(1)},${plotBottom} Z`
    : "";

  const isUp = (change ?? 0) >= 0;
  const lineColor = isUp ? "var(--green)" : "var(--red)";
  const absoluteChange = active ? active.close - referenceValue : 0;

  // Candle body width shrinks automatically as more bars are packed into
  // the same plot width (e.g. "ALL" on a stock with years of history, or
  // zooming back out after zooming in).
  const candleWidth = Math.max(1.5, Math.min(14, (plotWidth / Math.max(windowed.length, 1)) * 0.62));
  const maxVolume = hasVolume ? Math.max(...windowed.map((p) => p.volume ?? 0), 1) : 1;
  const volumeHeight = (v: number) => ((v ?? 0) / maxVolume) * (volumeBottom - volumeTop);

  // Sparse date labels across the x-axis, ~5 evenly spaced -- not one
  // per data point, which would overlap on anything but a 1D view.
  const axisTicks = useMemo(() => {
    if (windowed.length < 2) return [];
    const count = Math.min(5, windowed.length);
    const step = (windowed.length - 1) / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round(i * step));
  }, [windowed.length]);

  // Right-edge price gridlines, standard on every real stock chart.
  const priceTicks = useMemo(() => {
    if (!windowed.length) return [];
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => min + (span * i) / count);
  }, [windowed.length, min, span]);

  return (
    <div className="chart-panel">
      <div className="chart-symbol-row">
        <span className="chart-symbol-badge">
          {item.symbol.slice(0, 2)}
          <CompanyFavicon domain={item.company_website} symbol={item.symbol} />
        </span>
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
        {isZoomed && (
          <button type="button" className="chart-zoom-reset" onClick={resetZoom}>
            Reset zoom
          </button>
        )}
      </div>

      {loading ? (
        <div className="chart-loading">Loading chart…</div>
      ) : error ? (
        <div className="chart-error">{error}</div>
      ) : visible.length < 2 ? (
        <div className="chart-empty">No chart data available for this symbol.</div>
      ) : (
        <div className="market-chart-wrap" ref={chartWrapRef} title="Scroll to zoom · double-click to reset">
          <svg
            className="market-chart"
            viewBox={`0 0 ${width} ${totalHeight}`}
            role="img"
            aria-label={`${item.symbol} price chart`}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - rect.left) / rect.width) * width;
              const idx = Math.round(((px - plotLeft) / plotWidth) * (windowed.length - 1));
              setHoverIndex(Math.max(0, Math.min(windowed.length - 1, idx)));
            }}
            onMouseLeave={() => setHoverIndex(null)}
            onDoubleClick={resetZoom}
          >
            <defs>
              <linearGradient id={`chartFill-${item.symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
              </linearGradient>
            </defs>

            {priceTicks.map((value, i) => (
              <g key={i}>
                <line x1={plotLeft} x2={width - plotRight} y1={yFor(value)} y2={yFor(value)} className="grid-line" />
                <text x={width - plotRight + 8} y={yFor(value) + 4} className="axis-label">
                  {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </text>
              </g>
            ))}

            {referenceInRange && (
              <line
                x1={plotLeft}
                x2={width - plotRight}
                y1={yFor(referenceValue)}
                y2={yFor(referenceValue)}
                className="reference-line"
              />
            )}

            {candleMode ? (
              windowed.map((p, i) => {
                const up = p.close >= (p.open ?? p.close);
                const color = up ? "var(--green)" : "var(--red)";
                const bodyTop = yFor(Math.max(p.open ?? p.close, p.close));
                const bodyBottom = yFor(Math.min(p.open ?? p.close, p.close));
                return (
                  <g key={i} opacity={hoverIndex == null || hoverIndex === i ? 1 : 0.55}>
                    <line x1={xFor(i)} x2={xFor(i)} y1={yFor(p.high ?? p.close)} y2={yFor(p.low ?? p.close)} stroke={color} strokeWidth="1" />
                    <rect
                      x={xFor(i) - candleWidth / 2}
                      y={bodyTop}
                      width={candleWidth}
                      height={Math.max(1, bodyBottom - bodyTop)}
                      fill={color}
                    />
                  </g>
                );
              })
            ) : (
              <>
                <path d={areaPath} fill={`url(#chartFill-${item.symbol})`} />
                <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" />
              </>
            )}

            {hasVolume &&
              windowed.map((p, i) => {
                const up = p.close >= (p.open ?? p.close);
                return (
                  <rect
                    key={i}
                    x={xFor(i) - candleWidth / 2}
                    y={volumeBottom - volumeHeight(p.volume ?? 0)}
                    width={candleWidth}
                    height={volumeHeight(p.volume ?? 0)}
                    fill={up ? "var(--green)" : "var(--red)"}
                    opacity={hoverIndex == null || hoverIndex === i ? 0.5 : 0.25}
                  />
                );
              })}

            {axisTicks.map((i) => (
              <text key={i} x={xFor(i)} y={totalHeight - 8} className="axis-label" textAnchor="middle">
                {formatDate(windowed[i].date)}
              </text>
            ))}

            {hoverIndex != null && (
              <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={plotTop} y2={volumeBottom} className="crosshair" />
            )}
            {hoverIndex != null && !candleMode && (
              <circle
                cx={xFor(hoverIndex)}
                cy={yFor(windowed[hoverIndex].close)}
                r="4"
                fill={lineColor}
                stroke="var(--bg)"
                strokeWidth="2"
              />
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
