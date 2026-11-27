import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { formatSignedPercent } from "../../lib/format";

type Trend = {
  /** Variação percentual já calculada a partir de dados reais. */
  percent: number;
  /** Quando subir é bom (receita, saldo) ou ruim (despesa). */
  higherIsBetter: boolean;
  caption: string;
};

type KpiCardProps = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  trend?: Trend | null;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  valueClassName?: string;
};

/** Indicador principal: rótulo, valor em destaque (28–32px), variação e dica. */
export function KpiCard({ label, value, icon: Icon, trend, hint, action, className, valueClassName }: KpiCardProps) {
  const direction = trend ? (trend.percent > 0 ? "up" : trend.percent < 0 ? "down" : "flat") : null;
  const good = trend && direction !== "flat" ? (direction === "up") === trend.higherIsBetter : null;
  return <article className={["kpi-card", className].filter(Boolean).join(" ")}>
    <div className="kpi-card-top">
      <span className="kpi-label">{label}</span>
      {action ?? (Icon && <span className="kpi-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>)}
    </div>
    <strong className={["kpi-value", valueClassName].filter(Boolean).join(" ")}>{value}</strong>
    <div className="kpi-foot">
      {trend && <span className={"kpi-trend " + (good === null ? "is-flat" : good ? "is-good" : "is-bad")}>
        {direction === "up" ? <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" /> : direction === "down" ? <ArrowDownRight size={14} strokeWidth={1.75} aria-hidden="true" /> : null}
        {formatSignedPercent(trend.percent)}
        <span className="sr-only"> {trend.caption}</span>
      </span>}
      {trend && <span className="kpi-hint" aria-hidden="true">{trend.caption}</span>}
      {!trend && hint && <span className="kpi-hint">{hint}</span>}
    </div>
  </article>;
}
