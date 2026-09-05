import { THESIS_PRESETS, isPresetThesis } from "../lib/thesis";

// The "why are you watching this" picker, shared between the add flow and
// the drawer's thesis editor. Still just plain text under the hood (the
// `note` field) -- a preset is a string that matches one of these exactly,
// anything else falls into the custom input.
export function ThesisChips({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const custom = value !== "" && !isPresetThesis(value);

  return (
    <div className="thesis-chips">
      {THESIS_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          className={`thesis-chip${value === preset ? " selected" : ""}`}
          onClick={() => onChange(value === preset ? "" : preset)}
          disabled={disabled}
        >
          {preset}
        </button>
      ))}
      <input
        className={`thesis-custom${custom ? " selected" : ""}`}
        value={custom ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Custom…"
        disabled={disabled}
      />
    </div>
  );
}
