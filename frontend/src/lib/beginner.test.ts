import { describe, expect, it } from "vitest";
import { simplifyRuleMessage } from "./beginner";

describe("simplifyRuleMessage", () => {
  it("rewrites a since-last-check price move", () => {
    expect(
      simplifyRuleMessage({
        rule: "price_move",
        message: "Moved 3.2% since last view vs 1.1% typical daily move",
        value: 0.032,
      })
    ).toBe("Moved up more than usual since you last checked.");
  });

  it("rewrites a down move today", () => {
    expect(
      simplifyRuleMessage({
        rule: "price_move",
        message: "Moved 2.0% today vs 0.8% typical daily move",
        value: -0.02,
      })
    ).toBe("Moved noticeably down today.");
  });

  it("rewrites unusual volume", () => {
    expect(
      simplifyRuleMessage({
        rule: "unusual_volume",
        message: "Volume is 2.4× the 20-day average",
        value: 2.4,
      })
    ).toBe("A lot more people are trading this than usual.");
  });

  it("rewrites 52-week high variants", () => {
    expect(
      simplifyRuleMessage({
        rule: "week52_high",
        message: "Hit a new 52-week high",
        value: 1,
      })
    ).toBe("This is the highest it's been all year.");
    expect(
      simplifyRuleMessage({
        rule: "week52_high",
        message: "Within 3% of its 52-week high",
        value: 0.02,
      })
    ).toBe("Close to its highest price all year.");
  });

  it("falls back to the original message for unknown rules", () => {
    expect(simplifyRuleMessage({ rule: "other", message: "Keep this wording.", value: 0 })).toBe(
      "Keep this wording."
    );
  });
});
