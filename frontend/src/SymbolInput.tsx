import { useEffect, useRef, useState } from "react";
import { api, type SymbolSearchResult } from "./api";

const DEBOUNCE_MS = 180;

export function SymbolInput({
  value,
  onChange,
  onSelect,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  // fires with the full search result (symbol + company name) when the
  // user picks a dropdown option, not just its ticker -- lets the caller
  // capture the company name at add time without a second lookup
  onSelect?: (result: SymbolSearchResult) => void;
  disabled?: boolean;
}) {
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = value.trim();
    if (query.length < 1) {
      setResults([]);
      setSearching(false);
      setOpen(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { results } = await api.searchSymbols(query);
        setResults(results);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(result: SymbolSearchResult) {
    onChange(result.symbol);
    onSelect?.(result);
    setOpen(false);
  }

  return (
    <div className="symbol-input-wrap" ref={wrapRef}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search company or ticker"
        disabled={disabled}
        autoComplete="off"
      />
      {open && (
        <div className="symbol-dropdown">
          {searching && results.length === 0 && <div className="symbol-dropdown-status">Searching…</div>}
          {!searching && results.length === 0 && (
            <div className="symbol-dropdown-status">No matches for "{value.trim()}"</div>
          )}
          {results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              className="symbol-option"
              onClick={() => select(r)}
            >
              <span className="symbol-option-ticker">{r.symbol}</span>
              <span className="symbol-option-name">{r.name}</span>
              {r.exchange && <span className="symbol-option-exchange">{r.exchange}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
