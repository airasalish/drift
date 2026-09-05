import { useMemo, useState } from "react";

const SUGGESTIONS = [
  { symbol: "AAPL", name: "Apple Inc.", reason: "A calm large-cap counterweight for a tech-heavy watchlist." },
  { symbol: "MSFT", name: "Microsoft Corporation", reason: "Useful comparison for software and AI-led moves already on your list." },
  { symbol: "RELIANCE.NS", name: "Reliance Industries", reason: "Adds a liquid Indian market anchor beside your existing NSE names." },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", reason: "A direct way to compare Indian technology exposure over time." },
  { symbol: "AMZN", name: "Amazon.com, Inc.", reason: "Broadens your consumer and cloud exposure without changing Drift’s rules." },
];

export function SuggestedCompanies({
  trackedSymbols,
  onAdd,
}: {
  trackedSymbols: Set<string>;
  onAdd: (symbol: string, companyName: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const available = useMemo(() => SUGGESTIONS.filter((item) => !trackedSymbols.has(item.symbol)), [trackedSymbols]);
  if (available.length === 0) return null;

  async function add(item: (typeof SUGGESTIONS)[number]) {
    setAdding(item.symbol);
    try {
      await onAdd(item.symbol, item.name);
    } finally {
      setAdding(null);
    }
  }

  return (
    <section className="suggested-companies" aria-labelledby="suggested-title">
      <div className="suggested-head">
        <div>
          <span className="suggested-kicker">IDEAS TO EXPLORE</span>
          <h2 id="suggested-title">Build a more useful watchlist</h2>
          <p>Starter ideas based on coverage gaps, not financial advice. Each symbol still runs through Drift’s live rules after you add it.</p>
        </div>
        <span className="suggested-count">{available.length} available</span>
      </div>
      <div className="suggested-grid">
        {available.map((item) => (
          <article className="suggested-card" key={item.symbol}>
            <div className="suggested-card-top"><strong>{item.symbol}</strong><button type="button" onClick={() => add(item)} disabled={adding !== null}>{adding === item.symbol ? "Adding…" : "+ Add"}</button></div>
            <span className="suggested-name">{item.name}</span>
            <p><b>Why:</b> {item.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
