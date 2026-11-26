import { useEffect, useState } from "react";
import { Home, ReceiptText, TrendingUp, UserRound } from "lucide-react";

type MainTab = "inicio" | "gastos" | "patrimonio" | "conta";
interface BottomNavigationProps {
  activeTab: string;
  hidden: boolean;
  onShow: () => void;
  onNavigate: (tab: MainTab) => void;
}

export default function BottomNavigation({ activeTab, hidden, onShow, onNavigate }: BottomNavigationProps) {
  const [browserOcclusion, setBrowserOcclusion] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      // O Safari mantém a viewport de layout atrás da barra inferior do navegador.
      // Compensa a área encoberta para o dock nunca ficar por baixo dos controles.
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setBrowserOcclusion(Math.min(covered, 180));
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const items = [
    { id: "inicio" as const, label: "Início", icon: Home },
    { id: "gastos" as const, label: "Gastos", icon: ReceiptText },
    { id: "patrimonio" as const, label: "Patrimônio", icon: TrendingUp },
    { id: "conta" as const, label: "Conta", icon: UserRound },
  ];

  return (
    <nav
      className={`bottom-nav gv-bottom-nav${hidden ? " is-hidden" : ""}`}
      aria-label="Navegação principal"
      aria-hidden={hidden ? "true" : "false"}
      style={{ bottom: `calc(max(8px, env(safe-area-inset-bottom, 0px)) + ${browserOcclusion}px)` }}
    >
      {items.map(({ id, label, icon: Icon }) => {
        const selected = id === activeTab || (id === "patrimonio" && activeTab === "planejamento") || (id === "conta" && activeTab === "relatorios");
        return <button key={id} type="button" className={selected ? "active" : ""} aria-current={selected ? "page" : undefined}
          onClick={() => { onShow(); onNavigate(id); }}>
          <Icon size={20} strokeWidth={2.2}/><span>{label}</span>
        </button>;
      })}
    </nav>
  );
}
