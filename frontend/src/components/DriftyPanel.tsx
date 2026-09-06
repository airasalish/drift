import type { WatchlistItem } from '../types';
import './DriftyPanel.css';

export function DriftyPanel({ item }: { item: WatchlistItem }) {
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

      {/* Attention Score */}
      {item.attention_score !== undefined && (
        <div className="drifty-section">
          <div className="drifty-label">Attention Score</div>
          <div className="attention-score">
            <div className="score-value">{item.attention_score}/100</div>
            <div className="score-bar">
              <div
                className="score-fill"
                style={{ width: `${item.attention_score}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Flags/Rules Fired */}
      {item.fired && item.fired.length > 0 && (
        <div className="drifty-section">
          <div className="drifty-label">Signals</div>
          <div className="signals-list">
            {item.fired.map((signal, idx) => (
              <div key={idx} className="signal-item">
                <span className="signal-rule">{signal.rule}</span>
                <span className="signal-message">{signal.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price & Volume Info */}
      <div className="drifty-section">
        <div className="drifty-label">Current Data</div>
        <div className="data-grid">
          <div className="data-item">
            <span className="data-label">Price</span>
            <span className="data-value">${item.quote?.price?.toFixed(2) ?? 'N/A'}</span>
          </div>
          <div className="data-item">
            <span className="data-label">Change</span>
            <span className={`data-value ${(item.change_since_last_view_pct ?? 0) >= 0 ? 'positive' : 'negative'}`}>
              {(item.change_since_last_view_pct ?? 0) >= 0 ? '+' : ''}{((item.change_since_last_view_pct ?? 0) * 100).toFixed(2)}%
            </span>
          </div>
          {item.quote?.volume && (
            <div className="data-item">
              <span className="data-label">Volume</span>
              <span className="data-value">{(item.quote.volume / 1000000).toFixed(2)}M</span>
            </div>
          )}
        </div>
      </div>

      {/* Note if exists */}
      {item.note && (
        <div className="drifty-section">
          <div className="drifty-label">Your Note</div>
          <div className="note-content">{item.note}</div>
        </div>
      )}

      {/* Actions */}
      <div className="drifty-actions">
        <button className="action-btn primary">Add to another watchlist</button>
        <button className="action-btn secondary">Compare with similar</button>
      </div>
    </div>
  );
}
