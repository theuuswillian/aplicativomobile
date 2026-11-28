import { useId } from "react";
import { normalizeSeries } from "../../lib/progress";

/** Minigráfico de linha (SVG) com área suave; decorativo, com rótulo para leitores de tela. */
export function Sparkline({ values, tone = "neutral", label, width = 88, height = 32 }: { values: readonly number[]; tone?: "income" | "expense" | "neutral"; label: string; width?: number; height?: number }) {
  const gradientId = useId();
  const points = normalizeSeries(values);
  if (points.length < 2) return null;
  const step = width / (points.length - 1);
  const coords = points.map((value, index) => [index * step, height - 3 - value * (height - 6)] as const);
  const line = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const [lastX, lastY] = coords[coords.length - 1];
  return <svg className={`sparkline is-${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".28" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    <path d={area} fill={`url(#${gradientId})`} />
    <path className="sparkline-line" d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
    <circle cx={lastX} cy={lastY} r="2.5" fill="currentColor" />
  </svg>;
}
