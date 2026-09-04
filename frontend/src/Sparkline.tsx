const WIDTH = 100;
const HEIGHT = 32;
const PAD = 3;

export function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) {
    return <svg width={WIDTH} height={HEIGHT} className="spark" aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (WIDTH - PAD * 2);
    const y = HEIGHT - PAD - ((v - min) / range) * (HEIGHT - PAD * 2);
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const areaPath = `${path} L${points[points.length - 1][0].toFixed(1)},${HEIGHT} L${points[0][0].toFixed(1)},${HEIGHT} Z`;

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={`spark ${up ? "up" : "down"}`}>
      <path d={areaPath} className="spark-fill" />
      <path d={path} className="spark-line" fill="none" />
    </svg>
  );
}
