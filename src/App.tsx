import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Theme = "dark" | "light";
type RadarAlert = {
  id: string;
  asset_class: "stock" | "fii" | "etf" | "bdr" | "crypto";
  symbol: string;
  condition_type: "above" | "below" | "daily_drop";
  threshold: number;
  generation: number;
  is_enabled: boolean;
};
type Profile = { display_name: string | null; email?: string };
type AccountRow = { id: string; name: string; account_type: string; opening_balance: string; is_primary: boolean };
type TransactionRow = { id: string; kind: "income" | "expense" | "transfer"; status: "paid" | "planned" | "cancelled"; amount: string; transaction_date: string; description: string; account_id: string | null };
type ReceiptDraft = { sufficient: boolean; kind: "income" | "expense" | null; amount: string | null; date: string | null; description: string | null; category: string | null; payment_method: string | null; installment_count: number | null; card_last_four: string | null; confidence: number; warnings: string[] };
const THEME_STORAGE_KEY = "granaviva:theme:v1";

function getInitialTheme(): Theme {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a operação.";
}

function todayInBrazil(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeBrlAmount(value: string, allowZero = false, allowNegative = false): string | null {
  const input = value.trim();
  if (!/^-?\d{1,10}(?:,\d{1,2})?$/.test(input)) return null;
  const negative = input.startsWith("-");
  if (negative && !allowNegative) return null;
  const unsigned = negative ? input.slice(1) : input;
  const [whole, fraction = ""] = unsigned.split(",");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (!allowZero && cents === 0n) return null;
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(2, "0")}`;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authMode, setAuthMode] = useState<"entrar" | "criar">("entrar");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [alerts, setAlerts] = useState<RadarAlert[]>([]);
  const [symbol, setSymbol] = useState("");
  const [assetClass, setAssetClass] = useState<RadarAlert["asset_class"]>("stock");
  const [condition, setCondition] = useState<RadarAlert["condition_type"]>("above");
  const [threshold, setThreshold] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("checking");
  const [openingBalance, setOpeningBalance] = useState("0,00");
  const [txDescription, setTxDescription] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txKind, setTxKind] = useState<"income" | "expense">("expense");
  const [txStatus, setTxStatus] = useState<"paid" | "planned">("paid");
  const [txDate, setTxDate] = useState(todayInBrazil);
  const [txAccountId, setTxAccountId] = useState("");
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<"paid" | "planned">("paid");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantConsent, setAssistantConsent] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptConsent, setReceiptConsent] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
  const [receiptAccountId, setReceiptAccountId] = useState("");

  useEffect(() => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* sessão continua funcional */ }
  }, [theme]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthReady(true); }
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setNotice("");
      if (!nextSession || event === "SIGNED_IN") {
        setProfile(null); setAlerts([]); setAccounts([]); setTransactions([]);
        setTxAccountId(""); setReceiptAccountId(""); setEditingTransactionId(null);
        setAssistantAnswer(""); setAssistantQuestion(""); setAssistantConsent(false);
        setReceiptDraft(null); setReceiptFile(null); setReceiptConsent(false);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !session) return;
    let active = true;
    const load = async () => {
      try {
        const [account, preferences, radar, accountRows, transactionRows] = await Promise.all([
          client.functions.invoke("minha-conta", { body: { action: "consultar" } }),
          client.functions.invoke("minhas-preferencias", { body: { action: "consultar" } }),
          client.functions.invoke("radar-alertas", { body: { action: "consultar" } }),
          client.from("accounts").select("id,name,account_type,opening_balance,is_primary").eq("user_id", session.user.id).eq("is_archived", false).order("created_at", { ascending: true }),
          client.from("transactions").select("id,kind,status,amount,transaction_date,description,account_id").eq("user_id", session.user.id).order("transaction_date", { ascending: false }).limit(30),
        ]);
        if (account.error) throw account.error;
        if (preferences.error) throw preferences.error;
        if (radar.error) throw radar.error;
        if (accountRows.error) throw accountRows.error;
        if (transactionRows.error) throw transactionRows.error;
        if (!active) return;
        setProfile(account.data?.data?.profile ?? null);
        const serverTheme = preferences.data?.data?.theme;
        if (serverTheme === "light" || serverTheme === "dark") setTheme(serverTheme);
        setAlerts(Array.isArray(radar.data?.data) ? radar.data.data as RadarAlert[] : []);
        setAccounts((accountRows.data ?? []) as AccountRow[]);
        setTransactions((transactionRows.data ?? []) as TransactionRow[]);
        if (accountRows.data?.[0]?.id) setTxAccountId((current) => current || accountRows.data[0].id);
        if (accountRows.data?.[0]?.id) setReceiptAccountId((current) => current || accountRows.data[0].id);
      } catch (error) {
        if (active) setNotice(errorMessage(error));
      }
    };
    void load();
    return () => { active = false; };
  }, [session]);

  const signedIn = Boolean(session?.user);
  const enabledAlerts = useMemo(() => alerts.filter((alert) => alert.is_enabled).length, [alerts]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      if (authMode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { name: displayName.trim() } },
        });
        if (error) throw error;
        if (!data.session) setNotice("Cadastro recebido. Confirme seu e-mail para entrar.");
      }
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function handleSignOut() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    setNotice(error ? errorMessage(error) : "Sessão encerrada.");
  }

  async function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (supabase && session) {
      const { error } = await supabase.functions.invoke("minhas-preferencias", {
        body: { action: "atualizar", theme: next },
      });
      if (error) setNotice("Tema alterado neste dispositivo, mas não foi possível sincronizar com sua conta.");
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(openingBalance, true, true);
    if (!amount || !accountName.trim()) { setNotice("Confira o nome e o saldo inicial da conta."); return; }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("accounts").insert({
        user_id: session.user.id, name: accountName.trim(), account_type: accountType,
        opening_balance: amount, opening_balance_date: todayInBrazil(),
        is_primary: accounts.length === 0,
      }).select("id,name,account_type,opening_balance,is_primary").single();
      if (error) throw error;
      const created = data as AccountRow;
      setAccounts((current) => [...current, created]);
      setTxAccountId((current) => current || created.id);
      setReceiptAccountId((current) => current || created.id);
      setAccountName("");
      setOpeningBalance("0,00");
      setNotice("Conta criada.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function createTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(txAmount);
    if (!amount || !txDescription.trim() || !txAccountId || !txDate) {
      setNotice("Preencha descrição, valor, data e conta. Use vírgula nos centavos."); return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("transactions").insert({
        user_id: session.user.id, kind: txKind, status: txStatus, amount,
        transaction_date: txDate, description: txDescription.trim(),
        account_id: txAccountId, settled_amount: txStatus === "paid" ? amount : "0.00",
        settled_at: txStatus === "paid" ? txDate : null, source: "manual",
      }).select("id,kind,status,amount,transaction_date,description,account_id").single();
      if (error) throw error;
      setTransactions((current) => [data as TransactionRow, ...current].slice(0, 30));
      setTxDescription(""); setTxAmount("");
      setNotice(txStatus === "paid" ? "Lançamento realizado criado." : "Lançamento previsto criado.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function beginTransactionEdit(item: TransactionRow) {
    setEditingTransactionId(item.id);
    setEditDescription(item.description);
    setEditAmount(item.amount.replace(".", ","));
    setEditDate(item.transaction_date);
    setEditStatus(item.status === "planned" ? "planned" : "paid");
  }

  async function saveTransactionEdit(item: TransactionRow) {
    if (!supabase || !session) return;
    const amount = normalizeBrlAmount(editAmount);
    if (!amount || !editDescription.trim() || !editDate) {
      setNotice("Confira a descrição, o valor e a data do lançamento."); return;
    }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("transactions").update({
        description: editDescription.trim(), amount, transaction_date: editDate,
        status: editStatus, settled_amount: editStatus === "paid" ? amount : "0.00",
        settled_at: editStatus === "paid" ? editDate : null,
      }).eq("id", item.id).eq("user_id", session.user.id)
        .select("id,kind,status,amount,transaction_date,description,account_id").single();
      if (error) throw error;
      setTransactions((current) => current.map((row) => row.id === item.id ? data as TransactionRow : row));
      setEditingTransactionId(null);
      setNotice("Lançamento atualizado.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function deleteTransaction(item: TransactionRow) {
    if (!supabase || !session || !window.confirm(`Excluir o lançamento "${item.description}"?`)) return;
    setBusy(true); setNotice("");
    try {
      const { error } = await supabase.from("transactions").delete()
        .eq("id", item.id).eq("user_id", session.user.id);
      if (error) throw error;
      setTransactions((current) => current.filter((row) => row.id !== item.id));
      if (editingTransactionId === item.id) setEditingTransactionId(null);
      setNotice("Lançamento excluído.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function patchReceiptDraft<K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) {
    setReceiptDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function askAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !assistantConsent || assistantQuestion.trim().length < 2) {
      setNotice("Leia e aceite o envio dos dados à IA antes de continuar."); return;
    }
    setBusy(true); setAssistantAnswer(""); setAssistantConsent(false); setNotice("");
    try {
      const facts = {
        "lancamentos recentes": transactions.slice(0, 20).map((item) => ({
          tipo: item.kind, situacao: item.status, valor: item.amount,
          data: item.transaction_date, descricao: item.description,
        })),
      };
      const { data, error } = await supabase.functions.invoke("assistente", {
        body: { consent: true, question: assistantQuestion.trim(), facts, history: [] },
      });
      if (error) throw error;
      setAssistantAnswer(data?.data?.answer ?? "Não foi possível obter uma resposta.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function readReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !receiptFile || !receiptConsent) {
      setNotice("Selecione um comprovante e confirme o envio à IA."); return;
    }
    const supported = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!supported.includes(receiptFile.type) || receiptFile.size > 5 * 1024 * 1024) {
      setNotice("Envie PDF, JPEG, PNG ou WEBP de até 5 MB."); return;
    }
    setBusy(true); setReceiptDraft(null); setReceiptConsent(false); setNotice("");
    try {
      const bytes = new Uint8Array(await receiptFile.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      const { data, error } = await supabase.functions.invoke("ler-comprovante", {
        body: { consent: true, file_base64: btoa(binary), mime_type: receiptFile.type },
      });
      if (error) throw error;
      const draft = data?.data?.draft as ReceiptDraft | null;
      if (draft) setReceiptDraft(draft);
      else setNotice(data?.data?.message ?? "Não foi possível extrair os dados. Faça o lançamento manualmente.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function confirmReceiptDraft() {
    if (!supabase || !session || !receiptDraft?.sufficient || !receiptDraft.amount ||
        !receiptDraft.date || !receiptDraft.kind || !receiptDraft.description || !receiptAccountId) return;
    if (receiptDraft.installment_count && receiptDraft.installment_count > 1) {
      setNotice("Este comprovante indica compra parcelada. O lançamento parcelado precisa ser cadastrado manualmente nesta versão.");
      return;
    }
    const amount = normalizeBrlAmount(receiptDraft.amount.replace(".", ","));
    if (!amount) { setNotice("O valor extraído precisa ser revisado."); return; }
    setBusy(true); setNotice("");
    try {
      let categoryId: string | null = null;
      if (receiptDraft.category) {
        const { data: category, error: categoryError } = await supabase.from("categories")
          .select("id").eq("user_id", session.user.id).eq("kind", receiptDraft.kind)
          .ilike("name", receiptDraft.category).maybeSingle();
        if (categoryError) throw categoryError;
        categoryId = category?.id ?? null;
      }
      let cardId: string | null = null;
      if (receiptDraft.card_last_four) {
        const { data: cards, error: cardError } = await supabase.from("cards")
          .select("id").eq("user_id", session.user.id).eq("is_archived", false)
          .eq("last_four", receiptDraft.card_last_four);
        if (cardError) throw cardError;
        if (cards?.length === 1) cardId = cards[0].id;
      }
      const { data, error } = await supabase.from("transactions").insert({
        user_id: session.user.id, kind: receiptDraft.kind, status: "paid",
        amount, transaction_date: receiptDraft.date, description: receiptDraft.description,
        category_id: categoryId, account_id: cardId ? null : receiptAccountId,
        card_id: cardId, payment_method: receiptDraft.payment_method,
        settled_amount: amount, settled_at: receiptDraft.date, source: "receipt",
      }).select("id,kind,status,amount,transaction_date,description,account_id").single();
      if (error) throw error;
      setTransactions((current) => [data as TransactionRow, ...current].slice(0, 30));
      setReceiptDraft(null); setReceiptFile(null); setReceiptConsent(false);
      setNotice("Lançamento confirmado e criado. O arquivo do comprovante não foi armazenado.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice("");
    const value = Number(threshold.replace(",", "."));
    try {
      const { data, error } = await supabase.functions.invoke("radar-alertas", {
        body: { action: "criar", asset_class: assetClass, symbol: symbol.trim().toUpperCase(),
          condition_type: condition, threshold: value },
      });
      if (error) throw error;
      setAlerts((current) => [data.data as RadarAlert, ...current]);
      setSymbol(""); setThreshold("");
      setNotice("Alerta criado.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function changeAlert(alert: RadarAlert, action: "ativar" | "desativar" | "excluir") {
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.functions.invoke("radar-alertas", {
        body: { action, id: alert.id },
      });
      if (error) throw error;
      if (action === "excluir") setAlerts((current) => current.filter((item) => item.id !== alert.id));
      else setAlerts((current) => current.map((item) => item.id === alert.id
        ? { ...item, ...data.data } : item));
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <div className="app-frame">
        <header className="topbar">
          <a className="brand" href="/" onClick={(event) => event.preventDefault()}>
            <span className="brand-mark" aria-hidden="true">G</span>
            <span>Grana<span className="brand-accent">Viva</span></span>
          </a>
          <div className="topbar-actions">
            {signedIn && <span className="account-chip">{profile?.display_name || session?.user.email}</span>}
            <button className="theme-toggle" type="button" aria-pressed={theme === "light"} onClick={() => void toggleTheme()}>
              <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
              <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
            </button>
            {signedIn && <button className="quiet-button" type="button" onClick={() => void handleSignOut()} disabled={busy}>Sair</button>}
          </div>
        </header>

        {!signedIn ? (
          <section className="welcome" aria-labelledby="welcome-title">
            <div className="welcome-copy">
              <span className="eyebrow"><span className="live-dot" /> CONTROLE FINANCEIRO PESSOAL</span>
              <h1 id="welcome-title">Sua vida financeira, <span>em equilíbrio.</span></h1>
              <p>Um espaço claro e seguro para acompanhar seu dinheiro, organizar decisões e construir seu futuro — gratuito para todos.</p>
              <div className="foundation-state">
                <span className="state-icon" aria-hidden="true">✓</span>
                <span><strong>Privacidade em primeiro lugar</strong><small>Seus dados são isolados por conta e protegidos no servidor.</small></span>
              </div>
            </div>
            <section className="auth-card" aria-labelledby="auth-title">
              <span className="principles-label">SUA CONTA GRANAVIVA</span>
              <h2 id="auth-title">{authMode === "entrar" ? "Bem-vindo de volta" : "Criar sua conta"}</h2>
              {!supabase ? (
                <p className="muted-copy">O ambiente ainda não está conectado ao Supabase. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para habilitar o acesso.</p>
              ) : !authReady ? <p className="muted-copy">Verificando sua sessão…</p> : (
                <form className="stack-form" onSubmit={(event) => void handleAuth(event)}>
                  {authMode === "criar" && <label>Nome de exibição<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="name" required /></label>}
                  <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
                  <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete={authMode === "entrar" ? "current-password" : "new-password"} required /></label>
                  <button className="primary-button" type="submit" disabled={busy}>{busy ? "Aguarde…" : authMode === "entrar" ? "Entrar" : "Criar conta"}</button>
                </form>
              )}
              <button className="text-button" type="button" onClick={() => { setAuthMode(authMode === "entrar" ? "criar" : "entrar"); setNotice(""); }}>
                {authMode === "entrar" ? "Ainda não tem conta? Criar agora" : "Já tem uma conta? Entrar"}
              </button>
              {notice && <p className="notice" role="status">{notice}</p>}
            </section>
          </section>
        ) : (
          <section className="dashboard" aria-labelledby="dashboard-title">
            <div className="dashboard-heading">
              <div><span className="eyebrow"><span className="live-dot" /> ÁREA PESSOAL</span><h1 id="dashboard-title">Olá{profile?.display_name ? `, ${profile.display_name}` : ""}.</h1><p>Seus dados estão sincronizados com sua conta.</p></div>
              <div className="metric-card"><strong>{alerts.length}</strong><span>alertas no Radar</span><small>{enabledAlerts} ativos</small></div>
            </div>
            <section className="panel" aria-labelledby="radar-title">
              <div className="panel-heading"><div><span className="principles-label">ACOMPANHAMENTO DE ATIVOS</span><h2 id="radar-title">Radar de preços</h2><p>Crie alertas para acompanhar seus ativos. A cotação e o disparo automático dependem da próxima integração de dados.</p></div></div>
              <form className="radar-form" onSubmit={(event) => void createAlert(event)}>
                <label>Classe<select value={assetClass} onChange={(event) => setAssetClass(event.target.value as RadarAlert["asset_class"])}><option value="stock">Ação</option><option value="fii">FII</option><option value="etf">ETF</option><option value="bdr">BDR</option><option value="crypto">Cripto</option></select></label>
                <label>Ativo<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Ex.: PETR4" maxLength={32} required /></label>
                <label>Condição<select value={condition} onChange={(event) => setCondition(event.target.value as RadarAlert["condition_type"])}><option value="above">Preço acima de</option><option value="below">Preço abaixo de</option><option value="daily_drop">Queda no dia (%)</option></select></label>
                <label>{condition === "daily_drop" ? "Queda (%)" : "Valor (R$)"}<input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} placeholder="0,00" required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Criar alerta</button>
              </form>
              {alerts.length === 0 ? <p className="empty-state">Você ainda não tem alertas cadastrados.</p> : (
                <ul className="alert-list">
                  {alerts.map((alert) => <li key={alert.id}>
                    <div><strong>{alert.symbol}</strong><span>{alert.asset_class.toUpperCase()} · {alert.condition_type === "above" ? "Acima de" : alert.condition_type === "below" ? "Abaixo de" : "Queda diária"} {alert.threshold}{alert.condition_type === "daily_drop" ? "%" : ""}</span><small>Geração {alert.generation} · {alert.is_enabled ? "Ativo" : "Pausado"}</small></div>
                    <div className="alert-actions">
                      <button className="quiet-button" type="button" disabled={busy} onClick={() => void changeAlert(alert, alert.is_enabled ? "desativar" : "ativar")}>{alert.is_enabled ? "Pausar" : "Reativar"}</button>
                      <button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void changeAlert(alert, "excluir")}>Excluir</button>
                    </div>
                  </li>)}
                </ul>
              )}
            </section>
            <section className="panel" aria-labelledby="accounts-title">
              <div className="panel-heading"><div><span className="principles-label">BASE FINANCEIRA</span><h2 id="accounts-title">Contas e lançamentos</h2><p>Cadastre suas contas e registre receitas e despesas. Valores previstos permanecem separados dos realizados.</p></div></div>
              <form className="finance-form" onSubmit={(event) => void createAccount(event)}>
                <label>Nome da conta<input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={100} placeholder="Ex.: Conta principal" required /></label>
                <label>Tipo<select value={accountType} onChange={(event) => setAccountType(event.target.value)}><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro</option><option value="investment">Investimentos</option><option value="other">Outra</option></select></label>
                <label>Saldo inicial (R$)<input inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0,00" required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Adicionar conta</button>
              </form>
              {accounts.length > 0 ? <ul className="account-list">{accounts.map((account) => <li key={account.id}><strong>{account.name}{account.is_primary ? " · Principal" : ""}</strong><span>{account.account_type}</span><small>Saldo inicial: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(account.opening_balance))}</small></li>)}</ul> : <p className="empty-state">Cadastre sua primeira conta para começar.</p>}
              <form className="finance-form transaction-form" onSubmit={(event) => void createTransaction(event)}>
                <label>Tipo de lançamento<select value={txKind} onChange={(event) => setTxKind(event.target.value as "income" | "expense")}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                <label>Situação<select value={txStatus} onChange={(event) => setTxStatus(event.target.value as "paid" | "planned")}><option value="paid">Realizado</option><option value="planned">Previsto</option></select></label>
                <label>Valor (R$)<input inputMode="decimal" value={txAmount} onChange={(event) => setTxAmount(event.target.value)} placeholder="0,00" required /></label>
                <label>Data<input type="date" value={txDate} onChange={(event) => setTxDate(event.target.value)} required /></label>
                <label>Conta<select value={txAccountId} onChange={(event) => setTxAccountId(event.target.value)} required><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                <label className="wide-field">Descrição<input value={txDescription} onChange={(event) => setTxDescription(event.target.value)} maxLength={240} placeholder="Ex.: Mercado" required /></label>
                <button className="primary-button" type="submit" disabled={busy || accounts.length === 0}>Salvar lançamento</button>
              </form>
              <div className="transaction-heading"><strong>Últimos lançamentos</strong><span>Até 30 registros</span></div>
              {transactions.length === 0 ? <p className="empty-state">Seus lançamentos aparecerão aqui.</p> : <ul className="transaction-list">{transactions.map((item) => <li key={item.id}><div className="transaction-main"><div><strong>{item.description}</strong><span>{item.kind === "income" ? "Receita" : item.kind === "expense" ? "Despesa" : "Transferência"} · {item.status === "paid" ? "Realizado" : item.status === "planned" ? "Previsto" : "Cancelado"}</span><small>{new Date(item.transaction_date + "T12:00:00").toLocaleDateString("pt-BR")}</small></div><strong className={item.kind === "income" ? "income-value" : "expense-value"}>{item.kind === "income" ? "+" : item.kind === "expense" ? "−" : ""}{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(item.amount))}</strong></div><div className="transaction-row-actions"><button className="quiet-button" type="button" disabled={busy} onClick={() => beginTransactionEdit(item)}>Editar</button><button className="quiet-button danger-button" type="button" disabled={busy} onClick={() => void deleteTransaction(item)}>Excluir</button></div>{editingTransactionId === item.id && <form className="transaction-edit-form" onSubmit={(event) => { event.preventDefault(); void saveTransactionEdit(item); }}><label>Descrição<input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={240} required /></label><label>Valor (R$)<input inputMode="decimal" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} required /></label><label>Data<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} required /></label><label>Situação<select value={editStatus} onChange={(event) => setEditStatus(event.target.value as "paid" | "planned")}><option value="paid">Realizado</option><option value="planned">Previsto</option></select></label><button className="primary-button" type="submit" disabled={busy}>Salvar alterações</button><button className="quiet-button" type="button" disabled={busy} onClick={() => setEditingTransactionId(null)}>Cancelar</button></form>}</li>)}</ul>}
            </section>

            <section className="panel" aria-labelledby="assistant-title">
              <span className="principles-label">INTELIGÊNCIA ARTIFICIAL COM CONTROLE</span>
              <h2 id="assistant-title">Assistente financeiro</h2>
              <p>Faça uma pergunta sobre seus lançamentos recentes. Nenhum dado é enviado sem sua confirmação explícita nesta solicitação.</p>
              <form className="assistant-form" onSubmit={(event) => void askAssistant(event)}>
                <label>Pergunta<textarea value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} maxLength={1000} rows={3} placeholder="Ex.: Quais despesas recentes devo revisar?" required /></label>
                <label className="consent-row"><input type="checkbox" checked={assistantConsent} disabled={busy} onChange={(event) => setAssistantConsent(event.target.checked)} /> Li e autorizo o envio da pergunta e dos até 20 lançamentos recentes à IA para gerar esta resposta. O envio ocorre somente ao tocar em Perguntar.</label>
                <button className="primary-button" type="submit" disabled={busy || !assistantConsent || assistantQuestion.trim().length < 2}>Perguntar</button>
              </form>
              {assistantAnswer && <p className="assistant-answer" role="status">{assistantAnswer}</p>}
            </section>

            <section className="panel" aria-labelledby="receipt-title">
              <span className="principles-label">LEITURA ASSISTIDA</span>
              <h2 id="receipt-title">Ler comprovante</h2>
              <p>Envie um PDF ou imagem para extrair uma prévia. O arquivo é processado em memória; esta etapa não armazena o anexo.</p>
              <form className="assistant-form" onSubmit={(event) => void readReceipt(event)}>
                <label>Arquivo<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { setReceiptFile(event.target.files?.[0] ?? null); setReceiptDraft(null); setReceiptConsent(false); }} /></label>
                <label className="consent-row"><input type="checkbox" checked={receiptConsent} disabled={busy} onChange={(event) => setReceiptConsent(event.target.checked)} /> Autorizo o envio deste arquivo à IA para leitura e extração de uma prévia.</label>
                <button className="primary-button" type="submit" disabled={busy || !receiptFile || !receiptConsent}>Analisar comprovante</button>
              </form>
              {receiptDraft && <div className="receipt-preview">
                <strong>{receiptDraft.sufficient ? "Revise os dados extraídos" : "Não foi possível extrair um lançamento único"}</strong>
                {receiptDraft.sufficient && <div className="receipt-edit-grid">
                  <label>Descrição<input value={receiptDraft.description ?? ""} onChange={(event) => patchReceiptDraft("description", event.target.value)} maxLength={80} required /></label>
                  <label>Tipo<select value={receiptDraft.kind ?? "expense"} onChange={(event) => patchReceiptDraft("kind", event.target.value as "income" | "expense")}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                  <label>Valor (R$)<input inputMode="decimal" value={receiptDraft.amount ?? ""} onChange={(event) => patchReceiptDraft("amount", event.target.value.replace(",", "."))} required /></label>
                  <label>Data<input type="date" value={receiptDraft.date ?? ""} onChange={(event) => patchReceiptDraft("date", event.target.value)} required /></label>
                  <label>Categoria<input value={receiptDraft.category ?? ""} onChange={(event) => patchReceiptDraft("category", event.target.value || null)} maxLength={80} placeholder="Opcional" /></label>
                  <label>Forma de pagamento<input value={receiptDraft.payment_method ?? ""} onChange={(event) => patchReceiptDraft("payment_method", event.target.value || null)} maxLength={40} placeholder="Opcional" /></label>
                </div>}
                {receiptDraft.warnings.length > 0 && <ul>{receiptDraft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
                {receiptDraft.sufficient && <><label>Conta para registrar<select value={receiptAccountId} onChange={(event) => setReceiptAccountId(event.target.value)}><option value="">Selecione</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>{receiptDraft.installment_count && receiptDraft.installment_count > 1 && <p>Parcelamento identificado ({receiptDraft.installment_count} vezes). O registro parcelado ainda não está habilitado neste fluxo.</p>}<button className="primary-button" type="button" disabled={busy || !receiptAccountId || Boolean(receiptDraft.installment_count && receiptDraft.installment_count > 1)} onClick={() => void confirmReceiptDraft()}>Confirmar e criar lançamento</button></>}
              </div>}
              <p className="muted-copy">A confirmação cria somente o lançamento. O armazenamento privado do arquivo e o vínculo do anexo ainda serão implementados separadamente.</p>
            </section>

            <section className="panel coming-panel"><span className="principles-label">PRÓXIMAS CONEXÕES</span><h2>Seu financeiro em expansão</h2><p>Investimentos, importações, metas, cartões, notificações e automações serão conectados em etapas testadas, preservando a separação entre valores realizados e previstos.</p></section>
            {notice && <p className="notice" role="status">{notice}</p>}
          </section>
        )}

        <footer className="app-footer"><span>GRANAVIVA</span><span>Privacidade · Clareza · Gratuito para todos</span></footer>
      </div>
    </main>
  );
}
