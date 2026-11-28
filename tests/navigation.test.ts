import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as navigation from "../src/components/layout/navigation";
import { SIDEBAR_GROUPS, isSidebarActive, screenTitle, type DashboardTab, type GastosView } from "../src/components/layout/navigation";
import { DRAWER_EDGE_PX, decideDrawerSnap } from "../src/components/layout/drawer-gesture";

const screens: Array<[DashboardTab, GastosView]> = [
  ["inicio", "lancamentos"], ["gastos", "lancamentos"], ["gastos", "contas"], ["gastos", "planejar"], ["gastos", "conexoes"],
  ["patrimonio", "lancamentos"], ["planejamento", "lancamentos"], ["relatorios", "lancamentos"], ["conta", "lancamentos"],
];

describe("navegação", () => {
  it("não tem mais barra inferior: a navegação mobile é a gaveta lateral", () => {
    expect("BOTTOM_NAV" in navigation).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/components/layout/BottomNav.tsx"))).toBe(false);
    const css = readFileSync(resolve(process.cwd(), "src/styles/app.css"), "utf8");
    expect(css).not.toContain(".bottom-nav");
    expect(css).not.toContain("--nav-height");
  });

  it("dá a cada tela um destino exato na barra lateral", () => {
    const items = SIDEBAR_GROUPS.flatMap((group) => group.items);
    for (const [tab, view] of screens) {
      expect(items.filter((item) => isSidebarActive(item, tab, view)), `${tab}/${view}`).toHaveLength(1);
    }
  });

  it("não oferece Categorias como destino de navegação", () => {
    const labels = SIDEBAR_GROUPS.flatMap((group) => group.items.map((item) => item.label.toLowerCase()));
    expect(labels.some((label) => label.includes("categoria"))).toBe(false);
  });

  it("nomeia todas as telas", () => {
    for (const [tab, view] of screens) expect(screenTitle(tab, view).length).toBeGreaterThan(3);
  });
});

describe("gesto da gaveta", () => {
  it("usa uma faixa de borda de ~24px", () => expect(DRAWER_EDGE_PX).toBe(24));
  it("encaixa pela distância quando o gesto é lento", () => {
    expect(decideDrawerSnap({ fromOpen: false, dx: 150, velocity: 0.1, width: 280 })).toBe(true);
    expect(decideDrawerSnap({ fromOpen: false, dx: 60, velocity: 0.1, width: 280 })).toBe(false);
    expect(decideDrawerSnap({ fromOpen: true, dx: -150, velocity: -0.1, width: 280 })).toBe(false);
    expect(decideDrawerSnap({ fromOpen: true, dx: -40, velocity: -0.1, width: 280 })).toBe(true);
  });
  it("um flick rápido decide mesmo com pouca distância", () => {
    expect(decideDrawerSnap({ fromOpen: false, dx: 40, velocity: 0.9, width: 280 })).toBe(true);
    expect(decideDrawerSnap({ fromOpen: true, dx: -30, velocity: -0.9, width: 280 })).toBe(false);
  });
});
