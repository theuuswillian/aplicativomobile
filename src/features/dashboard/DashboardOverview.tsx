import { useState } from "react";
import { TransactionGlyph } from "../../components/transactions/TransactionGlyph";
import { ArrowDownLeft, ArrowUpRight, BarChart3, ChevronRight, CreditCard, Landmark, PieChart, PiggyBank, ReceiptText, Target, TrendingUp, Wallet } from "lucide-react";
import type { AccountRow, BudgetRow, BudgetSpendRow, CardRow, CategoryRow, GoalRow, TransactionRow } from "../../types/app";
import { CategoryIcon } from "../../components/categories/CategoryIcon";
import { formatBRL, decimalToCents } from "../../lib/money";
import { formatDateBR } from "../../lib/date";
import { formatCents, formatCompactCurrency } from "../../lib/format";
import { expensesByCategory, monthKeyOf, monthlyFlow, monthTotals, percentChange, previousMonthKey } from "../../lib/finance-metrics";
import { Badge, Button, Card, EmptyState, GoalProgress, KpiCard, KpiSkeleton, ListSkeleton, ProgressBar } from "../../components/ui";
import { CashflowChart } from "../../components/charts/CashflowChart";
import { DonutChart } from "../../components/charts/DonutChart";
import { CHART_PALETTE } from "../../components/charts/palette";

type DashboardOverviewProps = {
  loading: boolean;
  balancesHidden: boolean;
  currentDate: string;
  accounts: readonly AccountRow[];
  accountBalances: Record<string, number>;
  cards: readonly CardRow[];
  cardCommittedAmounts: Record<string, number>;
  transactions: readonly TransactionRow[];
  categories: readonly CategoryRow[];
  goals: readonly GoalRow[];
  budgets?: readonly BudgetRow[];
  budgetSpend?: readonly BudgetSpendRow[];
  onOpenBudgets?: () => void;
  investedBrl: number;
  investedUsd: number;
  onNewTransaction: (kind: "income" | "expense" | "transfer") => void;
  onOpenTransactions: () => void;
  onOpenAccounts: () => void;
  onOpenInvestments: () => void;
  onOpenGoals: () => void;
  onOpenReports: () => void;
};

/** Visão Geral: KPIs do mês, gráficos e listas resumidas. Somente leitura; não altera dados. */
export function DashboardOverview(props: DashboardOverviewProps) {
  const { loading, balancesHidden, currentDate, accounts, accountBalances, cards, cardCommittedAmounts, transactions, categories, goals, investedBrl, investedUsd } = props;
  const hide = (text: string) => balancesHidden ? "R$ ••••••" : text;
  const liquidAccounts = accounts.filter((account) => account.account_type !== "investment");
  const balance = liquidAccounts.reduce((sum, account) => sum + (accountBalances[account.id] ?? 0), 0);
  const monthKey = monthKeyOf(currentDate);
  const current = monthTotals(transactions, monthKey);
  const previous = monthTotals(transactions, previousMonthKey(monthKey));
  const flow = monthlyFlow(transactions, currentDate, 6);
  const categorySpend = expensesByCategory(transactions, categories, monthKey);
  const categoryTotal = categorySpend.reduce((sum, item) => sum + item.amount, 0);
  const topCategories = categorySpend.slice(0, 5);
  const otherCategories = categorySpend.slice(5).reduce((sum, item) => sum + item.amount, 0);
  const donutRows = [...topCategories.map((item) => ({ key: item.id, label: item.name, value: item.amount })), ...(otherCategories > 0 ? [{ key: "outras", label: "Outras", value: otherCategories }] : [])]
    .map((item, index) => ({ ...item, color: CHART_PALETTE[index % CHART_PALETTE.length] }));
  const [hiddenSlices, setHiddenSlices] = useState<string[]>([]);
  const visibleDonut = donutRows.filter((item) => !hiddenSlices.includes(item.key));
  const visibleTotal = visibleDonut.reduce((sum, item) => sum + item.value, 0);
  const toggleSlice = (key: string) => setHiddenSlices((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length + 1 >= donutRows.length ? current : [...current, key]);
  const incomeTrend = percentChange(current.income, previous.income);
  const expenseTrend = percentChange(current.expense, previous.expense);
  const flowHasData = flow.some((point) => point.income > 0 || point.expense > 0);
  const netSeries = flow.reduce<number[]>((series, point) => [...series, (series[series.length - 1] ?? 0) + point.income - point.expense], []);
  const budgetRows = (props.budgets ?? []).map((budget) => {
    const category = categories.find((item) => item.id === budget.category_id);
    const spent = (props.budgetSpend ?? []).filter((item) => item.category_id === budget.category_id).reduce((total, item) => total + Number(decimalToCents(item.settled_amount)), 0);
    const limit = Number(decimalToCents(budget.limit_amount));
    return { id: budget.id, category, spent, limit, ratio: limit > 0 ? spent / limit : 0 };
  }).sort((a, b) => b.ratio - a.ratio);
  const centsLabel = (cents: number) => balancesHidden ? "••••" : formatCents(BigInt(Math.round(cents)));

  return <section className="overview-grid" aria-label="Resumo financeiro">
    <div className="kpi-grid" aria-busy={loading ? "true" : "false"}>
      {loading ? <><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></> : <>
        <KpiCard className="overview-balance" valueClassName="overview-balance-value" label="Saldo atual" icon={Wallet}
          spark={!balancesHidden && flowHasData ? netSeries : undefined} sparkLabel="Resultado acumulado dos últimos 6 meses"
          value={hide(formatBRL(balance))}
          hint={<>{liquidAccounts.length} {liquidAccounts.length === 1 ? "conta" : "contas"} · resultado do mês <b className={current.net >= 0 ? "amount-income" : "amount-expense"}>{balancesHidden ? "••••" : (current.net >= 0 ? "+" : "−") + formatBRL(Math.abs(current.net))}</b></>} />
        <KpiCard label="Receitas do mês" icon={ArrowDownLeft} value={hide(formatBRL(current.income))}
          spark={!balancesHidden && flowHasData ? flow.map((point) => point.income) : undefined} sparkTone="income" sparkLabel="Receitas dos últimos 6 meses"
          trend={!balancesHidden && incomeTrend !== null ? { percent: incomeTrend, higherIsBetter: true, caption: "vs. mês anterior" } : null}
          hint={balancesHidden ? "Valores ocultos" : "Sem base no mês anterior"} />
        <KpiCard label="Despesas do mês" icon={ArrowUpRight} value={hide(formatBRL(current.expense))}
          spark={!balancesHidden && flowHasData ? flow.map((point) => point.expense) : undefined} sparkTone="expense" sparkLabel="Despesas dos últimos 6 meses"
          trend={!balancesHidden && expenseTrend !== null ? { percent: expenseTrend, higherIsBetter: false, caption: "vs. mês anterior" } : null}
          hint={balancesHidden ? "Valores ocultos" : "Sem base no mês anterior"} />
        <KpiCard label="Patrimônio investido" icon={TrendingUp} value={hide(formatBRL(investedBrl))}
          hint={investedUsd > 0 ? (balancesHidden ? "US$ •••• em USD" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(investedUsd) + " em USD") : "Separado do saldo livre"} />
      </>}
    </div>

    <Card className="overview-flow" title="Fluxo mensal" titleId="overview-flow-title" icon={BarChart3} caption="Receitas e despesas realizadas · 6 meses"
      action={<button className="link-button" type="button" onClick={props.onOpenReports}>Relatório <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>}>
      {loading ? <div className="chart-skeleton" aria-hidden="true" /> : flowHasData ? <>
        <CashflowChart data={flow} hidden={balancesHidden} />
      </> : <EmptyState icon={BarChart3} title="Sem movimentação realizada" action={<Button variant="secondary" onClick={() => props.onNewTransaction("expense")}>Registrar lançamento</Button>}>O gráfico aparece quando houver receitas ou despesas realizadas.</EmptyState>}
    </Card>

    <Card className="overview-categories" title="Despesas por categoria" titleId="overview-categories-title" icon={PieChart} caption="Mês atual · realizadas">
      {loading ? <ListSkeleton rows={3} /> : categoryTotal > 0 ? <div className="category-breakdown">
        <DonutChart segments={visibleDonut} label={"Despesas do mês por categoria, total " + (balancesHidden ? "oculto" : formatBRL(visibleTotal))}
          centerValue={balancesHidden ? "••••" : formatCompactCurrency(visibleTotal)} centerCaption={hiddenSlices.length ? "selecionadas" : "no mês"} />
        <ul className="chart-legend-list">{donutRows.map((item) => { const off = hiddenSlices.includes(item.key); return <li key={item.key}>
          <button type="button" className={"chart-legend-item" + (off ? " is-off" : "")} aria-pressed={!off} onClick={() => toggleSlice(item.key)} title={`${balancesHidden ? "" : formatBRL(item.value) + " · "}${off ? "Mostrar" : "Ocultar"} ${item.label}`}>
            <i className="legend-swatch" style={{ background: item.color }} /><span>{item.label}</span><b>{Math.round(item.value / categoryTotal * 100)}%</b>
          </button>
        </li>; })}</ul>
      </div> : <EmptyState icon={PieChart} compact title="Nada por aqui ainda">As categorias aparecem quando houver despesas realizadas neste mês.</EmptyState>}
    </Card>

    <Card className="overview-recent" title="Lançamentos recentes" titleId="overview-recent-title" icon={ReceiptText}
      action={<button className="link-button" type="button" onClick={props.onOpenTransactions}>Ver todos <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>}>
      {loading ? <ListSkeleton rows={5} /> : transactions.length === 0
        ? <EmptyState icon={ReceiptText} title="Nenhum lançamento ainda" action={<Button variant="primary" onClick={() => props.onNewTransaction("expense")}>Registrar o primeiro</Button>}>Seus lançamentos aparecerão aqui assim que você registrar receitas ou despesas.</EmptyState>
        : <ul className="recent-list">{transactions.slice(0, 6).map((item) => {
          const category = categories.find((entry) => entry.id === item.category_id);
          return <li key={item.id}>
            <TransactionGlyph kind={item.kind} description={item.description} category={category} />
            <span className="recent-description"><strong>{item.description}</strong><small>{item.kind === "transfer" ? "Transferência" : category?.name ?? (item.kind === "income" ? "Receita" : "Despesa")} · <span className="numeric">{formatDateBR(item.transaction_date)}</span></small></span>
            <span className="recent-amount">
              <strong className={item.kind === "income" ? "amount-income" : item.kind === "transfer" ? "amount-neutral" : "amount-expense"}>{balancesHidden ? "••••" : (item.kind === "income" ? "+" : item.kind === "expense" ? "−" : "") + formatBRL(item.amount)}</strong>
              {item.status === "planned" && <Badge tone="warning">Previsto</Badge>}
              {item.status === "cancelled" && <Badge>Cancelado</Badge>}
            </span>
          </li>;
        })}</ul>}
    </Card>

    <div className="overview-side">
      <Card className="overview-cards" title="Faturas e cartões" titleId="overview-cards-title" icon={CreditCard}
        action={<button className="link-button" type="button" onClick={props.onOpenAccounts}>Gerenciar <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>}>
        {loading ? <ListSkeleton rows={2} /> : cards.length === 0
          ? <EmptyState icon={CreditCard} compact title="Nenhum cartão" action={<Button variant="secondary" onClick={props.onOpenAccounts}>Adicionar cartão</Button>}>Cadastre um cartão para acompanhar limite, fechamento e vencimento.</EmptyState>
          : <ul className="summary-list">{cards.map((card) => {
            const used = cardCommittedAmounts[card.id] ?? 0;
            const total = Number(card.credit_limit);
            const available = Math.max(0, total - used);
            const usage = total > 0 ? Math.min(100, used / total * 100) : 0;
            return <li key={card.id}>
              <div className="summary-row"><strong>{card.name} <small>final {card.last_four}</small></strong><b>{hide(formatBRL(used))}</b></div>
              <ProgressBar value={usage} label={`Limite usado do cartão ${card.name}`} tone={usage >= 90 ? "negative" : usage >= 70 ? "warning" : "accent"} />
              <div className="summary-meta"><span>Disponível {hide(formatBRL(available))}</span><span>Fecha dia {card.closing_day} · vence dia {card.due_day}</span></div>
            </li>;
          })}</ul>}
      </Card>

      <Card className="overview-budgets" title="Orçamentos do mês" titleId="overview-budgets-title" icon={PiggyBank}
        action={props.onOpenBudgets && <button className="link-button" type="button" onClick={props.onOpenBudgets}>Ajustar <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>}>
        {loading ? <ListSkeleton rows={3} /> : budgetRows.length === 0
          ? <EmptyState icon={PiggyBank} compact title="Sem limites definidos" action={props.onOpenBudgets && <Button variant="secondary" onClick={props.onOpenBudgets}>Definir orçamento</Button>}>Defina um limite por categoria para ver aqui quanto já foi usado no mês.</EmptyState>
          : <ul className="summary-list">{budgetRows.slice(0, 5).map((row) => <li key={row.id}>
            <div className="summary-row"><strong>{row.category && <CategoryIcon category={row.category} size={24} />}{row.category?.name ?? "Categoria"}</strong><b className={row.ratio > 1 ? "amount-expense" : undefined}>{Math.round(row.ratio * 100)}%</b></div>
            <GoalProgress mode="budget" hidePercent current={row.spent} target={row.limit} label={`Uso do orçamento de ${row.category?.name ?? "categoria"}`} format={centsLabel} />
          </li>)}</ul>}
      </Card>

      <Card className="overview-goals" title="Metas" titleId="overview-goals-title" icon={Target}
        action={<button className="link-button" type="button" onClick={props.onOpenGoals}>Ver metas <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>}>
        {loading ? <ListSkeleton rows={2} /> : goals.length === 0
          ? <EmptyState icon={Target} compact title="Nenhuma meta">Crie uma meta e acompanhe as contribuições até o objetivo.</EmptyState>
          : <ul className="summary-list">{goals.slice(0, 3).map((goal) => {
            const saved = decimalToCents(goal.current_amount);
            const target = decimalToCents(goal.target_amount);
            const percent = target > 0n ? Number((saved * 100n) / target) : 0;
            return <li key={goal.id}>
              <div className="summary-row"><strong>{goal.name}</strong><b>{Math.min(100, percent)}%</b></div>
              <GoalProgress mode="goal" compact current={Number(saved)} target={Number(target)} label={`Progresso da meta ${goal.name}`} format={centsLabel} />
              <div className="summary-meta"><span>{balancesHidden ? "••••" : formatCents(saved)} de {balancesHidden ? "••••" : formatCents(target)}</span></div>
            </li>;
          })}</ul>}
      </Card>

      <div className="overview-shortcuts">
        <button type="button" className="shortcut-tile" onClick={props.onOpenAccounts}><Landmark size={18} strokeWidth={1.75} aria-hidden="true" /><span>Contas</span><ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>
        <button type="button" className="shortcut-tile" onClick={props.onOpenInvestments}><TrendingUp size={18} strokeWidth={1.75} aria-hidden="true" /><span>Carteira</span><ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" /></button>
      </div>
    </div>
  </section>;
}
