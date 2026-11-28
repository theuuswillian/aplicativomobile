import { useEffect, useRef, useState } from "react";
import { formatBRL } from "../../lib/money";
import { formatCompactCurrency } from "../../lib/format";
import type { MonthlyFlowPoint } from "../../lib/finance-metrics";

type CashflowChartProps = {
  data: readonly MonthlyFlowPoint[];
  hidden: boolean;
  height?: number;
};

const PAD = { top: 12, right: 8, bottom: 28, left: 68 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Receitas x despesas realizadas por mês, em SVG: dica por mouse/toque/teclado, legenda que liga/desliga séries e animação de entrada. */
export function CashflowChart({ data, hidden, height = 220 }: CashflowChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [active, setActive] = useState<number | null>(null);
  const [visible, setVisible] = useState({ income: true, expense: true });
  const toggle = (series: "income" | "expense") => setVisible((current) => {
    const next = { ...current, [series]: !current[series] };
    return next.income || next.expense ? next : current; // mantém ao menos uma série visível
  });

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...data.flatMap((point) => [visible.income ? point.income : 0, visible.expense ? point.expense : 0])));
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = height - PAD.top - PAD.bottom;
  const groupWidth = innerWidth / Math.max(1, data.length);
  const barWidth = Math.max(6, Math.min(18, groupWidth * 0.24));
  const gap = 4;
  const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight;
  const ticks = [0, max / 2, max];
  const money = (value: number) => hidden ? "R$ ••••" : formatBRL(value);
  const activePoint = active === null ? null : data[active];
  const tooltipLeft = active === null ? 0 : Math.min(Math.max(PAD.left + groupWidth * active + groupWidth / 2, 90), width - 90);

  return <div className="chart" ref={wrapperRef} onMouseLeave={() => setActive(null)}>
    <svg width={width} height={height} role="group" aria-label="Receitas e despesas realizadas nos últimos meses" className="chart-svg">
      {ticks.map((tick) => <g key={tick} aria-hidden="true">
        <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "chart-baseline" : "chart-gridline"} />
        {!hidden && <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="chart-axis-label">{formatCompactCurrency(tick)}</text>}
      </g>)}
      {data.map((point, index) => {
        const center = PAD.left + groupWidth * index + groupWidth / 2;
        const incomeHeight = Math.max(point.income > 0 ? 3 : 0, y(0) - y(point.income));
        const expenseHeight = Math.max(point.expense > 0 ? 3 : 0, y(0) - y(point.expense));
        const label = `${point.label}: receitas ${money(point.income)}, despesas ${money(point.expense)}`;
        return <g key={point.key} role="img" aria-label={label} tabIndex={0} className={"chart-column" + (active === index ? " is-active" : "")}
          onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(active === index ? null : index)}>
          <rect x={center - groupWidth / 2} y={PAD.top} width={groupWidth} height={innerHeight} className="chart-hit" />
          {visible.income && <rect x={visible.expense ? center - barWidth - gap / 2 : center - barWidth / 2} y={y(0) - incomeHeight} width={barWidth} height={incomeHeight} rx={Math.min(4, barWidth / 2)} className="chart-bar is-income" style={{ animationDelay: `${index * 50}ms` }} />}
          {visible.expense && <rect x={visible.income ? center + gap / 2 : center - barWidth / 2} y={y(0) - expenseHeight} width={barWidth} height={expenseHeight} rx={Math.min(4, barWidth / 2)} className="chart-bar is-expense" style={{ animationDelay: `${index * 50 + 25}ms` }} />}
          <text x={center} y={height - 8} textAnchor="middle" className="chart-axis-label is-month">{point.label}</text>
        </g>;
      })}
    </svg>
    {activePoint && <div className="chart-tooltip" style={{ left: tooltipLeft }} aria-hidden="true">
      <strong>{activePoint.label}</strong>
      {visible.income && <span><i className="legend-swatch is-income" />Receitas <b>{money(activePoint.income)}</b></span>}
      {visible.expense && <span><i className="legend-swatch is-expense" />Despesas <b>{money(activePoint.expense)}</b></span>}
      <span className="chart-tooltip-net">Resultado <b>{hidden ? "••••" : formatBRL(activePoint.income - activePoint.expense)}</b></span>
    </div>}
    <div className="chart-legend" role="group" aria-label="Séries do gráfico">
      <button type="button" className={"chart-legend-toggle" + (visible.income ? "" : " is-off")} aria-pressed={visible.income} onClick={() => toggle("income")}><i className="legend-swatch is-income" />Receitas</button>
      <button type="button" className={"chart-legend-toggle" + (visible.expense ? "" : " is-off")} aria-pressed={visible.expense} onClick={() => toggle("expense")}><i className="legend-swatch is-expense" />Despesas</button>
    </div>
  </div>;
}
