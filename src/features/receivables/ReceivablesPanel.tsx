import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInBrazil } from "../../lib/date";

type AccountOption = { id: string; name: string; account_type: string };
type LoanRow = {
  id: string;
  person_name: string;
  principal_amount: string;
  loan_date: string;
  expected_date: string | null;
  source_account_id: string;
  notes: string | null;
};
type RepaymentRow = { id: string; loan_id: string; amount: string; received_date: string };
type OvertimeRow = {
  id: string;
  work_date: string;
  hours: string;
  hourly_rate: string;
  premium_percent: string;
  expected_amount: string;
  description: string | null;
  status: "pending" | "converted" | "archived";
};
type Props = {
  client: SupabaseClient;
  userId: string;
  accounts: readonly AccountOption[];
  onNotice: (message: string) => void;
  onLedgerChange: () => void;
};

function normalizeAmount(value: string): string | null {
  const input = value.trim().replace(",", ".");
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > 999_999_999_999_99n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function centsOf(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(value) / 100);
}

function key(): string {
  return globalThis.crypto.randomUUID();
}

export function ReceivablesPanel({ client, userId, accounts, onNotice, onLedgerChange }: Props) {
  const liquidAccounts = useMemo(
    () => accounts.filter((account) => account.account_type !== "investment"),
    [accounts]
  );
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [repayments, setRepayments] = useState<RepaymentRow[]>([]);
  const [overtime, setOvertime] = useState<OvertimeRow[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [personName, setPersonName] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanDate, setLoanDate] = useState(todayInBrazil);
  const [expectedDate, setExpectedDate] = useState("");
  const [loanAccountId, setLoanAccountId] = useState("");
  const [loanNotes, setLoanNotes] = useState("");

  const [repaymentLoanId, setRepaymentLoanId] = useState("");
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentAccountId, setRepaymentAccountId] = useState("");
  const [repaymentDate, setRepaymentDate] = useState(todayInBrazil);

  const [workDate, setWorkDate] = useState(todayInBrazil);
  const [hours, setHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [premiumPercent, setPremiumPercent] = useState("50");
  const [overtimeDescription, setOvertimeDescription] = useState("");
  const [selectedOvertimeIds, setSelectedOvertimeIds] = useState<string[]>([]);
  const [overtimeAccountId, setOvertimeAccountId] = useState("");
  const [overtimeReceiptDate, setOvertimeReceiptDate] = useState(todayInBrazil);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    const [loanResult, repaymentResult, overtimeResult] = await Promise.all([
      client.from("receivable_loans").select("id,person_name,principal_amount,loan_date,expected_date,source_account_id,notes").eq("user_id", userId).order("loan_date", { ascending: false }),
      client.from("receivable_repayments").select("id,loan_id,amount,received_date").eq("user_id", userId).order("received_date", { ascending: false }),
      client.from("overtime_entries").select("id,work_date,hours,hourly_rate,premium_percent,expected_amount,description,status").eq("user_id", userId).order("work_date", { ascending: false })
    ]);
    const error = loanResult.error ?? repaymentResult.error ?? overtimeResult.error;
    if (error) {
      setReady(false);
      setLoadError("A estrutura financeira ainda não foi ativada no banco. Os formulários serão liberados após a validação e aplicação da migration.");
      return;
    }
    setLoans((loanResult.data ?? []) as LoanRow[]);
    setRepayments((repaymentResult.data ?? []) as RepaymentRow[]);
    setOvertime((overtimeResult.data ?? []) as OvertimeRow[]);
    setReady(true);
    onLedgerChange();
  }, [client, userId, onLedgerChange]);

  useEffect(() => { void load(); }, [load]);

  const outstandingByLoan = useMemo(() => {
    const totals = new Map<string, bigint>();
    for (const repayment of repayments) {
      totals.set(repayment.loan_id, (totals.get(repayment.loan_id) ?? 0n) + centsOf(repayment.amount));
    }
    return new Map(loans.map((loan) => [
      loan.id,
      centsOf(loan.principal_amount) - (totals.get(loan.id) ?? 0n)
    ]));
  }, [loans, repayments]);

  const totalReceivable = [...outstandingByLoan.values()].reduce((sum, amount) => sum + amount, 0n);
  const pendingOvertime = overtime.filter((entry) => entry.status === "pending");
  const overtimeForecast = pendingOvertime.reduce((sum, entry) => sum + centsOf(entry.expected_amount), 0n);

  async function createLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = normalizeAmount(loanAmount);
    if (!ready || !amount || !personName.trim() || !loanAccountId || !loanDate ||
        liquidAccounts.every((account) => account.id !== loanAccountId) ||
        (expectedDate && expectedDate < loanDate)) {
      onNotice("Confira a pessoa, o valor, a conta de origem e as datas do empréstimo.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await client.rpc("create_receivable_loan", {
        p_person_name: personName.trim(),
        p_amount: amount,
        p_loan_date: loanDate,
        p_expected_date: expectedDate || null,
        p_source_account_id: loanAccountId,
        p_notes: loanNotes.trim() || null,
        p_idempotency_key: key()
      });
      if (error) throw error;
      setPersonName(""); setLoanAmount(""); setExpectedDate(""); setLoanNotes("");
      onNotice("Empréstimo registrado. O saldo bancário foi debitado e o valor entrou em A Receber, sem virar despesa.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Não foi possível registrar o empréstimo.");
    } finally { setSaving(false); }
  }

  async function registerRepayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = normalizeAmount(repaymentAmount);
    if (!ready || !repaymentLoanId || !amount || !repaymentAccountId ||
        liquidAccounts.every((account) => account.id !== repaymentAccountId)) {
      onNotice("Selecione o empréstimo, o valor recebido e a conta de destino.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await client.rpc("register_receivable_repayment", {
        p_loan_id: repaymentLoanId,
        p_destination_account_id: repaymentAccountId,
        p_amount: amount,
        p_received_date: repaymentDate,
        p_idempotency_key: key()
      });
      if (error) throw error;
      setRepaymentAmount("");
      onNotice("Devolução registrada. O dinheiro voltou à conta e o saldo a receber foi reduzido, sem ser tratado como salário.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Não foi possível registrar o recebimento.");
    } finally { setSaving(false); }
  }

  async function recordOvertime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = normalizeAmount(hourlyRate);
    const hoursValue = hours.trim().replace(",", ".");
    const premium = premiumPercent.trim().replace(",", ".");
    if (!ready || !/^\d{1,2}(?:\.\d{1,2})?$/.test(hoursValue) || Number(hoursValue) <= 0 ||
        !rate || !/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(premium) || Number(premium) > 500) {
      onNotice("Informe horas, valor da hora e adicional válidos.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await client.rpc("record_overtime_entry", {
        p_work_date: workDate,
        p_hours: hoursValue,
        p_hourly_rate: rate,
        p_premium_percent: premium,
        p_description: overtimeDescription.trim() || null,
        p_idempotency_key: key()
      });
      if (error) throw error;
      setHours(""); setHourlyRate(""); setOvertimeDescription("");
      onNotice("Horas extras registradas como previsão. O saldo bancário não foi alterado.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Não foi possível registrar as horas extras.");
    } finally { setSaving(false); }
  }

  async function convertOvertime() {
    if (!ready || selectedOvertimeIds.length === 0 || !overtimeAccountId ||
        liquidAccounts.every((account) => account.id !== overtimeAccountId)) {
      onNotice("Selecione horas extras pendentes e uma conta bancária de destino.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await client.rpc("convert_overtime_to_receipt", {
        p_entry_ids: selectedOvertimeIds,
        p_destination_account_id: overtimeAccountId,
        p_received_date: overtimeReceiptDate,
        p_idempotency_key: key()
      });
      if (error) throw error;
      setSelectedOvertimeIds([]);
      onNotice("Recebimento confirmado. O saldo da conta foi atualizado e as horas selecionadas foram arquivadas no ciclo.");
      await load();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Não foi possível converter as horas extras.");
    } finally { setSaving(false); }
  }

  return (
    <section className="receivables-panel" aria-labelledby="receivables-title">
      <div className="receivables-summary">
        <article><span>Empréstimos a receber</span><strong>{money(totalReceivable)}</strong></article>
        <article><span>Previsão de horas extras</span><strong>{money(overtimeForecast)}</strong></article>
      </div>
      {loadError && <p className="notice" role="status">{loadError}</p>}
      <div className="receivables-grid">
        <section className="panel receivable-card">
          <div className="transaction-heading"><strong id="receivables-title">Emprestar dinheiro</strong><span>Não entra nos gastos pessoais</span></div>
          <form className="finance-form" onSubmit={(event) => void createLoan(event)}>
            <label>Nome da pessoa<input value={personName} onChange={(event) => setPersonName(event.target.value)} maxLength={120} required /></label>
            <label>Valor emprestado (R$)<input inputMode="decimal" value={loanAmount} onChange={(event) => setLoanAmount(event.target.value)} placeholder="0,00" required /></label>
            <label>Conta de origem<select value={loanAccountId} onChange={(event) => setLoanAccountId(event.target.value)} required><option value="">Selecione</option>{liquidAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label>Data do empréstimo<input type="date" value={loanDate} onChange={(event) => setLoanDate(event.target.value)} required /></label>
            <label>Previsão de devolução<input type="date" min={loanDate} value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label>
            <label className="wide-field">Observações<input value={loanNotes} onChange={(event) => setLoanNotes(event.target.value)} maxLength={500} /></label>
            <button className="primary-button" type="submit" disabled={!ready || saving || liquidAccounts.length===0}>Registrar empréstimo</button>
          </form>
          {loans.length===0 ? <p className="empty-state">Nenhum valor emprestado em aberto.</p> : <ul className="account-list">{loans.map((loan) => {
            const outstanding = outstandingByLoan.get(loan.id) ?? 0n;
            const account = accounts.find((item) => item.id===loan.source_account_id);
            return <li key={loan.id}><strong>{loan.person_name}</strong><span>{money(outstanding)} a receber</span><small>Emprestado em {new Date(loan.loan_date+"T12:00:00").toLocaleDateString("pt-BR")} · Origem: {account?.name ?? "Conta"}</small></li>;
          })}</ul>}
        </section>

        <section className="panel receivable-card">
          <div className="transaction-heading"><strong>Registrar devolução</strong><span>Recebimento parcial ou total</span></div>
          <form className="finance-form" onSubmit={(event) => void registerRepayment(event)}>
            <label>Empréstimo<select value={repaymentLoanId} onChange={(event) => setRepaymentLoanId(event.target.value)} required><option value="">Selecione</option>{loans.filter((loan) => (outstandingByLoan.get(loan.id) ?? 0n)>0n).map((loan) => <option key={loan.id} value={loan.id}>{loan.person_name} · {money(outstandingByLoan.get(loan.id) ?? 0n)}</option>)}</select></label>
            <label>Valor recebido (R$)<input inputMode="decimal" value={repaymentAmount} onChange={(event) => setRepaymentAmount(event.target.value)} placeholder="0,00" required /></label>
            <label>Conta de destino<select value={repaymentAccountId} onChange={(event) => setRepaymentAccountId(event.target.value)} required><option value="">Selecione</option>{liquidAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label>Data do recebimento<input type="date" value={repaymentDate} onChange={(event) => setRepaymentDate(event.target.value)} required /></label>
            <button className="primary-button" type="submit" disabled={!ready || saving}>Registrar devolução</button>
          </form>
          <div className="transaction-heading"><strong>Histórico de devoluções</strong><span>{repayments.length}</span></div>
          {repayments.length===0 ? <p className="empty-state">As devoluções registradas aparecerão aqui.</p> : <ul className="account-list">{repayments.slice(0,8).map((repayment) => <li key={repayment.id}><strong>{loans.find((loan) => loan.id===repayment.loan_id)?.person_name ?? "Empréstimo"}</strong><span>{money(centsOf(repayment.amount))}</span><small>{new Date(repayment.received_date+"T12:00:00").toLocaleDateString("pt-BR")}</small></li>)}</ul>}
        </section>

        <section className="panel receivable-card">
          <div className="transaction-heading"><strong>Banco de horas extras</strong><span>Previsão, não saldo disponível</span></div>
          <form className="finance-form" onSubmit={(event) => void recordOvertime(event)}>
            <label>Data trabalhada<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} required /></label>
            <label>Horas extras<input inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Ex.: 2,5" required /></label>
            <label>Valor da hora (R$)<input inputMode="decimal" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} placeholder="0,00" required /></label>
            <label>Adicional (%)<select value={premiumPercent} onChange={(event) => setPremiumPercent(event.target.value)}><option value="0">Sem adicional</option><option value="50">+50%</option><option value="100">+100%</option><option value="150">+150%</option><option value="200">+200%</option></select></label>
            <label className="wide-field">Descrição (opcional)<input value={overtimeDescription} onChange={(event) => setOvertimeDescription(event.target.value)} maxLength={240} /></label>
            <button className="primary-button" type="submit" disabled={!ready || saving}>Registrar horas extras</button>
          </form>
          {pendingOvertime.length===0 ? <p className="empty-state">Nenhuma hora extra pendente.</p> : <ul className="account-list">{pendingOvertime.map((entry) => <li key={entry.id}>
            <label className="overtime-select"><input type="checkbox" checked={selectedOvertimeIds.includes(entry.id)} onChange={(event) => setSelectedOvertimeIds((current) => event.target.checked ? [...current,entry.id] : current.filter((id) => id!==entry.id))} /><span><strong>{entry.description || "Horas extras"}</strong><small>{entry.hours} h · {entry.premium_percent}% · {new Date(entry.work_date+"T12:00:00").toLocaleDateString("pt-BR")}</small></span></label>
            <strong>{money(centsOf(entry.expected_amount))}</strong>
          </li>)}</ul>}
          <form className="finance-form overtime-convert" onSubmit={(event) => { event.preventDefault(); void convertOvertime(); }}>
            <label>Receber na conta<select value={overtimeAccountId} onChange={(event) => setOvertimeAccountId(event.target.value)} required><option value="">Selecione</option>{liquidAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label>Data do recebimento<input type="date" value={overtimeReceiptDate} onChange={(event) => setOvertimeReceiptDate(event.target.value)} required /></label>
            <button className="primary-button" type="submit" disabled={!ready || saving || selectedOvertimeIds.length===0}>Converter em recebimento</button>
          </form>
          {overtime.filter((entry) => entry.status==="converted").length>0 && <p className="helper-text">{overtime.filter((entry) => entry.status==="converted").length} registro(s) já convertido(s) em recebimento.</p>}
        </section>
      </div>
    </section>
  );
}
