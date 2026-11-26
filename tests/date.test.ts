import { describe, expect, it } from "vitest";
import { todayInBrazil } from "../src/lib/date";

describe("todayInBrazil", () => {
  it("uses the Sao Paulo calendar date before UTC midnight", () => {
    expect(todayInBrazil(new Date("2026-11-26T01:00:00.000Z"))).toBe("2026-11-25");
  });

  it("uses the Sao Paulo calendar date after UTC midnight", () => {
    expect(todayInBrazil(new Date("2026-11-26T15:00:00.000Z"))).toBe("2026-11-26");
  });
});
