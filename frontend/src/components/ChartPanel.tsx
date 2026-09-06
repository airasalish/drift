import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { WatchlistItem } from '../types';
import './ChartPanel.css';

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

interface ChartData {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export function ChartPanel({ item }: { item: WatchlistItem }) {
  const [range, setRange] = useState<TimeRange>('1M');
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadChart() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/v1/watchlists/chart/${item.symbol}/${range}`);
        if (!response.ok) {
          throw new Error(`Failed to load chart: ${response.status}`);
        }
        const chartData = await response.json();

        // Convert API response to chart format
        const chartPoints: ChartData[] = [];
        if (chartData.dates && chartData.closes) {
          for (let i = 0; i < chartData.dates.length; i++) {
            chartPoints.push({
              date: chartData.dates[i],
              close: chartData.closes[i],
              open: chartData.opens?.[i],
              high: chartData.highs?.[i],
              low: chartData.lows?.[i],
              volume: chartData.volumes?.[i],
            });
          }
        }
        setData(chartPoints);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chart');
      } finally {
        setLoading(false);
      }
    }

    loadChart();
  }, [item.symbol, range]);

  const priceChange = data.length > 1 ? ((data[data.length - 1].close - data[0].close) / data[0].close) * 100 : 0;

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <div className="chart-title">
          <h2>{item.symbol}</h2>
          <span className={`chart-price ${priceChange >= 0 ? 'positive' : 'negative'}`}>
            ${data.length > 0 ? data[data.length - 1].close.toFixed(2) : 'N/A'}
            {priceChange !== 0 && <span className="change">{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%</span>}
          </span>
        </div>
        <div className="chart-controls">
          <div className="timeframe-buttons">
            {(['1M', '3M', '6M', '1Y', 'ALL'] as TimeRange[]).map((r) => (
              <button
                key={r}
                className={`timeframe-btn ${range === r ? 'active' : ''}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="chart-loading">Loading chart...</div>}
      {error && <div className="chart-error">{error}</div>}

      {!loading && !error && data.length > 0 && (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                stroke="var(--muted)"
                tick={{ fontSize: 12 }}
                interval={Math.floor(data.length / 5)}
              />
              <YAxis
                stroke="var(--muted)"
                tick={{ fontSize: 12 }}
                domain={['dataMin - 1', 'dataMax + 1']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--surface)',
                  border: `1px solid var(--border)`,
                  borderRadius: '0.5rem',
                }}
                labelStyle={{ color: 'var(--text)' }}
                formatter={(value) => `$${(value as number).toFixed(2)}`}
              />
              <Line
                type="monotone"
                dataKey="close"
                stroke="var(--accent)"
                dot={false}
                isAnimationActive={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="chart-empty">No data available</div>
      )}
    </div>
  );
}
