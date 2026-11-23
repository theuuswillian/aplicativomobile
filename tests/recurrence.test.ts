import { describe, expect, it } from "vitest";
import { generateOccurrences } from "../src/domain/recurrence";

describe("recurrence rules", () => {
  it("clamps monthly dates without drifting after February", () => {
    expect(generateOccurrences({
      id: "rent", frequency: "monthly", startsOn: "2026-01-31", monthDay: 31
    }, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"
    ]);
  });

  it("handles leap years for yearly rules", () => {
    expect(generateOccurrences({
      id: "annual", frequency: "yearly", startsOn: "2024-02-29"
    }, "2024-01-01", "2028-03-01")).toEqual([
      "2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"
    ]);
  });

  it("supports an explicit day of month and month of year", () => {
    expect(generateOccurrences({
      id: "rent-31", frequency: "monthly", startsOn: "2026-01-01", monthDay: 31
    }, "2026-01-01", "2026-03-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(generateOccurrences({
      id: "annual-tax", frequency: "yearly", startsOn: "2026-01-01", monthOfYear: 12, monthDay: 31
    }, "2026-01-01", "2027-12-31")).toEqual(["2026-12-31", "2027-12-31"]);
  });

  it("supports weekly and interval recurrence", () => {
    expect(generateOccurrences({
      id: "weekly", frequency: "weekly", startsOn: "2026-11-01", weekday: 1
    }, "2026-11-01", "2026-11-20")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(generateOccurrences({
      id: "custom", frequency: "interval", startsOn: "2026-11-01", intervalCount: 2, intervalUnit: "week"
    }, "2026-11-01", "2026-11-15")).toEqual(["2026-11-01", "2026-11-15"]);
  });

  it("respects start and end boundaries", () => {
    expect(generateOccurrences({
      id: "limited", frequency: "daily", startsOn: "2026-11-01", endsOn: "2026-11-03"
    }, "2026-11-02", "2026-11-10")).toEqual(["2026-11-02", "2026-11-03"]);
  });
});
