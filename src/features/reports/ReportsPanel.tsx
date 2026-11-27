import { BarChart3 } from "lucide-react";
import type { CategoryRow, TransactionRow } from "../../types/app";
import { expensesByCategory, monthKeyOf, monthTotals } from "../../lib/finance-metrics";
import { EmptyState } from "../../components/ui";

type ReportsPanelProps = {
  hidden: boolean;
  currentDate: string;
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
};

const currency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

/** Relatório mensal: somente lançamentos realizados no mês atual. */
export function ReportsPanel({ hidden, currentDate, transactions, categories }: ReportsPanelProps) {
  const monthKey = monthKeyOf(currentDate);
  const { income, expense, net } = monthTotals(transactions, monthKey);
  const byCategory = expensesByCategory(transactions, categories, monthKey);
  const categoryTotal = byCategory.reduce((sum, item) => sum + item.amount, 0);
  return <section className="panel reports-panel" id="conta-relatorios" hidden={hidden} aria-labelledby="reports-title">
    <div className="panel-heading"><span className="principles-label">Acompanhamento do mês</span><h2 id="reports-title">Relatório mensal</h2>
      <p>Resumo calculado a partir dos lançamentos realizados no mês atual. Valores previstos não entram neste resultado.</p></div>
    <div className="report-metrics">
      <article><span>Receitas</span><strong className="amount-income">{currency(income)}</strong></article>
      <article><span>Despesas</span><strong className="amount-expense">{currency(expense)}</strong></article>
      <article><span>Resultado</span><strong>{currency(net)}</strong></article>
    </div>
    <div className="card report-categories">
      <div className="transaction-heading"><strong>Despesas por categoria</strong><span>{byCategory.length} com movimento</span></div>
      {byCategory.length ? <ul className="report-category-list">{byCategory.map((item) => <li key={item.id}>
        <div><strong>{item.name}</strong><span>{categoryTotal > 0 ? Math.round(item.amount / categoryTotal * 100) : 0}% · {currency(item.amount)}</span></div>
        <progress className="budget-progress" max={100} value={categoryTotal > 0 ? item.amount / categoryTotal * 100 : 0} aria-label={`Participação de ${item.name} nas despesas`} />
      </li>)}</ul> : <EmptyState icon={BarChart3} compact>Ainda não há despesas realizadas por categoria neste mês.</EmptyState>}
    </div>
    <p className="helper-text">Relatório informativo baseado nos registros carregados. Não substitui extrato bancário ou documento fiscal.</p>
  </section>;
}
