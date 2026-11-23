import { describe, expect, it } from "vitest";
import { calculateInvestmentSummary } from "../src/domain/investments";

describe("investment ledger", () => {
  it("calculates weighted average cost, partial sales and dividends", () => {
    expect(calculateInvestmentSummary([
      { type: "opening", date: "2026-01-01", quantity: 10, costCents: 100000 },
      { type: "buy", date: "2026-02-01", quantity: 10, unitPriceCents: 12000, feesCents: 1000 },
      { type: "sell", date: "2026-03-01", quantity: 5, unitPriceCents: 13000, feesCents: 500 },
      { type: "dividend", date: "2026-04-01", amountCents: 2500 }
    ])).toEqual({
      quantity: 15,
      costBasisCents: 165750,
      averageCostCents: 11050,
      realizedProfitCents: 9250,
      dividendsReceivedCents: 2500,
      error: null
    });
  });

  it("does not apply an impossible sale to the position", () => {
    const result = calculateInvestmentSummary([
      { type: "opening", date: "2026-01-01", quantity: 2, costCents: 20000 },
      { type: "sell", date: "2026-02-01", quantity: 3, unitPriceCents: 12000 }
    ]);
    expect(result.quantity).toBe(2);
    expect(result.error).toContain("Venda superior");
  });

  it("orders same-day opening position before subsequent operations", () => {
    const result = calculateInvestmentSummary([
      { type: "buy", date: "2026-01-01", quantity: 1, unitPriceCents: 1000 },
      { type: "opening", date: "2026-01-01", quantity: 2, costCents: 2000 }
    ]);
    expect(result.quantity).toBe(3);
  });
});
