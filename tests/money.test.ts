import { describe, expect, it } from "vitest";
import { formatBRLFromCents, toCents } from "../src/lib/money";

describe("money helpers", () => {
  it("normalizes decimal amounts to integer cents", () => {
    expect(toCents(12.34)).toBe(1234);
  });

  it("rounds positive and negative half-cent values symmetrically", () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(-1.005)).toBe(-101);
  });

  it("rejects values outside the safe integer-cent range", () => {
    expect(() => toCents(Number.MAX_VALUE)).toThrow(RangeError);
  });

  it("formats cents in Brazilian reais", () => {
    expect(formatBRLFromCents(1234)).toContain("12,34");
  });

  it("rejects non-finite values", () => {
    expect(() => toCents(Number.NaN)).toThrow();
  });
});


describe("Brazilian real input formatting", () => {
  it("formats typed digits as cents with Brazilian grouping", async () => {
    const { formatBrlInput } = await import("../src/lib/money");
    expect(formatBrlInput("1")).toBe("0,01");
    expect(formatBrlInput("1234")).toBe("12,34");
    expect(formatBrlInput("123456")).toBe("1.234,56");
    expect(formatBrlInput("")).toBe("");
    expect(formatBrlInput("-123456")).toBe("-1.234,56");
  });
});
