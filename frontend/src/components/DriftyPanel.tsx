import { useEffect, useState } from 'react';
import { api, type DriftyOut } from '../api';
import type { WatchlistItem } from '../types';
import './DriftyPanel.css';

export function DriftyPanel({ item, watchlistId }: { item: WatchlistItem; watchlistId: number | null }) {
  const [drifty, setDrifty] = useState<DriftyOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!watchlistId) {
      setDrifty(null);
      return;
    }
    let cancelled = false;
    async function loadDrifty() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.watchlists.drifty(watchlistId!, item.symbol);
        if (!cancelled) setDrifty(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Drifty analysis');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDrifty();
    return () => { cancelled = true; };
  }, [item.symbol, watchlistId]);

  return (
    <div className="drifty-panel">
      <div className="drifty-header">
        <h3>Drifty Analysis</h3>
        {item.has_attention && (
          <span className="drifty-badge flagged" title="This stock has important signals">
            Flagged
          </span>
        )}
      </div>

      {loading && <div className="drifty-loading">Analyzing {item.symbol}...</div>}
      {error && <div className="drifty-error">{error}</div>}

      {drifty && (
        <>
          {/* Attention Score */}
          <div className="drifty-section">
            <div className="drifty-label">Attention Score</div>
            <div className="attention-score">
              <div className="score-value">{drifty.attention_score}/100</div>
              <div className="score-bar">
                <div className="score-fill" style={{ width: `${drifty.attention_score}%` }} />
              </div>
            </div>
          </div>

          {/* Why Interesting */}
          {drifty.why_interesting.length > 0 && (
            <div className="drifty-section">
              <div className="drifty-label">Why Flagged</div>
              <ul className="why-list">
                {drifty.why_interesting.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Self Analysis */}
          <div className="drifty-section">
            <div className="drifty-label">Self (vs own history)</div>
            <div className="analysis-block">
              <p>{drifty.self_analysis.context}</p>
              <div className="data-grid">
                <div className="data-item">
                  <span className="data-label">Today</span>
                  <span className={`data-value ${drifty.self_analysis.today_pct_change >= 0 ? 'positive' : 'negative'}`}>
                    {drifty.self_analysis.today_pct_change >= 0 ? '+' : ''}{drifty.self_analysis.today_pct_change.toFixed(2)}%
                  </span>
                </div>
                <div className="data-item">
                  <span className="data-label">Normal move</span>
                  <span className="data-value">{drifty.self_analysis.normal_daily_move.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Peer Analysis */}
          <div className="drifty-section">
            <div className="drifty-label">Peer (vs watchlist)</div>
            <div className="analysis-block">
              <p>{drifty.peer_analysis.comparison}</p>
              {drifty.peer_analysis.cluster && (
                <div className="cluster-note">
                  {drifty.peer_analysis.cluster.symbols.length} {drifty.peer_analysis.cluster.name} stocks {drifty.peer_analysis.cluster.trend}
                </div>
              )}
            </div>
          </div>

          {/* Market Analysis */}
          <div className="drifty-section">
            <div className="drifty-label">Market (vs benchmark)</div>
            <div className="analysis-block">
              <p>{drifty.market_analysis.context}</p>
            </div>
          </div>
        </>
      )}

      {/* Note if exists */}
      {item.note && (
        <div className="drifty-section">
          <div className="drifty-label">Your Note</div>
          <div className="note-content">{item.note}</div>
        </div>
      )}
    </div>
  );
}
