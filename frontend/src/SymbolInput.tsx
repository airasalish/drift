import { useEffect, useRef, useState } from "react";
import { api, type SymbolSearchResult } from "./api";

const DEBOUNCE_MS = 300;

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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = value.trim();
    if (query.length < 2) {
      // a single letter is too ambiguous to rank usefully (e.g. "A" is
      // itself a real ticker -- Agilent -- so it's not "wrong" to return
      // that over Apple, just not what most people mean by typing "A")
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { results } = await api.searchSymbols(query);
        setResults(results);
        setOpen(results.length > 0);
      } catch {
        setResults([]);
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
