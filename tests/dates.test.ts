import { describe, expect, it } from "vitest";
import { businessDateToday, formatBusinessDate } from "../src/lib/dates";

describe("business dates", () => {
  it("formats a calendar date in Brazilian notation", () => {
    expect(formatBusinessDate("2026-11-22")).toBe("22/11/2026");
  });

  it("derives the current date in the business timezone", () => {
    expect(businessDateToday(new Date("2026-11-23T02:30:00.000Z"))).toBe("2026-11-22");
  });

  it("rejects invalid dates", () => {
    expect(() => formatBusinessDate("not-a-date")).toThrow();
  });
});
