import { PieChart } from "lucide-react";
import type { InvestmentAssetRow } from "../../types/app";
import type { calculateInvestmentSummary } from "../../domain/investments";
import { DonutChart } from "../../components/charts/DonutChart";
import { CHART_PALETTE } from "../../components/charts/palette";
import { EmptyState } from "../../components/ui";

type PortfolioAllocationProps = {
  assets: readonly InvestmentAssetRow[];
  investmentSummary: (assetId: string) => ReturnType<typeof calculateInvestmentSummary>;
};

type AllocationRow = { key: string; label: string; amount: number; hint?: string };

const CLASS_NAMES: Record<string, string> = { stock: "Ações", fii: "Fundos imobiliários", etf: "ETFs", bdr: "BDRs", fixed_income: "Renda fixa", crypto: "Cripto" };

function AllocationGroup({ title, rows, currency }: { title: string; rows: AllocationRow[]; currency: "BRL" | "USD" }) {
  const total = rows.reduce((sum, item) => sum + item.amount, 0);
  if (!total) return null;
  const colorByKey = new Map(rows.map((item, index) => [item.key, CHART_PALETTE[index % CHART_PALETTE.length]]));
  return <div className="allocation-group">
    <strong>{title} · {currency}</strong>
    <div className="allocation-chart-row">
      <DonutChart size={112} thickness={12}
        label={`Gráfico ${title}, total ${new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(total)}`}
        centerValue={new Intl.NumberFormat("pt-BR", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(total)}
        segments={rows.map((item) => ({ key: item.key, value: item.amount, color: colorByKey.get(item.key) ?? CHART_PALETTE[0] }))} />
      <ul className="allocation-legend">{[...rows].sort((a, b) => b.amount - a.amount).map((item) => <li key={item.key}>
        <span className="allocation-dot" style={{ background: colorByKey.get(item.key) }} />
        <span><strong>{item.label}</strong>{item.hint && <small>{item.hint}</small>}</span>
        <b>{(item.amount / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b>
      </li>)}</ul>
    </div>
  </div>;
}

/** Distribuição da carteira por ativo e por classe, separada por moeda (sem conversão cambial). */
export function PortfolioAllocation({ assets, investmentSummary }: PortfolioAllocationProps) {
  const baseRows = assets.map((asset) => {
    const summary = investmentSummary(asset.id);
    const manualValue = asset.current_price != null ? Math.max(0, Number(asset.current_price) * summary.quantity) : 0;
    return { asset, amount: summary.quantity > 0 ? (manualValue > 0 ? manualValue : summary.costBasisCents / 100) : 0, estimated: asset.current_price == null };
  }).filter((item) => Number.isFinite(item.amount) && item.amount > 0);

  return <div className="investment-allocation" aria-label="Distribuição da carteira">
    <div className="transaction-heading"><strong>Alocação da carteira</strong><span>Por ativo e classe</span></div>
    {baseRows.length > 0 ? (["BRL", "USD"] as const).map((currency) => {
      const rows = baseRows.filter((item) => item.asset.currency === currency);
      const byAsset = rows.map((item) => ({ key: item.asset.id, label: item.asset.symbol, amount: item.amount, hint: item.estimated ? "Custo investido · sem cotação" : "Preço de referência manual" }));
      const byClassMap = new Map<string, number>();
      rows.forEach((item) => byClassMap.set(item.asset.asset_class, (byClassMap.get(item.asset.asset_class) ?? 0) + item.amount));
      const byClass = [...byClassMap.entries()].map(([key, amount]) => ({ key, label: CLASS_NAMES[key] ?? key, amount }));
      return <div className="allocation-currency" key={currency}>
        <AllocationGroup title="Por ativo" rows={byAsset} currency={currency} />
        <AllocationGroup title="Por classe" rows={byClass} currency={currency} />
      </div>;
    }) : <EmptyState icon={PieChart} compact>Registre operações para visualizar a distribuição da carteira.</EmptyState>}
    <p className="helper-text">A distribuição usa preço de referência manual quando disponível; nos demais ativos, usa o custo investido. Valores em BRL e USD são separados para não misturar moedas. Não representa cotação de mercado nem rentabilidade atual.</p>
  </div>;
}
