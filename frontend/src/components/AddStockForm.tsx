import { useState, type FormEvent } from "react";
import type { SymbolSearchResult } from "../api";
import { SymbolInput } from "../SymbolInput";
import { ThesisChips } from "./ThesisChips";

export function AddStockForm({
  onAdd,
}: {
  // Opens the watchlist picker rather than adding directly -- this form
  // just captures which symbol and thesis the user means, then hands off
  // to the same picker every other "add" entry point uses.
  onAdd: (symbol: string, note: string, companyName?: string) => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");
  // captured from the autocomplete pick, not a second lookup -- also
  // doubles as visual confirmation of what got selected, since the plain
  // input text alone didn't make that obvious
  const [picked, setPicked] = useState<SymbolSearchResult | null>(null);

  function handleSymbolChange(v: string) {
    setSymbol(v);
    if (picked && v.trim().toUpperCase() !== picked.symbol.toUpperCase()) setPicked(null);
  }

  function clearPicked() {
    setPicked(null);
    setSymbol("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    const companyName =
      picked && picked.symbol.toUpperCase() === symbol.trim().toUpperCase() ? picked.name : undefined;
    onAdd(symbol.trim(), note.trim(), companyName);
    setSymbol("");
    setNote("");
    setPicked(null);
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <div className="add-form-heading">
        <div><strong>Add a company</strong><span>Track it to see what changes next.</span></div>
        <kbd>/</kbd>
      </div>
      <div className="add-form-row">
        {picked && picked.symbol.toUpperCase() === symbol.trim().toUpperCase() ? (
          <div className="symbol-selected-chip">
            <span className="ssc-ticker">{picked.symbol}</span>
            <span className="ssc-name">{picked.name}</span>
            <button type="button" className="ssc-clear" onClick={clearPicked} aria-label="Clear selection">
              ✕
            </button>
          </div>
        ) : (
          <SymbolInput value={symbol} onChange={handleSymbolChange} onSelect={setPicked} />
        )}
        <button type="submit" disabled={!symbol.trim()}>
          Add
        </button>
      </div>
      <ThesisChips value={note} onChange={setNote} />
    </form>
  );
}
