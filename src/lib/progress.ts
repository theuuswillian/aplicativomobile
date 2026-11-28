// Regras visuais de progresso (metas, orçamentos e metas de renda) — puras e testáveis.

export type ProgressMode = "goal" | "budget";
export type ProgressState = "progress" | "reached" | "warning" | "over";

/** Percentual (pode passar de 100) a partir de centavos. */
export function progressPercent(current: number, target: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, (current / target) * 100);
}

/**
 * Meta: progride (índigo → esmeralda) e comemora ao chegar em 100%.
 * Orçamento: normal até 80%, alerta (âmbar) acima de 80%, estourado (vermelho) acima de 100%.
 */
export function progressState(mode: ProgressMode, percent: number): ProgressState {
  if (mode === "goal") return percent >= 100 ? "reached" : "progress";
  if (percent > 100) return "over";
  if (percent > 80) return "warning";
  return "progress";
}

/**
 * Mês previsto para concluir uma meta com contribuição mensal constante.
 * Devolve "AAAA-MM" ou null quando não dá para calcular (sem contribuição, já concluída, alvo inválido).
 */
export function projectCompletionMonth(currentCents: number, targetCents: number, monthlyCents: number, todayIso: string): string | null {
  if (!(targetCents > 0) || currentCents >= targetCents || !(monthlyCents > 0)) return null;
  const months = Math.ceil((targetCents - currentCents) / monthlyCents);
  if (!Number.isFinite(months) || months > 600) return null;
  const [year, month] = todayIso.slice(0, 7).split("-").map(Number);
  if (!year || !month) return null;
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Série para sparkline normalizada em 0..1 (linha reta no meio quando todos os valores são iguais). */
export function normalizeSeries(values: readonly number[]): number[] {
  const finite = values.map((value) => (Number.isFinite(value) ? value : 0));
  const min = Math.min(...finite), max = Math.max(...finite);
  if (!finite.length) return [];
  if (max === min) return finite.map(() => 0.5);
  return finite.map((value) => (value - min) / (max - min));
}
