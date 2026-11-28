import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Check, Info, Plus, Sparkles, Target, Trash2, TrendingUp } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePassiveIncomeSnapshot, type IncomeAsset, type IncomeEvent, type IncomeOperation } from "../../domain/income-goals";
import { formatBrlInput, parseBrlAmount } from "../../lib/money";
import { GoalProgress } from "../../components/ui";

interface IncomeGoalRow {
  id: string;
  name: string;
  icon: string;
  target_monthly_amount: string | number;
  sort_order: number;
}
interface Props {
  client: SupabaseClient;
  userId: string;
  assets: readonly IncomeAsset[];
  operations: readonly IncomeOperation[];
  events: readonly IncomeEvent[];
  today: string;
}
function parseAmount(value: string): string | null {
  // Aceita "1.234,56", "150" e "150.00"; rejeita zero e negativos.
  return parseBrlAmount(value);
}
function goalIconForName(value:string):string{const n=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();if(/aluguel|casa|moradia/.test(n))return "🏠";if(/luz|energia|eletric/.test(n))return "💡";if(/agua/.test(n))return "💧";if(/internet|telefone/.test(n))return "📱";if(/mercado|aliment/.test(n))return "🛒";if(/saude|farmac/.test(n))return "🩺";if(/viagem/.test(n))return "✈️";if(/carro|combust|transporte/.test(n))return "🚗";if(/educa|curso/.test(n))return "📚";if(/invest|renda|dividend/.test(n))return "📈";return "🎯";}
function money(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
export function IncomeGoalsPanel({ client, userId, assets, operations, events, today }: Props) {
  const [goals, setGoals] = useState<IncomeGoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [schemaUnavailable, setSchemaUnavailable] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [notice, setNotice] = useState("");
  const snapshot = useMemo(() => calculatePassiveIncomeSnapshot({ assets, operations, events, today }), [assets, operations, events, today]);

  useEffect(() => {
    let active = true;
    void client.from("income_goals").select("id,name,icon,target_monthly_amount,sort_order")
      .eq("user_id", userId).order("sort_order", { ascending: true }).order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setSchemaUnavailable(error.code === "42P01" || error.code === "PGRST205");
          setNotice(error.code === "42P01" || error.code === "PGRST205"
            ? "A estrutura das metas de rendimento ainda precisa ser aplicada ao banco."
            : "Não foi possível carregar suas metas de rendimento.");
        } else setGoals((data ?? []) as IncomeGoalRow[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [client, userId]);

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseAmount(target);
    const cleanName = name.trim();
    const cleanIcon = goalIconForName(cleanName);
    if (!amount || !cleanName || cleanName.length > 80) {
      setNotice("Informe um nome e um valor mensal válido.");
      return;
    }
    setBusy(true);
    setNotice("");
    const { data, error } = await client.from("income_goals").insert({
      user_id: userId, name: cleanName, icon: cleanIcon, target_monthly_amount: amount,
      sort_order: goals.length,
    }).select("id,name,icon,target_monthly_amount,sort_order").single();
    if (error) setNotice("Não foi possível salvar a meta. Confira a conexão e tente novamente.");
    else {
      setGoals((current) => [...current, data as IncomeGoalRow]);
      setName(""); setTarget("");
      setNotice("Meta de rendimento criada.");
    }
    setBusy(false);
  }

  async function deleteGoal(goal: IncomeGoalRow) {
    setBusy(true);
    setNotice("");
    const { error } = await client.from("income_goals").delete().eq("id", goal.id).eq("user_id", userId);
    if (error) setNotice("Não foi possível excluir esta meta.");
    else {
      setGoals((current) => current.filter((item) => item.id !== goal.id));
      setNotice("Meta removida.");
    }
    setBusy(false);
  }

  return <section id="metas-rendimentos" className="income-goals-panel" aria-labelledby="income-goals-title">
    <div className="income-goals-heading">
      <div><span className="principles-label">RENDA QUE TRABALHA POR VOCÊ</span><h3 id="income-goals-title">Metas de rendimentos</h3>
        <p>Veja quanto sua carteira pode gerar por mês e quais despesas ela já consegue cobrir.</p></div>
      <span className="income-goals-live"><Sparkles size={14}/> Visão inteligente</span>
    </div>

    <div className="income-goals-hero">
      <div className="income-goals-hero-top"><span>Renda mensal estimada</span><span><TrendingUp size={15}/> Atualizada com sua carteira</span></div>
      <strong>{money(snapshot.projectedMonthlyCents)}</strong>
      <small>Proventos médios recebidos + estimativa de renda fixa prefixada</small>
      <div className="income-goals-breakdown">
        <div><span>FIIs e ações</span><b>{money(snapshot.proventsMonthlyAverageCents)}<small>/mês</small></b><small>Média dos últimos 12 meses</small></div>
        <div><span>Renda fixa</span><b>{money(snapshot.fixedIncomeEstimatedMonthlyCents)}<small>/mês</small></b><small>Acúmulo estimado bruto</small></div>
      </div>
    </div>

    <div className="income-goals-stats">
      <article><span>Recebido em 12 meses</span><strong>{money(snapshot.allIncomeReceived12mCents)}</strong><small>Somente proventos marcados como recebidos</small></article>
      <article><span>Metas já alcançadas</span><strong>{goals.filter((goal) => snapshot.projectedMonthlyCents >= Math.round(Number(goal.target_monthly_amount) * 100)).length} <small>de {goals.length}</small></strong><small>Com base na renda mensal estimada</small></article>
    </div>

    <div className="income-goals-list-heading"><div><Target size={18}/><strong>O que sua renda já paga?</strong></div><span>{goals.length} metas</span></div>
    {loading ? <p className="empty-state">Carregando suas metas...</p> : schemaUnavailable
      ? <p className="income-goals-warning"><Info size={17}/>{notice}</p>
      : goals.length === 0 ? <div className="income-goals-empty"><div className="income-goals-empty-icon">☕</div><strong>Comece por uma conquista pequena</strong><p>Cadastre o valor de um café, da conta de luz ou de outra despesa mensal. O GranaViva acompanha quando sua renda alcançar cada uma.</p></div>
      : <div className="income-goals-grid">{goals.map((goal) => {
        const targetCents = Math.round(Number(goal.target_monthly_amount) * 100);
        const progress = targetCents > 0 ? Math.min(100, snapshot.projectedMonthlyCents / targetCents * 100) : 0;
        const reached = progress >= 100;
        return <article className={`income-goal-card${reached ? " is-reached" : ""}`} key={goal.id}>
          <div className="income-goal-card-top"><span className="income-goal-icon">{goal.icon}</span><button type="button" aria-label={`Excluir meta ${goal.name}`} onClick={() => void deleteGoal(goal)} disabled={busy}><Trash2 size={15}/></button></div>
          <strong>{goal.name}</strong><b>{money(snapshot.projectedMonthlyCents)} <small>de {money(targetCents)}</small></b>
          <GoalProgress mode="goal" compact current={snapshot.projectedMonthlyCents} target={targetCents} label={`Progresso da meta ${goal.name}`} format={money} remainingSuffix="/mês" />
          <div className="income-goal-foot"><span>{reached ? <><Check size={14}/> Já conquistou</> : `${Math.floor(progress)}% do objetivo`}</span><small>{reached ? "Meta atingida" : `Faltam ${money(Math.max(0, targetCents - snapshot.projectedMonthlyCents))}/mês`}</small></div>
        </article>;
      })}</div>}

    <details className="income-goals-create">
      <summary><Plus size={17}/> Criar meta de rendimento</summary>
      <form className="finance-form" onSubmit={(event) => void createGoal(event)}>
        <p className="income-goal-icon-hint">O ícone é escolhido automaticamente pelo nome da meta.</p>
        <label>Nome da conquista<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ex.: Conta de luz" required/></label>
        <label>Valor mensal para atingir (R$)<input inputMode="decimal" value={target} onChange={(event) => setTarget(formatBrlInput(event.target.value))} placeholder="0,00" required/></label>
        <button className="primary-button" type="submit" disabled={busy || loading || schemaUnavailable}>Salvar meta</button>
      </form>
    </details>
    {snapshot.unsupportedFixedIncomeCount > 0 && <p className="income-goals-note"><Info size={15}/> {snapshot.unsupportedFixedIncomeCount} investimento(s) de renda fixa atrelado(s) ao CDI, IPCA ou Selic não entram na estimativa automática sem o índice de referência atualizado. Os valores recebidos continuam no histórico.</p>}
    {snapshot.foreignIncomeEventCount > 0 && <p className="income-goals-note"><Info size={15}/> {snapshot.foreignIncomeEventCount} recebimento(s) em moeda estrangeira foram separados e não entram na soma em reais.</p>}
    {notice && !schemaUnavailable && <p className="notice" role="status">{notice}</p>}
    <p className="income-goals-disclaimer">Estimativa informativa, não garantia de renda futura. Ações e FIIs usam a média de proventos efetivamente recebidos nos últimos 12 meses. A renda fixa prefixada mostra acúmulo bruto estimado, que pode não ser pago mensalmente e não desconta impostos ou taxas.</p>
  </section>;
}
