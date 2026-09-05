// Canned reasons for "why are you watching this" -- turns the old free-text
// note field into a lightweight thesis picker. Still stored as plain text in
// WatchlistItem.note (no backend schema change): a preset is just a string
// that happens to match one of these; anything else is "Custom".
export const THESIS_PRESETS = [
  "Long-term hold",
  "Waiting for a price",
  "Earnings",
  "Recovery",
  "Breakout",
  "Just monitoring",
] as const;

export type ThesisPreset = (typeof THESIS_PRESETS)[number];

export function isPresetThesis(note: string | null | undefined): note is ThesisPreset {
  return note != null && (THESIS_PRESETS as readonly string[]).includes(note);
}
