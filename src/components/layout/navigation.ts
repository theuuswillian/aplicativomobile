// Mapa de navegação: destinos reais do app (activeTab + sub-aba de Gastos).
import { BarChart3, CreditCard, LayoutDashboard, PiggyBank, Plug, ReceiptText, Settings, Target, TrendingUp, type LucideIcon } from "lucide-react";

export type DashboardTab = "inicio" | "gastos" | "patrimonio" | "planejamento" | "relatorios" | "conta";
export type GastosView = "lancamentos" | "contas" | "planejar" | "conexoes";

export const GASTOS_VIEWS: Array<{ id: GastosView; label: string }> = [
  { id: "lancamentos", label: "Lançamentos" },
  { id: "contas", label: "Contas" },
  { id: "planejar", label: "Orçamentos" },
  { id: "conexoes", label: "Conexões" },
];

export type NavDestination = {
  id: string;
  label: string;
  icon: LucideIcon;
  tab: DashboardTab;
  view?: GastosView;
};

const DESTINATIONS = {
  inicio: { id: "inicio", label: "Visão Geral", icon: LayoutDashboard, tab: "inicio" },
  lancamentos: { id: "lancamentos", label: "Lançamentos", icon: ReceiptText, tab: "gastos", view: "lancamentos" },
  cartoes: { id: "cartoes", label: "Cartões", icon: CreditCard, tab: "gastos", view: "contas" },
  orcamentos: { id: "orcamentos", label: "Orçamentos", icon: PiggyBank, tab: "gastos", view: "planejar" },
  conexoes: { id: "conexoes", label: "Conexões", icon: Plug, tab: "gastos", view: "conexoes" },
  investimentos: { id: "investimentos", label: "Investimentos", icon: TrendingUp, tab: "patrimonio" },
  metas: { id: "metas", label: "Metas", icon: Target, tab: "planejamento" },
  relatorios: { id: "relatorios", label: "Relatórios", icon: BarChart3, tab: "relatorios" },
  ajustes: { id: "ajustes", label: "Ajustes", icon: Settings, tab: "conta" },
} satisfies Record<string, NavDestination>;

/** Barra lateral: fixa no desktop e gaveta (off-canvas) abaixo de 1024px; todos os destinos agrupados por domínio. */
export const SIDEBAR_GROUPS: Array<{ label: string; items: NavDestination[] }> = [
  { label: "Principal", items: [DESTINATIONS.inicio, DESTINATIONS.lancamentos, { ...DESTINATIONS.cartoes, label: "Contas e cartões" }] },
  { label: "Planejamento", items: [DESTINATIONS.orcamentos, DESTINATIONS.metas, DESTINATIONS.investimentos, DESTINATIONS.relatorios] },
  { label: "Conta", items: [DESTINATIONS.conexoes, DESTINATIONS.ajustes] },
];

/** Destino exato da barra lateral para a tela atual. */
export function isSidebarActive(item: NavDestination, tab: DashboardTab, view: GastosView): boolean {
  if (item.tab !== tab) return false;
  return item.view === undefined || item.view === view;
}

/** Título da tela exibido no cabeçalho. */
export function screenTitle(tab: DashboardTab, view: GastosView): string {
  if (tab === "gastos") {
    if (view === "contas") return "Contas e cartões";
    if (view === "planejar") return "Orçamentos";
    if (view === "conexoes") return "Conexões";
    return "Lançamentos";
  }
  return ({ inicio: "Visão Geral", patrimonio: "Investimentos", planejamento: "Metas", relatorios: "Relatórios", conta: "Ajustes" } as const)[tab];
}

/** Frase de apoio exibida sob o título no desktop. */
export function screenDescription(tab: DashboardTab, view: GastosView): string {
  if (tab === "gastos") {
    if (view === "contas") return "Saldos por conta, limites dos cartões e pagamento de faturas.";
    if (view === "planejar") return "Limites mensais por categoria e recorrências.";
    if (view === "conexoes") return "WhatsApp, notificações e importação de extratos.";
    return "Extrato completo, edição e novos registros.";
  }
  return ({
    inicio: "Seu mês em números, com valores realizados.",
    patrimonio: "Carteira, renda fixa, proventos e alertas de preço.",
    planejamento: "Objetivos, contribuições e valores a receber.",
    relatorios: "Resultado do mês calculado com lançamentos realizados.",
    conta: "Perfil, aparência, privacidade e ferramentas.",
  } as const)[tab];
}
