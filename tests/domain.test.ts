import { describe, expect, it } from "vitest";
import { affectsIncomeOrExpense, isEffectiveTransaction } from "../src/types/domain";

describe("financial domain semantics", () => {
  it("keeps planned and cancelled transactions out of realized totals", () => {
    expect(isEffectiveTransaction("paid")).toBe(true);
    expect(isEffectiveTransaction("planned")).toBe(false);
    expect(isEffectiveTransaction("cancelled")).toBe(false);
  });

  it("does not classify transfers as income or expense", () => {
    expect(affectsIncomeOrExpense("income")).toBe(true);
    expect(affectsIncomeOrExpense("expense")).toBe(true);
    expect(affectsIncomeOrExpense("transfer")).toBe(false);
  });
});
