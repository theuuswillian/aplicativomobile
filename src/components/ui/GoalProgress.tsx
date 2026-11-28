import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { progressPercent, progressState, projectCompletionMonth, type ProgressMode } from "../../lib/progress";

type GoalProgressProps = {
  mode: ProgressMode;
  /** Valores em centavos. */
  current: number;
  target: number;
  label: string;
  format: (cents: number) => string;
  /** Contribuição mensal (centavos) para prever a conclusão de metas. */
  monthly?: number;
  today?: string;
  compact?: boolean;
  /** Texto do restante (ex.: "/mês" em metas de renda). */
  remainingSuffix?: string;
  /** Esconde o percentual quando ele já aparece ao lado do título. */
  hidePercent?: boolean;
};

const monthLabel = (yyyyMm: string) => new Date(`${yyyyMm}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");

/**
 * Barra de progresso animada com marcas em 25/50/75/100%.
 * Metas: índigo → esmeralda, estado de conquista em 100%. Orçamentos: âmbar acima de 80%, vermelho acima de 100%.
 */
export function GoalProgress({ mode, current, target, label, format, monthly, today, compact, remainingSuffix = "", hidePercent }: GoalProgressProps) {
  const percent = progressPercent(current, target);
  const state = progressState(mode, percent);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const frame = window.requestAnimationFrame(() => setMounted(true)); return () => window.cancelAnimationFrame(frame); }, []);
  const width = mounted ? Math.min(100, percent) : 0;
  const remaining = Math.max(0, target - current);
  const projection = mode === "goal" && monthly && today ? projectCompletionMonth(current, target, monthly, today) : null;
  const shown = Math.floor(percent);

  let caption: string;
  if (mode === "goal") caption = state === "reached" ? "Meta alcançada!" : `Faltam ${format(remaining)}${remainingSuffix}`;
  else caption = state === "over" ? `Estourou ${format(current - target)}` : `Restam ${format(remaining)}`;

  return <div className={`goal-progress is-${mode} is-${state}${compact ? " is-compact" : ""}`}>
    <div className="goal-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(percent))} aria-valuetext={`${shown}% · ${caption}`}>
      <span className="goal-progress-fill" style={{ width: `${width}%` }} />
      {[25, 50, 75].map((tick) => <i key={tick} className={"goal-progress-tick" + (percent >= tick ? " is-passed" : "")} style={{ left: `${tick}%` }} aria-hidden="true" />)}
    </div>
    {!compact && <div className="goal-progress-meta">
      <span className="goal-progress-percent">{state === "reached" && <PartyPopper size={14} strokeWidth={1.9} aria-hidden="true" />}{hidePercent ? (state === "reached" ? "Conquistada" : "") : `${shown}%`}</span>
      <span className="goal-progress-caption">{caption}{projection ? ` · previsão ${monthLabel(projection)}` : ""}</span>
    </div>}
  </div>;
}
