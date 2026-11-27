// Métricas de leitura usadas pelo painel, por Gastos e por Relatórios.
// Funções puras: consideram apenas lançamentos realizados ("paid"), como as telas já faziam.
import type { CategoryRow, TransactionRow } from "../types/app";

type MetricTransaction = Pick<TransactionRow, "kind" | "status" | "amount" | "transaction_date" | "category_id">;

export type MonthTotals = { income: number; expense: number; net: number };
export type MonthlyFlowPoint = { key: string; label: string; income: number; expense: number };
export type CategorySpend = { id: string; name: string; icon: string | null; amount: number };

/** Chave AAAA-MM de uma data ISO (AAAA-MM-DD). */
export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Chave AAAA-MM do mês anterior ao informado. */
export function previousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Receitas, despesas e resultado realizados no mês. Transferências não entram. */
export function monthTotals(transactions: readonly MetricTransaction[], monthKey: string): MonthTotals {
  let income = 0;
  let expense = 0;
  for (const item of transactions) {
    if (item.status !== "paid" || !item.transaction_date.startsWith(monthKey)) continue;
    if (item.kind === "income") income += Number(item.amount);
    else if (item.kind === "expense") expense += Number(item.amount);
  }
  return { income, expense, net: income - expense };
}

/** Série mensal de receitas e despesas realizadas, terminando no mês da data de referência. */
export function monthlyFlow(transactions: readonly MetricTransaction[], referenceDate: string, months = 6): MonthlyFlowPoint[] {
  const reference = new Date(referenceDate + "T12:00:00");
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - (months - 1 - index), 1, 12);
    const key = String(date.getFullYear()) + "-" + String(date.getMonth() + 1).padStart(2, "0");
    const totals = monthTotals(transactions, key);
    return {
      key,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
      income: totals.income,
      expense: totals.expense,
    };
  });
}

/** Despesas realizadas no mês agrupadas por categoria, da maior para a menor. */
export function expensesByCategory(transactions: readonly MetricTransaction[], categories: readonly CategoryRow[], monthKey: string): CategorySpend[] {
  const monthRows = transactions.filter((item) => item.kind === "expense" && item.status === "paid" && item.transaction_date.startsWith(monthKey));
  return categories
    .filter((category) => category.kind === "expense")
    .map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      amount: monthRows.filter((item) => item.category_id === category.id).reduce((sum, item) => sum + Number(item.amount), 0),
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** Variação percentual; null quando não há base de comparação positiva. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
