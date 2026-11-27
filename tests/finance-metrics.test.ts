import { describe, expect, it } from "vitest";
import { expensesByCategory, monthlyFlow, monthTotals, percentChange, previousMonthKey } from "../src/lib/finance-metrics";
import type { CategoryRow, TransactionRow } from "../src/types/app";

const tx = (kind: TransactionRow["kind"], amount: string | number, date: string, status: TransactionRow["status"] = "paid", category_id: string | null = null) =>
  ({ kind, status, amount: amount as string, transaction_date: date, category_id });

const rows = [
  tx("income", "5000.00", "2026-11-05"),
  tx("expense", 1234.5, "2026-11-10", "paid", "c1"),
  tx("expense", "300.00", "2026-11-12", "planned", "c1"),
  tx("expense", "200.00", "2026-11-15", "cancelled", "c2"),
  tx("transfer", "900.00", "2026-11-16"),
  tx("expense", "100.00", "2026-11-20", "paid", "c2"),
  tx("income", "4000.00", "2026-10-05"),
  tx("expense", "1000.00", "2026-10-08", "paid", "c1"),
];
const categories: CategoryRow[] = [
  { id: "c1", name: "Mercado", kind: "expense", color: null, icon: null },
  { id: "c2", name: "Lazer", kind: "expense", color: null, icon: null },
  { id: "c3", name: "Salário", kind: "income", color: null, icon: null },
];

describe("métricas financeiras da interface", () => {
  it("soma apenas lançamentos realizados e ignora transferências", () => {
    expect(monthTotals(rows, "2026-11")).toEqual({ income: 5000, expense: 1334.5, net: 3665.5 });
  });

  it("calcula o mês anterior inclusive na virada do ano", () => {
    expect(previousMonthKey("2026-11")).toBe("2026-10");
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });

  it("monta a série mensal terminando no mês de referência", () => {
    const flow = monthlyFlow(rows, "2026-11-26", 3);
    expect(flow.map((point) => point.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(flow[1]).toMatchObject({ income: 4000, expense: 1000 });
    expect(flow[2]).toMatchObject({ income: 5000, expense: 1334.5 });
  });

  it("agrupa despesas realizadas por categoria em ordem decrescente", () => {
    expect(expensesByCategory(rows, categories, "2026-11").map((item) => [item.id, item.amount])).toEqual([["c1", 1234.5], ["c2", 100]]);
  });

  it("não inventa variação sem base positiva", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(Number.NaN, 10)).toBeNull();
  });
});
