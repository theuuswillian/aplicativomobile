import { describe, expect, it } from "vitest";
import { formatBRLFromCents, toCents } from "../src/lib/money";

describe("money helpers", () => {
  it("normalizes decimal amounts to integer cents", () => {
    expect(toCents(12.34)).toBe(1234);
  });

  it("formats cents in Brazilian reais", () => {
    expect(formatBRLFromCents(1234)).toContain("12,34");
  });

  it("rejects non-finite values", () => {
    expect(() => toCents(Number.NaN)).toThrow();
  });
});
