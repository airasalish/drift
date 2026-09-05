import { useState, type MouseEvent } from "react";

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 32;
const PAD = 3;

export function Sparkline({
  values,
  markerValue,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  interactive = false,
  onHover,
}: {
  values: number[];
  // price_at_last_view, when present -- rendered as a "you were here"
  // reference line at that value's height, not tied to a specific x
  // position, since we don't know which point in the series corresponds to
  // the exact moment the user last looked. That's an honest read of what
  // the data actually supports.
  markerValue?: number | null;
  width?: number;
  height?: number;
  // enables a hover crosshair over real data points (the drawer's larger
  // chart only -- the tiny row/card sparklines stay static, no reason to
  // pay the interaction cost there)
  interactive?: boolean;
  onHover?: (value: number | null, index: number | null) => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!values || values.length < 2) {
    return <svg width={width} height={height} className="spark" aria-hidden />;
  }

  const scaleValues = markerValue != null ? [...values, markerValue] : values;
  const min = Math.min(...scaleValues);
  const max = Math.max(...scaleValues);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (width - PAD * 2);
    const y = height - PAD - ((v - min) / range) * (height - PAD * 2);
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const areaPath = `${path} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`;

  const markerY =
    markerValue != null ? height - PAD - ((markerValue - min) / range) * (height - PAD * 2) : null;
  const [lastX, lastY] = points[points.length - 1];

  function handleMove(e: MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * (values.length - 1));
    setHoverIndex(idx);
    onHover?.(values[idx], idx);
  }

  function handleLeave() {
    setHoverIndex(null);
    onHover?.(null, null);
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`spark ${up ? "up" : "down"}${interactive ? " interactive" : ""}`}
    >
      <path d={areaPath} className="spark-fill" />
      {markerY != null && <line x1={PAD} y1={markerY} x2={width - PAD} y2={markerY} className="spark-marker" />}
      <path d={path} className="spark-line" fill="none" />
      {markerY != null && <circle cx={lastX} cy={lastY} r={2.4} className="spark-now-dot" />}
      {interactive && hovered && (
        <>
          <line x1={hovered[0]} y1={PAD} x2={hovered[0]} y2={height - PAD} className="spark-hover-line" />
          <circle cx={hovered[0]} cy={hovered[1]} r={2.8} className="spark-hover-dot" />
        </>
      )}
      {interactive && (
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        />
      )}
    </svg>
  );
}
