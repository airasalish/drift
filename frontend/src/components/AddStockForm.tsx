import { useState, type FormEvent } from "react";
import type { SymbolSearchResult } from "../api";
import { SymbolInput } from "../SymbolInput";
import { ThesisChips } from "./ThesisChips";

export function AddStockForm({
  onAdd,
  adding,
}: {
  onAdd: (symbol: string, note: string, companyName?: string) => Promise<void>;
  adding: boolean;
}) {
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");
  // captured from the autocomplete pick, not a second lookup -- cleared
  // the moment the user edits the ticker away from what they picked, so a
  // stale name can never get attached to a different symbol
  const [picked, setPicked] = useState<SymbolSearchResult | null>(null);

  function handleSymbolChange(v: string) {
    setSymbol(v);
    if (picked && v.trim().toUpperCase() !== picked.symbol.toUpperCase()) setPicked(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    const companyName =
      picked && picked.symbol.toUpperCase() === symbol.trim().toUpperCase() ? picked.name : undefined;
    try {
      await onAdd(symbol.trim(), note.trim(), companyName);
      setSymbol("");
      setNote("");
      setPicked(null);
    } catch {
      // error is already surfaced via the shared error banner -- keep the
      // form's values in place so the user can just retry
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <div className="add-form-row">
        <SymbolInput value={symbol} onChange={handleSymbolChange} onSelect={setPicked} disabled={adding} />
        <button type="submit" disabled={adding || !symbol.trim()}>
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
      <ThesisChips value={note} onChange={setNote} disabled={adding} />
    </form>
  );
}
