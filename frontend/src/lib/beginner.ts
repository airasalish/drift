import type { FiredRule } from "../types";

// Rewords the rule engine's precise phrasing into plain language for
// display -- it never changes what fired or why (the rule engine still
// decides everything), only how the same fact is worded. Applied
// unconditionally everywhere a fired rule is shown.
export function simplifyRuleMessage(f: FiredRule): string {
  switch (f.rule) {
    case "price_move": {
      const direction = f.value >= 0 ? "up" : "down";
      const isToday = f.message.includes("today");
      return isToday ? `Moved noticeably ${direction} today.` : `Moved ${direction} more than usual since you last checked.`;
    }
    case "unusual_volume":
      return "A lot more people are trading this than usual.";
    case "week52_high":
      return f.message.includes("new 52-week high")
        ? "This is the highest it's been all year."
        : "Close to its highest price all year.";
    case "week52_low":
      return f.message.includes("new 52-week low")
        ? "This is the lowest it's been all year."
        : "Close to its lowest price all year.";
    default:
      return f.message;
  }
}
