import { describe, expect, it } from "vitest";
import {
  allocateInstallments,
  assertBalancedJournal,
  buildJournalLines,
  sumSpendableAccounts
} from "../src/domain/accounting";

describe("financial accounting invariants", () => {
  it("allocates installments exactly and places all residual cents in the first installment", () => {
    expect(allocateInstallments(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    expect(allocateInstallments(1_001, 4)).toEqual([254, 249, 249, 249]);
    expect(allocateInstallments(9_999, 1)).toEqual([9_999]);
  });

  it("rejects unsafe values and invalid installment counts", () => {
    expect(() => allocateInstallments(0, 1)).toThrow();
    expect(() => allocateInstallments(10, 0)).toThrow();
    expect(() => allocateInstallments(10, 49)).toThrow();
    expect(() => allocateInstallments(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow();
  });

  it("a credit-card purchase posts to expense and card liability, never bank", () => {
    const lines = buildJournalLines({ type: "card_expense", amountCents: 12_345 });
    expect(lines.map((line) => line.account)).toEqual(["expense", "card_liability"]);
    assertBalancedJournal(lines);
  });

  it("a PIX/debit/cash expense affects bank liquidity, never investments", () => {
    const lines = buildJournalLines({ type: "cash_expense", amountCents: 12_345 });
    expect(lines.map((line) => line.account)).toEqual(["expense", "bank"]);
    expect(lines.some((line) => line.account === "investment_asset" || line.account === "investment_cash")).toBe(false);
    assertBalancedJournal(lines);
  });

  it("a loan is an asset receivable, not a personal expense", () => {
    const lines = buildJournalLines({ type: "loan", amountCents: 50_000 });
    expect(lines.map((line) => line.account)).toEqual(["receivable_asset", "bank"]);
    expect(lines.some((line) => line.account === "expense")).toBe(false);
    assertBalancedJournal(lines);
  });

  it("a repayment restores bank liquidity without recording salary income", () => {
    const lines = buildJournalLines({ type: "loan_repayment", amountCents: 25_000 });
    expect(lines.map((line) => line.account)).toEqual(["bank", "receivable_asset"]);
    expect(lines.some((line) => line.account === "income")).toBe(false);
    assertBalancedJournal(lines);
  });

  it("overtime forecast is not a journal until explicit receipt conversion", () => {
    const forecast = { amountCents: 15_000, status: "pending" as const };
    expect(forecast.status).toBe("pending");
    const lines = buildJournalLines({ type: "overtime_receipt", amountCents: forecast.amountCents });
    expect(lines.map((line) => line.account)).toEqual(["bank", "income"]);
    assertBalancedJournal(lines);
  });

  it("investment contributions and redemptions only cross the bank/investment boundary explicitly", () => {
    const contribution = buildJournalLines({ type: "investment_contribution", amountCents: 100_000 });
    const redemption = buildJournalLines({ type: "investment_redemption", amountCents: 25_000 });
    expect(contribution.map((line) => line.account)).toEqual(["investment_asset", "bank"]);
    expect(redemption.map((line) => line.account)).toEqual(["bank", "investment_asset"]);
    assertBalancedJournal(contribution);
    assertBalancedJournal(redemption);
  });

  it("dashboard spendable balance excludes investment accounts", () => {
    expect(sumSpendableAccounts([
      { id: "bank", accountType: "checking", balanceCents: 100_000 },
      { id: "cash", accountType: "cash", balanceCents: 5_000 },
      { id: "broker", accountType: "investment", balanceCents: 900_000 }
    ])).toBe(105_000);
  });

  it("rejects unbalanced journals", () => {
    expect(() => assertBalancedJournal([
      { account: "bank", debitCents: 100, creditCents: 0 },
      { account: "expense", debitCents: 0, creditCents: 99 }
    ])).toThrow();
  });
});
