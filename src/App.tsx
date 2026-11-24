import { FormEvent, useEffect, useMemo, useState } from "react";
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
const THEME_STORAGE_KEY = "granaviva:theme:v1";

function getInitialTheme(): Theme {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir a operação.";
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

  useEffect(() => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* sessão continua funcional */ }
  }, [theme]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthReady(true); }
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setNotice("");
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(null);
      setAlerts([]);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const [account, preferences, radar] = await Promise.all([
          supabase.functions.invoke("minha-conta", { body: { action: "consultar" } }),
          supabase.functions.invoke("minhas-preferencias", { body: { action: "consultar" } }),
          supabase.functions.invoke("radar-alertas", { body: { action: "consultar" } }),
        ]);
        if (account.error) throw account.error;
        if (preferences.error) throw preferences.error;
        if (radar.error) throw radar.error;
        if (!active) return;
        setProfile(account.data?.data?.profile ?? null);
        const serverTheme = preferences.data?.data?.theme;
        if (serverTheme === "light" || serverTheme === "dark") setTheme(serverTheme);
        setAlerts(Array.isArray(radar.data?.data) ? radar.data.data as RadarAlert[] : []);
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
          options: { data: { display_name: displayName.trim() } },
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
            <section className="panel coming-panel"><span className="principles-label">PRÓXIMAS CONEXÕES</span><h2>Seu financeiro em expansão</h2><p>Contas, lançamentos, investimentos, comprovantes, notificações e automações serão conectados em etapas testadas, preservando a separação entre valores realizados e previstos.</p></section>
            {notice && <p className="notice" role="status">{notice}</p>}
          </section>
        )}

        <footer className="app-footer"><span>GRANAVIVA</span><span>Privacidade · Clareza · Gratuito para todos</span></footer>
      </div>
    </main>
  );
}
