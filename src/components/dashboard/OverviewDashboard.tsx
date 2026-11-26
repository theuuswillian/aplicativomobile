import { useId } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Eye, EyeOff, Plus, Target,
  ChartNoAxesColumn, ReceiptText, WalletCards, TrendingUp,
} from "lucide-react";

export interface OverviewTransaction {
  id: string;
  kind: "income" | "expense";
  description: string;
  transaction_date: string;
  amount: number | string;
}

export interface CashflowMonth {
  key: string;
  label: string;
  income: number;
  expense: number;
}

interface OverviewDashboardProps {
  balance: number;
  accountCount: number;
  balancesHidden: boolean;
  onToggleBalances: () => void;
  investedBrl: number;
  investedUsd: number;
  income: number;
  expense: number;
  transactions: OverviewTransaction[];
  cashflow: CashflowMonth[];
  onAddExpense: () => void;
  onAddIncome: () => void;
  onGoals: () => void;
  onReports: () => void;
  onTransactions: () => void;
  onManage: () => void;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function Sparkline({ values }: { values: number[] }) {
  const id = useId();
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const points = values.map((value, index) => ({
    x: values.length < 2 ? 148 : 8 + index * (280 / (values.length - 1)),
    y: 34 - (value / max) * 24,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = points.length ? `${line} L 288 54 L 8 54 Z` : "";
  return (
    <svg className="gv-overview-sparkline" viewBox="0 0 296 58" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".22"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function OverviewDashboard(props: OverviewDashboardProps) {
  const {
    balance, accountCount, balancesHidden, onToggleBalances, investedBrl, investedUsd,
    income, expense, transactions, cashflow, onAddExpense, onAddIncome, onGoals,
    onReports, onTransactions, onManage,
  } = props;
  const net = income - expense;
  const maxFlow = Math.max(1, ...cashflow.flatMap((month) => [month.income, month.expense]));
  const trend = cashflow.map((month) => month.income - month.expense);

  return (
    <section className="gv-overview" aria-label="Visão geral financeira">
      <div className="gv-overview-heading">
        <div><span className="gv-eyebrow">SUA VIDA FINANCEIRA</span><h1>Visão geral</h1><p>Um panorama claro do seu dinheiro.</p></div>
        <span className="gv-live-indicator"><i /> Atualizado</span>
      </div>

      <section className="gv-overview-top" aria-label="Patrimônio e saldo">
        <article className="gv-balance-card">
          <div className="gv-card-kicker"><span>Saldo disponível</span><button type="button" onClick={onToggleBalances} aria-label={balancesHidden ? "Mostrar saldo" : "Ocultar saldo"} aria-pressed={balancesHidden}>{balancesHidden ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
          <strong className="gv-balance-value">{balancesHidden ? "R$ ••••••" : brl.format(balance)}</strong>
          <span className="gv-balance-caption">{accountCount} {accountCount === 1 ? "conta" : "contas"} e dinheiro físico</span>
          <Sparkline values={trend} />
          <div className="gv-balance-foot"><span>Fluxo líquido · 6 meses</span><span>{balancesHidden ? "••••" : brl.format(net)}</span></div>
        </article>

        <article className="gv-investment-card">
          <div className="gv-investment-icon"><TrendingUp size={19}/></div>
          <span>Patrimônio investido</span>
          <strong>{balancesHidden ? "R$ ••••••" : brl.format(investedBrl)}</strong>
          <small>{balancesHidden ? "••••" : usd.format(investedUsd)} em ativos USD</small>
          <span className="gv-investment-note">Separado da liquidez</span>
        </article>
      </section>

      <section className="gv-month-card" aria-label="Resumo do mês">
        <div className="gv-section-heading"><div><span className="gv-eyebrow">ACOMPANHAMENTO</span><h2>Resumo do mês</h2></div><span className={net >= 0 ? "gv-net-positive" : "gv-net-negative"}>{balancesHidden ? "••••" : (net >= 0 ? "+" : "−") + brl.format(Math.abs(net))}</span></div>
        <div className="gv-month-metrics">
          <div><span><ArrowDownLeft size={15}/> Receitas</span><strong className="gv-income">{balancesHidden ? "••••" : brl.format(income)}</strong></div>
          <div><span><ArrowUpRight size={15}/> Despesas</span><strong className="gv-expense">{balancesHidden ? "••••" : brl.format(expense)}</strong></div>
        </div>
      </section>

      <section className="gv-quick-actions" aria-label="Ações rápidas">
        <button type="button" onClick={onAddExpense}><span className="gv-action-icon gv-action-expense"><Plus size={19}/></span><span>Despesa</span></button>
        <button type="button" onClick={onAddIncome}><span className="gv-action-icon gv-action-income"><Plus size={19}/></span><span>Receita</span></button>
        <button type="button" onClick={onGoals}><span className="gv-action-icon gv-action-goals"><Target size={19}/></span><span>Metas</span></button>
        <button type="button" onClick={onReports}><span className="gv-action-icon gv-action-reports"><ChartNoAxesColumn size={19}/></span><span>Relatórios</span></button>
      </section>

      <section className="gv-activity-card">
        <div className="gv-section-heading"><div><span className="gv-eyebrow">MOVIMENTAÇÕES</span><h2>Últimos lançamentos</h2></div><button className="gv-text-link" type="button" onClick={onTransactions}>Ver todos <span>→</span></button></div>
        {transactions.length === 0 ? <p className="gv-empty">Seus lançamentos aparecerão aqui.</p> : (
          <ul className="gv-transaction-list">{transactions.slice(0, 4).map((item) => (
            <li key={item.id}>
              <span className={item.kind === "income" ? "gv-transaction-icon is-income" : "gv-transaction-icon"}>{item.kind === "income" ? <ArrowDownLeft size={18}/> : <ArrowUpRight size={18}/>}</span>
              <span className="gv-transaction-description"><strong>{item.description}</strong><small>{new Date(item.transaction_date + "T12:00:00").toLocaleDateString("pt-BR")}</small></span>
              <strong className={item.kind === "income" ? "gv-income" : "gv-expense"}>{item.kind === "income" ? "+" : "−"}{brl.format(Number(item.amount))}</strong>
            </li>
          ))}</ul>
        )}
      </section>

      <section className="gv-cashflow-card">
        <div className="gv-section-heading"><div><span className="gv-eyebrow">EVOLUÇÃO</span><h2>Fluxo dos últimos 6 meses</h2></div><span className="gv-chart-caption">Realizado</span></div>
        <div className="gv-cashflow-chart" role="img" aria-label="Comparação mensal entre receitas e despesas">
          {cashflow.map((month) => <div className="gv-cashflow-month" key={month.key}>
            <div className="gv-cashflow-bars"><span className="gv-bar-income" style={{ height: `${Math.max(3, month.income / maxFlow * 100)}%` }} /><span className="gv-bar-expense" style={{ height: `${Math.max(3, month.expense / maxFlow * 100)}%` }} /></div>
            <small>{month.label}</small>
          </div>)}
        </div>
        <div className="gv-chart-legend"><span><i className="gv-bar-income"/> Receitas</span><span><i className="gv-bar-expense"/> Despesas</span></div>
      </section>

      <button className="gv-manage-link" type="button" onClick={onManage}><WalletCards size={18}/> Organizar contas e cartões <span>→</span></button>
    </section>
  );
}
