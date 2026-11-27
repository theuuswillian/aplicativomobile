import { describe, expect, it } from "vitest";
import { BOTTOM_NAV, SIDEBAR_GROUPS, isBottomNavActive, isSidebarActive, screenTitle, type DashboardTab, type GastosView } from "../src/components/layout/navigation";

const screens: Array<[DashboardTab, GastosView]> = [
  ["inicio", "lancamentos"], ["gastos", "lancamentos"], ["gastos", "contas"], ["gastos", "planejar"], ["gastos", "conexoes"],
  ["patrimonio", "lancamentos"], ["planejamento", "lancamentos"], ["relatorios", "lancamentos"], ["conta", "lancamentos"],
];

describe("navegação", () => {
  it("mantém entre 4 e 5 destinos na barra inferior", () => {
    expect(BOTTOM_NAV.length).toBeGreaterThanOrEqual(4);
    expect(BOTTOM_NAV.length).toBeLessThanOrEqual(5);
  });

  it("acende exatamente um destino da barra inferior em cada tela", () => {
    for (const [tab, view] of screens) {
      expect(BOTTOM_NAV.filter((item) => isBottomNavActive(item, tab, view)), `${tab}/${view}`).toHaveLength(1);
    }
  });

  it("dá a cada tela um destino exato na barra lateral", () => {
    const items = SIDEBAR_GROUPS.flatMap((group) => group.items);
    for (const [tab, view] of screens) {
      expect(items.filter((item) => isSidebarActive(item, tab, view)), `${tab}/${view}`).toHaveLength(1);
    }
  });

  it("nomeia todas as telas", () => {
    for (const [tab, view] of screens) expect(screenTitle(tab, view).length).toBeGreaterThan(3);
  });
});
