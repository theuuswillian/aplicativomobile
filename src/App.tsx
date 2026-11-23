import { useState } from "react";

type Theme = "dark" | "light";

export default function App() {
  const [theme, setTheme] = useState<Theme>("dark");

  return (
    <main className="app-shell" data-theme={theme}>
      <div className="app-frame">
        <header className="topbar">
          <a className="brand" href="/" aria-label="GranaViva, início">
            <span className="brand-mark" aria-hidden="true">G</span>
            <span>Grana<span className="brand-accent">Viva</span></span>
          </a>
          <button
            className="theme-toggle"
            type="button"
            aria-pressed={theme === "light"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          >
            <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
            <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
          </button>
        </header>

        <section className="welcome" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <span className="eyebrow"><span className="live-dot" /> FUNDAÇÃO DO PRODUTO</span>
            <h1 id="welcome-title">Sua vida financeira, <span>em equilíbrio.</span></h1>
            <p>
              Um espaço claro e seguro para acompanhar seu dinheiro,
              organizar decisões e construir seu futuro — sem planos pagos.
            </p>
            <div className="foundation-state">
              <span className="state-icon" aria-hidden="true">✓</span>
              <span>
                <strong>Base do projeto em construção</strong>
                <small>Autenticação e dados reais ainda não estão conectados.</small>
              </span>
            </div>
          </div>

          <aside className="principles" aria-label="Princípios do GranaViva">
            <span className="principles-label">PRINCÍPIOS DO PRODUTO</span>
            <ul>
              <li><span aria-hidden="true">01</span><div><strong>Privacidade primeiro</strong><small>Seus dados pertencem a você.</small></div></li>
              <li><span aria-hidden="true">02</span><div><strong>Clareza financeira</strong><small>Realizado separado do planejado.</small></div></li>
              <li><span aria-hidden="true">03</span><div><strong>Gratuito para todos</strong><small>Sem planos, cobranças ou bloqueios pagos.</small></div></li>
            </ul>
          </aside>
        </section>

        <footer className="app-footer">
          <span>GRANAVIVA</span>
          <span>Fundação técnica · versão em desenvolvimento</span>
        </footer>
      </div>
    </main>
  );
}
