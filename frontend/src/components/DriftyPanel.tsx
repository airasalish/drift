import { useEffect, useState } from 'react';
import { api, type DriftyOut } from '../api';
import type { WatchlistItem } from '../types';
import './DriftyPanel.css';

// Reveals a generated sentence a few characters at a time, purely as a
// presentational flourish -- the data behind it already finished loading,
// this never adds real latency. Fast on purpose (a full sentence finishes
// well under a second): a slow, dramatic typewriter would read as making
// the user wait for something that's actually already there.
function TypewriterText({ text }: { text: string }) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    setShown('');
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 10);
    return () => clearInterval(id);
  }, [text]);
  return <>{shown}</>;
}

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
                  <li key={idx}><TypewriterText text={reason} /></li>
                ))}
              </ul>
            </div>
          )}

          {/* Self Analysis */}
          <div className="drifty-section">
            <div className="drifty-label">Self (vs own history)</div>
            <div className="analysis-block">
              <p><TypewriterText text={drifty.self_analysis.context} /></p>
              <div className="data-grid">
                <div className="data-item">
                  <span className="data-label">Today</span>
                  <span className={`data-value ${drifty.self_analysis.today_pct_change >= 0 ? 'positive' : 'negative'}`}>
                    {/* today_pct_change is a raw fraction from the backend
                        (0.025 == 2.5%), same convention as every other
                        *_pct field in this app -- must be *100 before
                        display, same as formatPct() does elsewhere. */}
                    {drifty.self_analysis.today_pct_change >= 0 ? '+' : ''}{(drifty.self_analysis.today_pct_change * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="data-item">
                  <span className="data-label">Normal move</span>
                  <span className="data-value">{(drifty.self_analysis.normal_daily_move * 100).toFixed(2)}%</span>
                </div>
                {drifty.self_analysis.volume_vs_normal > 0 && (
                  <div className="data-item">
                    <span className="data-label">Volume</span>
                    <span className="data-value">{drifty.self_analysis.volume_vs_normal.toFixed(1)}× normal</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Peer Analysis -- the real numbers behind "outlier"/"with the pack"
              (how many peers, how many of them also moved unusually) are
              computed on the backend either way; showing them turns a vague
              adjective into evidence instead of leaving it invisible. */}
          <div className="drifty-section">
            <div className="drifty-label">Peer (vs watchlist)</div>
            <div className="analysis-block">
              <p><TypewriterText text={drifty.peer_analysis.comparison} /></p>
              {drifty.peer_analysis.watchlist_size > 1 && (
                <div className="data-grid">
                  <div className="data-item">
                    <span className="data-label">Peers also unusual</span>
                    <span className="data-value">{drifty.peer_analysis.peers_unusual_count} of {drifty.peer_analysis.watchlist_size - 1}</span>
                  </div>
                  <div className="data-item">
                    <span className="data-label">Avg peer move</span>
                    <span className={`data-value ${drifty.peer_analysis.avg_peer_move >= 0 ? 'positive' : 'negative'}`}>
                      {drifty.peer_analysis.avg_peer_move >= 0 ? '+' : ''}{(drifty.peer_analysis.avg_peer_move * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}
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
              <p><TypewriterText text={drifty.market_analysis.context} /></p>
              <div className="data-grid">
                <div className="data-item">
                  <span className="data-label">Nifty 50 today</span>
                  <span className={`data-value ${drifty.market_analysis.benchmark_move >= 0 ? 'positive' : 'negative'}`}>
                    {drifty.market_analysis.benchmark_move >= 0 ? '+' : ''}{(drifty.market_analysis.benchmark_move * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="data-item">
                  <span className="data-label">Vs. benchmark</span>
                  <span className={`data-value ${drifty.market_analysis.outperformance >= 0 ? 'positive' : 'negative'}`}>
                    {drifty.market_analysis.outperformance >= 0 ? '+' : ''}{(drifty.market_analysis.outperformance * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
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
