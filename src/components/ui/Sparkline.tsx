import { normalizeSeries } from "../../lib/progress";

/**
 * Minigráfico de linha (SVG), discreto: só o traço e um ponto no último mês, sem preenchimento.
 * Decorativo, com rótulo para leitores de tela. Quem usa decide se há história suficiente
 * (veja `trendSeries`); com menos de 2 pontos não desenha nada.
 */
export function Sparkline({ values, tone = "neutral", label, width = 88, height = 32, className }: { values: readonly number[]; tone?: "income" | "expense" | "neutral"; label: string; width?: number; height?: number; className?: string }) {
  const points = normalizeSeries(values);
  if (points.length < 2) return null;
  const step = width / (points.length - 1);
  const pad = 3;
  const coords = points.map((value, index) => [index * step, height - pad - value * (height - pad * 2)] as const);
  const line = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];
  return <svg className={["sparkline", `is-${tone}`, className].filter(Boolean).join(" ")} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    <path className="sparkline-line" d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={lastX} cy={lastY} r="2" fill="currentColor" />
  </svg>;
}
