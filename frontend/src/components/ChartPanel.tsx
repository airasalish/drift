import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { WatchlistItem } from "../types";
import "./ChartPanel.css";

type TimeRange = "1M" | "3M" | "6M" | "1Y" | "ALL";
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

export function ChartPanel({ item }: { item: WatchlistItem }) {
  const [range, setRange] = useState<TimeRange>("1M");
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [chartType, setChartType] = useState<"candles" | "line">("candles");
  const [showVolume, setShowVolume] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setHoverIndex(null);
    api.watchlists.chart(item.symbol, range).then((chart) => {
      if (cancelled) return;
      setData(chart.dates.map((date, index) => ({ date, close: chart.closes[index], open: chart.opens?.[index], high: chart.highs?.[index], low: chart.lows?.[index], volume: chart.volumes?.[index] })));
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load chart");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.symbol, range]);

  const visible = useMemo(() => data.filter((point) => Number.isFinite(point.close)), [data]);
  const last = visible[visible.length - 1];
  const first = visible[0];
  // This is the selected range's return (first point to last point of
  // whatever timeframe is picked, e.g. 1M) -- it is NOT today's change,
  // and must never be shown unlabeled next to the price as if it were.
  // See rangeChange's label in the JSX below.
  const rangeChange = first && last ? ((last.close - first.close) / first.close) * 100 : 0;
  // True daily change: today's quote vs. yesterday's actual close,
  // independent of whatever chart range is selected.
  const dailyChange =
    item.quote?.price != null && item.quote?.prev_close
      ? ((item.quote.price - item.quote.prev_close) / item.quote.prev_close) * 100
      : null;
  const active = hoverIndex != null ? visible[hoverIndex] : last;
  const min = visible.length ? Math.min(...visible.map((p) => p.low ?? p.close)) : 0;
  const max = visible.length ? Math.max(...visible.map((p) => p.high ?? p.close)) : 1;
  const maxVolume = Math.max(...visible.map((p) => p.volume ?? 0), 1);
  const width = 900; const plotLeft = 34; const plotRight = 74; const plotTop = 28; const priceBottom = showVolume ? 278 : 330; const plotWidth = width - plotLeft - plotRight;
  const y = (value: number) => plotTop + ((max - value) / Math.max(max - min, 0.0001)) * (priceBottom - plotTop);

  return <div className="chart-panel">
    <div className="tv-topbar"><div className="tv-symbol"><span className="tv-symbol-badge">{item.symbol.slice(0, 2)}</span><div><strong>{item.symbol}</strong><small>{item.company_name ?? "Tracked symbol"} · Market data</small></div></div><div className="tv-actions"><button type="button">＋</button><button type="button">Indicators</button><button type="button">⌁ Alert</button><button type="button">⋯</button></div></div>
    <div className="chart-heading"><div><div className="chart-price-line"><strong>{active ? active.close.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</strong>{dailyChange != null && <span className={dailyChange >= 0 ? "up" : "down"}>{dailyChange >= 0 ? "▲" : "▼"} {Math.abs(dailyChange).toFixed(2)}% today</span>}</div><span className="chart-meta">{active ? `${formatDate(active.date)} · ${item.quote?.currency ?? "market currency"}` : "Loading market data"}{visible.length > 1 && <> · <span className={rangeChange >= 0 ? "up" : "down"}>{range} return {rangeChange >= 0 ? "+" : ""}{rangeChange.toFixed(2)}%</span></>}</span></div><div className="range-tabs">{(["1M", "3M", "6M", "1Y", "ALL"] as TimeRange[]).map((r) => <button type="button" key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>{r}</button>)}</div></div>
    <div className="chart-toolbar"><div><button type="button" className={chartType === "candles" ? "selected" : ""} onClick={() => setChartType("candles")}>▥ Candles</button><button type="button" className={chartType === "line" ? "selected" : ""} onClick={() => setChartType("line")}>╱ Line</button></div><div><button type="button" onClick={() => setShowVolume((v) => !v)}>{showVolume ? "Hide volume" : "Show volume"}</button><span className="toolbar-separator">·</span><span>1D · {item.symbol}</span></div></div>
    {loading ? <div className="chart-loading">Loading candles…</div> : error ? <div className="chart-error">{error}</div> : visible.length < 2 ? <div className="chart-empty">No chart data available for this symbol.</div> : <div className="market-chart-wrap"><svg className="market-chart" viewBox={`0 0 ${width} ${showVolume ? 350 : 345}`} role="img" aria-label={`${item.symbol} interactive price chart`} onMouseLeave={() => setHoverIndex(null)}>
      {[0, 1, 2, 3, 4].map((step) => { const value = max - (max - min) * (step / 4); const yy = y(value); return <g key={step}><line x1={plotLeft} x2={width - plotRight} y1={yy} y2={yy} className="grid-line" /><text x={width - plotRight + 10} y={yy + 4} className="axis-label">{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</text></g>; })}
      {visible.map((point, index) => { const x = plotLeft + (index / Math.max(visible.length - 1, 1)) * plotWidth; const candleWidth = Math.max(2.5, Math.min(9, plotWidth / visible.length * .58)); const open = point.open ?? point.close; const high = point.high ?? Math.max(open, point.close); const low = point.low ?? Math.min(open, point.close); const up = point.close >= open; const color = up ? "#28b59a" : "#e45b6a"; const candleY = Math.min(y(open), y(point.close)); const candleH = Math.max(2, Math.abs(y(open) - y(point.close))); return <g key={`${point.date}-${index}`} onMouseMove={() => setHoverIndex(index)} className="candle-group"><line x1={x} x2={x} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1" /><rect x={x - candleWidth / 2} y={candleY} width={candleWidth} height={candleH} fill={chartType === "line" ? "transparent" : color} stroke={color} rx=".7" />{chartType === "line" && index > 0 && <line x1={plotLeft + ((index - 1) / Math.max(visible.length - 1, 1)) * plotWidth} y1={y(visible[index - 1].close)} x2={x} y2={y(point.close)} stroke="#8b7bf7" strokeWidth="2" />}{showVolume && <rect x={x - candleWidth / 2} y={320 - ((point.volume ?? 0) / maxVolume) * 45} width={candleWidth} height={((point.volume ?? 0) / maxVolume) * 45} fill={up ? "#28b59a55" : "#e45b6a55"} />}</g>; })}
      {hoverIndex != null && <line x1={plotLeft + (hoverIndex / Math.max(visible.length - 1, 1)) * plotWidth} x2={plotLeft + (hoverIndex / Math.max(visible.length - 1, 1)) * plotWidth} y1={plotTop} y2={showVolume ? 320 : priceBottom} className="crosshair" />}
      {visible.filter((_, index) => index % Math.max(1, Math.floor(visible.length / 5)) === 0).map((point, index) => <text key={index} x={plotLeft + (data.indexOf(point) / Math.max(visible.length - 1, 1)) * plotWidth} y="344" className="axis-label">{formatDate(point.date)}</text>)}
    </svg></div>}
    <div className="chart-footer"><span>Open {active?.open?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</span><span>High {active?.high?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</span><span>Low {active?.low?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</span><span>Volume {formatCompact(active?.volume ?? 0)}</span><span className="footer-live">● {item.quote?.is_stale ? "Stale" : "Live context"}</span></div>
  </div>;
}
