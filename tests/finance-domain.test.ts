import { describe, expect, it } from "vitest";
import {
  calculateAccountBalance,
  calculateBudgetRemaining,
  calculateCardCycle,
  calculateCardCommittedLimitCents,
  cardInstallmentDates,
  calculateGoalProgress,
  calculateInvoice,
  calculateMonthlyTotals,
  installmentDates,
  isEffectiveStatus,
  splitInstallments
} from "../src/domain/finance";

describe("financial domain regression rules", () => {
  it("separates realized, planned and cancelled transactions", () => {
    expect(isEffectiveStatus(undefined)).toBe(true);
    expect(isEffectiveStatus("paid")).toBe(true);
    expect(isEffectiveStatus("planned")).toBe(false);
    expect(isEffectiveStatus("cancelled")).toBe(false);
    const totals = calculateMonthlyTotals([
      { id: "1", kind: "income", status: "paid", amountCents: 50000, date: "2026-11-02" },
      { id: "2", kind: "expense", status: "planned", amountCents: 10000, date: "2026-11-03" },
      { id: "3", kind: "card_expense", amountCents: 7000, date: "2026-11-04" },
      { id: "4", kind: "expense", status: "cancelled", amountCents: 3000, date: "2026-11-05" },
      { id: "5", kind: "transfer", amountCents: 2000, date: "2026-11-06" }
    ], "2026-11");
    expect(totals).toEqual({
      incomeCents: 50000, expenseCents: 7000,
      plannedIncomeCents: 0, plannedExpenseCents: 10000
    });
  });

  it("calculates bank balances without debiting card purchases before invoice payment", () => {
    const entries = [
      { id: "income", kind: "income" as const, amountCents: 50000, date: "2026-11-02", accountId: "a" },
      { id: "expense", kind: "expense" as const, amountCents: 10000, date: "2026-11-03", accountId: "a" },
      { id: "transfer", kind: "transfer" as const, amountCents: 5000, date: "2026-11-04", transferFromAccountId: "a", transferToAccountId: "b" },
      { id: "card", kind: "card_expense" as const, amountCents: 8000, date: "2026-11-05", cardId: "c" },
      { id: "payment", kind: "card_payment" as const, amountCents: 6000, date: "2026-11-06", accountId: "a" },
      { id: "planned", kind: "income" as const, status: "planned" as const, amountCents: 3000, date: "2026-11-07", accountId: "a" },
      { id: "cancelled", kind: "expense" as const, status: "cancelled" as const, amountCents: 2000, date: "2026-11-08", accountId: "a" }
    ];
    expect(calculateAccountBalance(100000, "a", entries, "2026-11-30")).toBe(129000);
    expect(calculateAccountBalance(100000, "a", entries, "2026-11-30", true)).toBe(132000);
    expect(calculateAccountBalance(0, "b", entries, "2026-11-30")).toBe(5000);
    expect(calculateAccountBalance(-10000, "a", [], "2026-11-30")).toBe(-10000);
  });

  it("anchors card purchases to the first closing date on or after purchase", () => {
    expect(calculateCardCycle("2026-11-10", 10, 20)).toEqual({
      closingDate: "2026-11-10", dueDate: "2026-11-20"
    });
    expect(calculateCardCycle("2026-11-11", 10, 20)).toEqual({
      closingDate: "2026-12-10", dueDate: "2026-12-20"
    });
    expect(calculateCardCycle("2026-11-11", 10, 5)).toEqual({
      closingDate: "2026-12-10", dueDate: "2027-01-05"
    });
  });

  it("anchors card installments to consecutive billing cycles", () => {
    expect(cardInstallmentDates("2026-11-10", 10, 20, 3)).toEqual([
      "2026-11-10", "2026-12-10", "2027-01-10"
    ]);
    expect(cardInstallmentDates("2026-11-11", 10, 20, 3)).toEqual([
      "2026-11-11", "2026-12-11", "2027-01-11"
    ]);
  });

  it("keeps invoice payments separate and distinguishes partial, overdue and paid", () => {
    const entries = [
      { id: "a", kind: "card_expense" as const, cardId: "c", amountCents: 12000, date: "2026-10-08" },
      { id: "b", kind: "card_expense" as const, cardId: "c", amountCents: 8000, date: "2026-10-10" },
      { id: "c", kind: "card_expense" as const, cardId: "c", amountCents: 5000, date: "2026-10-11" },
      { id: "d", kind: "card_expense" as const, cardId: "c", status: "cancelled" as const, amountCents: 9000, date: "2026-10-09" }
    ];
    expect(calculateInvoice("c", 10, 20, entries, "2026-10-10", [{ amountCents: 5000, date: "2026-10-15" }], "2026-10-21"))
      .toEqual({ totalCents: 20000, paidCents: 5000, remainingCents: 15000, status: "partial" });
    expect(calculateInvoice("c", 10, 5, entries, "2026-10-10", [], "2026-11-06").status).toBe("overdue");
    expect(calculateInvoice("c", 10, 20, entries, "2026-10-10", [{ amountCents: 20000, date: "2026-10-20" }], "2026-11-01").status).toBe("paid");
  });

  it("releases card limit after invoice payment and ignores overdue cycles", () => {
    const entries = [
      { id: "a", kind: "card_expense" as const, cardId: "c", amountCents: 10000, date: "2026-10-05" },
      { id: "b", kind: "card_expense" as const, cardId: "c", amountCents: 5000, date: "2026-11-05" },
      { id: "c", kind: "card_expense" as const, cardId: "c", amountCents: 7000, date: "2026-09-05" }
    ];
    expect(calculateCardCommittedLimitCents("c", 10, 20, entries, new Map([
      ["2026-10-10", 10000], ["2026-11-10", 2000]
    ]), "2026-11-15")).toBe(3000);
  });

  it("splits installments exactly in integer cents and preserves month-end anchors", () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitInstallments(10000, 3).reduce((sum, part) => sum + part, 0)).toBe(10000);
    expect(installmentDates("2026-01-31", 4)).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"
    ]);
  });

  it("calculates budget and goal progress using realized values only", () => {
    const entries = [
      { id: "1", kind: "expense" as const, amountCents: 3000, date: "2026-11-02", categoryId: "food" },
      { id: "2", kind: "expense" as const, status: "planned" as const, amountCents: 2000, date: "2026-11-03", categoryId: "food" },
      { id: "3", kind: "expense" as const, status: "cancelled" as const, amountCents: 5000, date: "2026-11-04", categoryId: "food" }
    ];
    expect(calculateBudgetRemaining(10000, entries, "2026-11", "food")).toBe(7000);
    expect(calculateGoalProgress(10000, [
      { amountCents: 2500 }, { amountCents: 1000, status: "planned" }, { amountCents: 500, status: "cancelled" }
    ])).toEqual({ contributedCents: 2500, remainingCents: 7500, percentage: 25 });
  });
});
