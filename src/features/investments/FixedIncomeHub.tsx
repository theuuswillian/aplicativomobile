import type { FormEvent } from "react";
import { Droplets, Landmark, Plus, ShieldCheck } from "lucide-react";
import type { IncomeEventRow, InvestmentAssetRow } from "../../types/app";
import { todayInBrazil } from "../../lib/date";
import type { calculateInvestmentSummary } from "../../domain/investments";
import { Badge, Button, EmptyState, ProgressBar } from "../../components/ui";

type FixedIncomeHubProps = {
  assets: readonly InvestmentAssetRow[];
  incomeEvents: readonly IncomeEventRow[];
  investmentSummary: (assetId: string) => ReturnType<typeof calculateInvestmentSummary>;
  manualPriceInputs: Record<string, string>;
  onManualPriceChange: (assetId: string, value: string) => void;
  onUpdateReference: (event: FormEvent<HTMLFormElement>, asset: InvestmentAssetRow) => void;
  onAddTitle: () => void;
  busy: boolean;
};

/** Renda fixa: capital aplicado, prazos, taxas e referência manual por título. */
export function FixedIncomeHub({ assets, incomeEvents, investmentSummary, manualPriceInputs, onManualPriceChange, onUpdateReference, onAddTitle, busy }: FixedIncomeHubProps) {
  const fixedIncomeAssets = assets.filter((asset) => asset.asset_class === "fixed_income");
  const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const totalInvested = fixedIncomeAssets.reduce((total, asset) => total + Number(investmentSummary(asset.id).costBasisCents) / 100, 0);
  const totalReceived = fixedIncomeAssets.reduce((total, asset) => total + incomeEvents.filter((event) => event.asset_id === asset.id && event.status === "received").reduce((sum, event) => sum + Number(event.received_amount), 0), 0);
  const maturityDates = fixedIncomeAssets.map((asset) => String((asset.metadata?.fixed_income as Record<string, unknown> | undefined)?.maturity_date ?? "")).filter(Boolean);
  const upcoming = maturityDates.filter((date) => date >= todayInBrazil() && date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).length;
  return <section className="fixed-income-hub" aria-labelledby="fixed-income-title">
    <div className="fixed-income-heading">
      <div><span className="fixed-income-eyebrow">RENDA FIXA · VISÃO INTELIGENTE</span><h3 id="fixed-income-title">Seu dinheiro em movimento</h3><p>Acompanhe prazos, taxas, capital aplicado e rendimentos sem confundir projeções com resultados reais.</p></div>
      <span className="fixed-income-orbit" aria-hidden="true"><Landmark size={20} strokeWidth={1.75} /></span>
    </div>
    <div className="fixed-income-overview">
      <div className="fixed-income-total"><span>Capital aplicado</span><strong>{money(totalInvested)}</strong><small>{fixedIncomeAssets.length} {fixedIncomeAssets.length === 1 ? "título na carteira" : "títulos na carteira"}</small></div>
      <div className="fixed-income-overview-stats"><div><span>Rendimentos recebidos</span><strong>{money(totalReceived)}</strong></div><div><span>Vencimentos em 30 dias</span><strong>{upcoming}</strong></div></div>
    </div>
    <details className="fixed-income-learning"><summary>Entenda a renda fixa sem complicação</summary><p>Na renda fixa, você empresta recursos a um banco, ao governo ou a uma empresa e recebe conforme as condições do título. A previsibilidade depende do tipo de taxa e de respeitar as condições de resgate.</p><div className="fixed-income-learning-grid"><div><strong>Prefixado</strong><span>Taxa definida na contratação. O valor combinado depende de manter o título até o vencimento.</span></div><div><strong>Pós-fixado</strong><span>Acompanha um indicador, como CDI ou Selic. O resultado varia conforme esse indicador ao longo do tempo.</span></div><div><strong>Híbrido</strong><span>Combina inflação (IPCA) com uma taxa adicional. Ajuda a proteger o poder de compra no longo prazo.</span></div></div><p>Resgatar antes do prazo pode mudar o resultado. Confira sempre liquidez, carência, emissor, taxas e tributação.</p></details>
    <div className="fixed-income-list-heading"><div><strong>Seus títulos</strong><span>{fixedIncomeAssets.length ? "Acompanhamento individual" : "Comece sua carteira"}</span></div><Button variant="secondary" icon={Plus} onClick={onAddTitle}>Novo título</Button></div>
    {fixedIncomeAssets.length === 0 ? <EmptyState icon={Landmark} title="Sua renda fixa começa aqui" action={<Button variant="primary" onClick={onAddTitle}>Cadastrar primeiro título</Button>}>Cadastre CDB, LCI, LCA, Tesouro ou outros títulos e acompanhe cada etapa até o vencimento.</EmptyState> : <div className="fixed-income-cards">
      {fixedIncomeAssets.map((asset) => {
        const metadata = (asset.metadata?.fixed_income ?? {}) as Record<string, unknown>;
        const summary = investmentSummary(asset.id);
        const invested = Number(summary.costBasisCents) / 100;
        const received = incomeEvents.filter((event) => event.asset_id === asset.id && event.status === "received").reduce((sum, event) => sum + Number(event.received_amount), 0);
        const product = String(metadata.product ?? asset.name);
        const issuer = String(metadata.issuer ?? "");
        const indexer = String(metadata.indexer ?? "");
        const rate = String(metadata.annual_rate_percent ?? "");
        const maturity = String(metadata.maturity_date ?? "");
        const start = String(metadata.start_date ?? "");
        const daysLeft = maturity ? Math.ceil((new Date(maturity + "T12:00:00").getTime() - new Date(todayInBrazil() + "T12:00:00").getTime()) / 86400000) : null;
        const elapsed = start && maturity ? Math.max(0, Math.min(100, ((new Date(todayInBrazil() + "T12:00:00").getTime() - new Date(start + "T12:00:00").getTime()) / Math.max(1, new Date(maturity + "T12:00:00").getTime() - new Date(start + "T12:00:00").getTime())) * 100)) : null;
        const progress = elapsed === null ? 0 : elapsed;
        const frequency = ({daily:"Diário (dias úteis)",monthly:"Mensal",semiannual:"Semestral",at_maturity:"No vencimento"} as Record<string,string>)[String(metadata.yield_frequency ?? "")] ?? "Não informado";
        const rateLabel = indexer === "CDI" ? rate + "% do CDI" : indexer === "SELIC" ? rate + "% da Selic" : indexer === "IPCA" ? "IPCA + " + rate + "% a.a." : indexer === "PREFIXADO" ? rate + "% a.a. prefixado" : "Taxa não informada";
        const productKey = product.toLocaleUpperCase("pt-BR");
        const taxLabel = ["LCI","LCA","CRI","CRA","POUPANÇA"].includes(productKey) ? "Isenção de IR para pessoa física, conforme regras do produto" : ["CDB","LC","TESOURO SELIC","TESOURO IPCA+","TESOURO PREFIXADO"].includes(productKey) ? "IR regressivo sobre o rendimento; IOF pode incidir antes de 30 dias" : "Tributação depende das características do título";
        const fgcEligible = ["CDB","LCI","LCA","LC","POUPANÇA"].includes(productKey);
        const hasPosition = summary.quantity > 0;
        const progressValue = maturity && daysLeft !== null && daysLeft < 0 ? 100 : progress;
        return <article className="fixed-income-card" key={asset.id}>
          <div className="fixed-income-card-top"><span className="fixed-income-product-icon" aria-hidden="true"><Landmark size={18} strokeWidth={1.75} /></span><div className="fixed-income-title-group"><strong>{asset.name}</strong><span>{product}{issuer ? " · " + issuer : ""}</span></div><Badge className="fixed-income-status" tone={daysLeft === null ? "neutral" : daysLeft < 0 ? "negative" : daysLeft <= 30 ? "warning" : "positive"}>{daysLeft === null ? "Prazo aberto" : daysLeft < 0 ? "Vencido" : daysLeft <= 30 ? "Próximo do vencimento" : "Em andamento"}</Badge></div>
          <div className="fixed-income-rate"><strong>{rateLabel}</strong><span>{indexer === "CDI" ? "Acompanha o CDI; o percentual contratado não é uma taxa anual fixa" : indexer === "SELIC" ? "Acompanha a taxa Selic conforme a regra do título" : indexer === "IPCA" ? "Combina inflação medida pelo IPCA com uma taxa adicional" : "Taxa definida na contratação, sujeita às condições de vencimento"}</span></div>
          <div className="fixed-income-metrics"><div><span>Capital investido</span><strong>{money(invested)}</strong></div><div><span>Rendimentos recebidos</span><strong>{money(received)}</strong></div><div><span>Quantidade</span><strong>{summary.quantity.toLocaleString("pt-BR",{maximumFractionDigits:8})}</strong></div></div>
          <div className="fixed-income-timeline">
            <div className="fixed-income-timeline-label"><span>{maturity ? daysLeft !== null && daysLeft < 0 ? "Prazo encerrado" : "Prazo até o vencimento" : "Prazo de vencimento não cadastrado"}</span><strong>{maturity ? Math.round(progressValue) + "%" : "—"}</strong></div>
            <ProgressBar className="fixed-income-progress" value={progressValue} label={"Prazo decorrido de " + asset.name} />
            <div className="fixed-income-dates"><span>Início: {start ? new Date(start + "T12:00:00").toLocaleDateString("pt-BR") : "Não informado"}</span><strong>{maturity ? daysLeft !== null && daysLeft < 0 ? "Venceu em " + new Date(maturity + "T12:00:00").toLocaleDateString("pt-BR") : daysLeft + " dias restantes" : "Sem data definida"}</strong></div>
          </div>
          <div className="fixed-income-tags"><span><ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />{fgcEligible ? "Pode ter cobertura FGC*" : "Sem cobertura FGC"}</span><span><Droplets size={14} strokeWidth={1.75} aria-hidden="true" />{String(metadata.liquidity ?? "unknown") === "daily" ? "Liquidez diária" : String(metadata.liquidity ?? "unknown") === "at_maturity" ? "Resgate no vencimento" : String(metadata.liquidity ?? "unknown") === "grace_period" ? "Após carência" + (metadata.grace_period_days ? " de " + metadata.grace_period_days + " dias" : "") : "Liquidez não informada"}</span></div>
          <details className="fixed-income-details"><summary>Detalhes, impostos e atualização</summary><div className="fixed-income-detail-grid"><div><span>Indexador</span><strong>{indexer || "Não informado"}</strong></div><div><span>Periodicidade</span><strong>{frequency}</strong></div><div className="wide"><span>Tributação</span><strong>{taxLabel}</strong></div><div className="wide"><span>Garantia</span><strong>{fgcEligible ? "Verifique elegibilidade do emissor e limites do FGC (até R$ 250 mil por CPF e conglomerado)" : "Não é coberto pelo FGC"}</strong></div></div>
            {hasPosition && <p className="fixed-income-note">A carteira registra {money(invested)} de custo investido. O rendimento acumulado só será apresentado quando houver dados suficientes para calculá-lo corretamente.</p>}
            <form className="fixed-income-reference-form" onSubmit={(event) => onUpdateReference(event, asset)}><label>Valor unitário de referência informado manualmente<input inputMode="decimal" value={manualPriceInputs[asset.id] ?? ""} onChange={(event) => onManualPriceChange(asset.id, event.target.value)} placeholder="Ex.: 15.000,00" disabled={busy}/></label><button className="secondary-button" type="submit" disabled={busy || !(manualPriceInputs[asset.id] ?? "").trim()}>Atualizar referência</button></form>
            <p className="fixed-income-footnote">*A cobertura do FGC depende do produto e da instituição, respeita o limite de R$ 250 mil por CPF por instituição ou conglomerado e o teto global de R$ 1 milhão em quatro anos. A barra mostra o tempo decorrido, não o rendimento.</p>
          </details>
        </article>;
      })}
    </div>}
  </section>;
}
