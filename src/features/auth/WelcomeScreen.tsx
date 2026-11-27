import type { FormEvent } from "react";
import { ChartNoAxesColumn, Eye, EyeOff, LineChart, LockKeyhole, ShieldCheck } from "lucide-react";

export type AuthMode = "entrar" | "criar" | "recuperar";

type WelcomeScreenProps = {
  supabaseConfigured: boolean;
  authReady: boolean;
  authMode: AuthMode;
  onAuthModeChange: (mode: AuthMode) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  busy: boolean;
  notice: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Tela pública: apresentação e formulário de entrar, criar conta ou recuperar senha. */
export function WelcomeScreen(props: WelcomeScreenProps) {
  const { authMode } = props;
  return <div className="public-layout">
    <header className="public-topbar">
      <a className="brand" href="/" onClick={(event) => event.preventDefault()}>
        <span className="brand-mark" aria-hidden="true"><ChartNoAxesColumn size={18} strokeWidth={2} /></span>
        <span>Grana<span className="brand-accent">Viva</span></span>
      </a>
    </header>
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-copy">
        <span className="eyebrow"><span className="live-dot" aria-hidden="true" /> Controle financeiro pessoal</span>
        <h1 id="welcome-title">Sua vida financeira, <span>em equilíbrio.</span></h1>
        <p>Um espaço claro e seguro para acompanhar seu dinheiro, organizar decisões e construir seu futuro — gratuito para todos.</p>
        <ul className="welcome-points">
          <li><span className="welcome-point-icon" aria-hidden="true"><ShieldCheck size={18} strokeWidth={1.75} /></span><span><strong>Privacidade em primeiro lugar</strong><small>Seus dados são isolados por conta e protegidos no servidor.</small></span></li>
          <li><span className="welcome-point-icon" aria-hidden="true"><LineChart size={18} strokeWidth={1.75} /></span><span><strong>Tudo em um só lugar</strong><small>Contas, cartões, metas e investimentos com valores realizados.</small></span></li>
        </ul>
      </div>
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="auth-card-icon" aria-hidden="true"><LockKeyhole size={20} strokeWidth={1.75} /></span>
        <h2 id="auth-title">{authMode === "entrar" ? "Bem-vindo de volta" : authMode === "criar" ? "Criar sua conta" : "Recuperar senha"}</h2>
        {authMode === "recuperar" && <p className="muted-copy">Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.</p>}
        {!props.supabaseConfigured ? (
          <p className="muted-copy">O ambiente ainda não está conectado ao Supabase. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para habilitar o acesso.</p>
        ) : !props.authReady ? <p className="muted-copy">Verificando sua sessão…</p> : (
          <form className="stack-form" onSubmit={props.onSubmit}>
            {authMode === "criar" && <label>Nome de exibição<input value={props.displayName} onChange={(event) => props.onDisplayNameChange(event.target.value)} maxLength={80} autoComplete="name" placeholder="Como quer ser chamada(o)?" required /></label>}
            <label>E-mail<input type="email" value={props.email} onChange={(event) => props.onEmailChange(event.target.value)} autoComplete="email" inputMode="email" placeholder="voce@email.com" required /></label>
            {authMode !== "recuperar" && <label>Senha<span className="password-field"><input type={props.showPassword ? "text" : "password"} value={props.password} onChange={(event) => props.onPasswordChange(event.target.value)} minLength={8} autoComplete={authMode === "entrar" ? "current-password" : "new-password"} placeholder={authMode === "criar" ? "Mínimo de 8 caracteres" : "Sua senha"} required /><button type="button" className="password-toggle" aria-label={props.showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={props.showPassword} onClick={props.onToggleShowPassword}>{props.showPassword ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}</button></span></label>}
            {authMode === "entrar" && <button className="text-button forgot-link" type="button" onClick={() => props.onAuthModeChange("recuperar")}>Esqueci minha senha</button>}
            <button className="primary-button" type="submit" disabled={props.busy}>{props.busy ? "Aguarde…" : authMode === "entrar" ? "Entrar" : authMode === "criar" ? "Criar conta" : "Enviar link de recuperação"}</button>
          </form>
        )}
        {props.notice && <p className="notice" role="status">{props.notice}</p>}
        <button className="text-button auth-switch" type="button" onClick={() => props.onAuthModeChange(authMode === "entrar" ? "criar" : "entrar")}>
          {authMode === "entrar" ? <>Ainda não tem conta? <strong>Criar agora</strong></> : <>Já tem uma conta? <strong>Entrar</strong></>}
        </button>
      </section>
    </section>
  </div>;
}
