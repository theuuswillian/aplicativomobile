import { describe, expect, it } from "vitest";
import { calculatePassiveIncomeSnapshot } from "../src/domain/income-goals";

const today = "2026-11-25";
describe("passive income snapshot", () => {
  it("averages received FII and stock provents over 12 months and excludes pending events", () => {
    const result = calculatePassiveIncomeSnapshot({
      today,
      assets: [
        { id: "fii", asset_class: "fii", currency: "BRL" },
        { id: "stock", asset_class: "stock", currency: "BRL" },
      ],
      operations: [],
      events: [
        { asset_id: "fii", event_type: "distribution", reference_date: "2026-10-10", payment_date: "2026-10-15", received_amount: "120.00", status: "received" },
        { asset_id: "stock", event_type: "dividend", reference_date: "2026-05-10", payment_date: "2026-05-15", received_amount: "60.00", status: "received" },
        { asset_id: "stock", event_type: "dividend", reference_date: "2026-11-20", payment_date: "2026-12-01", received_amount: "500.00", status: "planned" },
      ],
    });
    expect(result.proventsReceived12mCents).toBe(18000);
    expect(result.proventsMonthlyAverageCents).toBe(1500);
    expect(result.projectedMonthlyCents).toBe(1500);
  });

  it("estimates only active fixed-rate positions and keeps indexed rates out without a benchmark", () => {
    const result = calculatePassiveIncomeSnapshot({
      today,
      assets: [
        { id: "prefixado", asset_class: "fixed_income", currency: "BRL", metadata: { fixed_income: { indexer: "PREFIXADO", annual_rate_percent: "12", start_date: "2026-01-01", maturity_date: "2027-01-01" } } },
        { id: "cdi", asset_class: "fixed_income", currency: "BRL", metadata: { fixed_income: { indexer: "CDI", annual_rate_percent: "100", start_date: "2026-01-01", maturity_date: "2027-01-01" } } },
      ],
      operations: [
        { asset_id: "prefixado", operation_type: "opening", operation_date: "2026-01-01", quantity: "1000", unit_price: "1", gross_amount: "1000.00", fees: "0.00" },
        { asset_id: "cdi", operation_type: "opening", operation_date: "2026-01-01", quantity: "500", unit_price: "1", gross_amount: "500.00", fees: "0.00" },
      ],
      events: [],
    });
    expect(result.fixedIncomeEstimatedMonthlyCents).toBeGreaterThan(900);
    expect(result.fixedIncomeEstimatedMonthlyCents).toBeLessThan(1001);
    expect(result.unsupportedFixedIncomeCount).toBe(1);
    expect(result.projectedMonthlyCents).toBe(result.fixedIncomeEstimatedMonthlyCents);
  });

  it("does not count old, foreign-currency, cancelled or unreceived income as BRL provents", () => {
    const result = calculatePassiveIncomeSnapshot({
      today,
      assets: [
        { id: "old", asset_class: "fii", currency: "BRL" },
        { id: "usd", asset_class: "stock", currency: "USD" },
      ],
      operations: [],
      events: [
        { asset_id: "old", event_type: "dividend", reference_date: "2024-01-01", payment_date: "2024-01-02", received_amount: "99.00", status: "received" },
        { asset_id: "usd", event_type: "dividend", reference_date: "2026-10-01", payment_date: "2026-10-02", received_amount: "20.00", status: "received" },
        { asset_id: "old", event_type: "dividend", reference_date: "2026-10-01", payment_date: "2026-10-02", received_amount: "50.00", status: "cancelled" },
      ],
    });
    expect(result.proventsReceived12mCents).toBe(0);
    expect(result.allIncomeReceived12mCents).toBe(0);
    expect(result.foreignIncomeEventCount).toBe(1);
  });
});
