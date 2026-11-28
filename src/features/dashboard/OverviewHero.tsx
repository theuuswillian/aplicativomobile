import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, Minus, Plus, TrendingUp, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkline } from "../../components/ui/Sparkline";
import { Skeleton } from "../../components/ui";
import { formatBRL } from "../../lib/money";
import { formatSignedPercent } from "../../lib/format";

type Trend = { percent: number; higherIsBetter: boolean } | null;

type OverviewHeroProps = {
  loading: boolean;
  balancesHidden: boolean;
  balance: number;
  accountCount: number;
  monthNet: number;
  income: number;
  expense: number;
  incomeTrend: Trend;
  expenseTrend: Trend;
  balanceSpark: readonly number[] | null;
  investedBrl: number;
  investedUsd: number;
  onOpenInvestments: () => void;
  onNewTransaction: (kind: "income" | "expense" | "transfer") => void;
};

const MASK = "R$ ••••••";

/** Variação contra o mês anterior; só aparece quando existe base de comparação. */
function TrendChip({ trend, hidden }: { trend: Trend; hidden: boolean }) {
  if (!trend || hidden) return null;
  const direction = trend.percent > 0 ? "up" : trend.percent < 0 ? "down" : "flat";
  const good = direction === "flat" ? null : (direction === "up") === trend.higherIsBetter;
  return <span className={"hero-trend " + (good === null ? "is-flat" : good ? "is-good" : "is-bad")}>
    {formatSignedPercent(trend.percent)}<span className="sr-only"> vs. mês anterior</span>
  </span>;
}

function HeroStat({ label, tone, icon, value, trend, hidden }: { label: string; tone: "income" | "expense"; icon: ReactNode; value: number; trend: Trend; hidden: boolean }) {
  return <div className={`hero-stat is-${tone}`}>
    <span className="hero-stat-label"><span className="hero-stat-icon" aria-hidden="true">{icon}</span><span className="hero-stat-label-text">{label}<span className="hero-stat-label-extra"> do mês</span></span></span>
    <span className="hero-stat-value-row">
      <strong className="hero-stat-value numeric">{hidden ? MASK : formatBRL(value)}</strong>
      <TrendChip trend={trend} hidden={hidden} />
    </span>
  </div>;
}

/**
 * Topo da Visão Geral no mobile (&lt;1024px): um único cartão com saldo, resultado do mês,
 * receitas/despesas lado a lado e o patrimônio investido numa linha que leva à Carteira.
 * Logo abaixo, atalhos para registrar despesa, receita ou transferência.
 */
export function OverviewHero(props: OverviewHeroProps) {
  const { loading, balancesHidden: hidden, balance, accountCount, monthNet } = props;
  if (loading) return <div className="overview-hero is-loading" aria-hidden="true">
    <Skeleton width="35%" height={12} />
    <Skeleton width="60%" height={30} />
    <Skeleton width="40%" height={20} radius={999} />
    <div className="hero-split"><Skeleton width="80%" height={34} /><Skeleton width="80%" height={34} /></div>
  </div>;

  const netTone = monthNet > 0 ? "is-positive" : monthNet < 0 ? "is-negative" : "is-flat";
  const netText = hidden ? "••••" : (monthNet > 0 ? "+" : monthNet < 0 ? "−" : "") + formatBRL(Math.abs(monthNet));
  const usd = props.investedUsd > 0 ? (hidden ? "US$ ••••" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(props.investedUsd)) : null;

  return <>
    <article className="overview-hero overview-balance" aria-labelledby="overview-hero-label">
      <div className="hero-head">
        <span className="hero-label" id="overview-hero-label"><Wallet size={16} strokeWidth={1.75} aria-hidden="true" />Saldo atual</span>
        <span className="hero-meta">{accountCount} {accountCount === 1 ? "conta" : "contas"}</span>
      </div>
      <div className="hero-balance-row">
        <div className="hero-balance-text">
          <strong className="hero-balance overview-balance-value numeric">{hidden ? MASK : formatBRL(balance)}</strong>
          <span className={`hero-net ${netTone}`}><span className="hero-net-value numeric">{netText}</span><span className="hero-net-caption">no mês</span></span>
        </div>
        {!hidden && props.balanceSpark && <Sparkline className="hero-spark" values={props.balanceSpark} label="Resultado acumulado dos últimos meses" width={84} height={36} />}
      </div>
      <div className="hero-split">
        <HeroStat label="Receitas" tone="income" icon={<ArrowDownLeft size={14} strokeWidth={2} />} value={props.income} trend={props.incomeTrend} hidden={hidden} />
        <HeroStat label="Despesas" tone="expense" icon={<ArrowUpRight size={14} strokeWidth={2} />} value={props.expense} trend={props.expenseTrend} hidden={hidden} />
      </div>
      <button type="button" className="hero-invested" onClick={props.onOpenInvestments}>
        <span className="hero-invested-icon" aria-hidden="true"><TrendingUp size={16} strokeWidth={1.75} /></span>
        <span className="hero-invested-label">Patrimônio investido{usd && <small className="numeric">{usd} em USD</small>}</span>
        <b className="hero-invested-value numeric">{hidden ? MASK : formatBRL(props.investedBrl)}</b>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </article>
    <div className="overview-quick-actions" role="group" aria-label="Registrar rapidamente">
      <button type="button" className="quick-action is-expense" onClick={() => props.onNewTransaction("expense")}><Minus size={16} strokeWidth={2} aria-hidden="true" />Despesa</button>
      <button type="button" className="quick-action is-income" onClick={() => props.onNewTransaction("income")}><Plus size={16} strokeWidth={2} aria-hidden="true" />Receita</button>
      <button type="button" className="quick-action is-transfer" onClick={() => props.onNewTransaction("transfer")}><ArrowLeftRight size={16} strokeWidth={1.75} aria-hidden="true" />Transferência</button>
    </div>
  </>;
}
