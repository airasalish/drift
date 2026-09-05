import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPct, formatPrice, formatRelative, pctClass } from "./format";

describe("formatPct", () => {
  it("returns an em dash for null", () => {
    expect(formatPct(null)).toBe("—");
  });

  it("adds a plus sign for non-negative values", () => {
    expect(formatPct(0)).toBe("+0.0%");
    expect(formatPct(0.1234)).toBe("+12.3%");
  });

  it("keeps the minus sign for negatives", () => {
    expect(formatPct(-0.051)).toBe("-5.1%");
  });
});

describe("formatPrice", () => {
  it("returns an em dash for null", () => {
    expect(formatPrice(null)).toBe("—");
  });

  it("falls back instead of throwing on an unknown currency code", () => {
    expect(formatPrice(12.3, "NOTAREAL")).toBe("NOTAREAL 12.30");
  });

  it("formats a known currency", () => {
    const out = formatPrice(10, "USD");
    expect(out).toMatch(/10/);
  });
});

describe("pctClass", () => {
  it("is empty for null, positive/negative otherwise", () => {
    expect(pctClass(null)).toBe("");
    expect(pctClass(0)).toBe("positive");
    expect(pctClass(-0.01)).toBe("negative");
  });
});

describe("formatRelative", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns never for null", () => {
    expect(formatRelative(null)).toBe("never");
  });

  it("formats seconds, minutes, hours, and days from a naive UTC stamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    expect(formatRelative("2026-01-01T11:59:20")).toBe("40s ago");
    expect(formatRelative("2026-01-01T11:10:00")).toBe("50m ago");
    expect(formatRelative("2026-01-01T09:00:00")).toBe("3h ago");
    expect(formatRelative("2025-12-30T12:00:00")).toBe("2d ago");
  });
});
