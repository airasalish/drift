import { useState, type FormEvent } from "react";
import { SymbolInput } from "../SymbolInput";
import { ThesisChips } from "./ThesisChips";

export function AddStockForm({
  onAdd,
  adding,
}: {
  onAdd: (symbol: string, note: string) => Promise<void>;
  adding: boolean;
}) {
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) return;
    try {
      await onAdd(symbol.trim(), note.trim());
      setSymbol("");
      setNote("");
    } catch {
      // error is already surfaced via the shared error banner -- keep the
      // form's values in place so the user can just retry
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <div className="add-form-row">
        <SymbolInput value={symbol} onChange={setSymbol} disabled={adding} />
        <button type="submit" disabled={adding || !symbol.trim()}>
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
      <ThesisChips value={note} onChange={setNote} disabled={adding} />
    </form>
  );
}
