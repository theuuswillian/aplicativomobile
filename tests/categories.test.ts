import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, normalizeCategoryName, planDefaultCategorySync, suggestCategoryIcon } from "../src/data/default-categories";
import { isKnownCategoryIcon } from "../src/components/categories/category-icons";

describe("categorias padrão", () => {
  it("tem pelo menos 40 categorias, 30+ despesas e 12 receitas, sem nomes repetidos por tipo", () => {
    const expenses = DEFAULT_CATEGORIES.filter((item) => item.kind === "expense");
    const incomes = DEFAULT_CATEGORIES.filter((item) => item.kind === "income");
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThanOrEqual(40);
    expect(expenses.length).toBeGreaterThanOrEqual(30);
    expect(incomes.length).toBeGreaterThanOrEqual(12);
    const keys = DEFAULT_CATEGORIES.map((item) => `${item.kind}:${normalizeCategoryName(item.name)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("usa ícones lucide conhecidos e cores hexadecimais (sem emoji)", () => {
    for (const item of DEFAULT_CATEGORIES) {
      expect(isKnownCategoryIcon(item.icon), item.name).toBe(true);
      expect(item.color, item.name).toMatch(/^#[0-9a-f]{6}$/i);
      expect(item.icon).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("não duplica categorias antigas: reaproveita aliases e troca emojis por ícones", () => {
    const existing = [
      { id: "1", name: "Mercado", kind: "expense" as const, icon: "🛒", color: "#64748b" },
      { id: "2", name: "Viagem", kind: "expense" as const, icon: "✈️", color: "#64748b" },
      { id: "3", name: "Outras receitas", kind: "income" as const, icon: "💰", color: "#16a34a" },
      { id: "4", name: "Minha categoria", kind: "expense" as const, icon: "🎸", color: null },
      { id: "5", name: "Farmácia", kind: "expense" as const, icon: "Pill", color: "#db2777" },
    ];
    const plan = planDefaultCategorySync(existing, isKnownCategoryIcon);
    const inserted = plan.inserts.map((item) => `${item.kind}:${item.name}`);
    expect(inserted).not.toContain("expense:Mercado");
    expect(inserted).not.toContain("expense:Viagens");
    expect(inserted).not.toContain("income:Outros");
    expect(inserted).not.toContain("expense:Farmácia");
    expect(inserted).toContain("expense:Streaming");
    expect(plan.inserts.every((item) => !("aliases" in item))).toBe(true);
    expect(plan.updates.map((item) => item.id).sort()).toEqual(["1", "2", "3"]);
    // Rodar de novo após aplicar não gera nada.
    const after = [...existing.map((item) => ({ ...item, icon: plan.updates.find((update) => update.id === item.id)?.icon ?? item.icon })), ...plan.inserts.map((item, index) => ({ id: `n${index}`, ...item }))];
    const second = planDefaultCategorySync(after, isKnownCategoryIcon);
    expect(second.inserts).toHaveLength(0);
    expect(second.updates.filter((item) => item.id !== "4")).toHaveLength(0);
  });

  it("sugere ícone pelo nome para categorias criadas pela pessoa", () => {
    expect(suggestCategoryIcon("Supermercado do bairro").icon).toBe("ShoppingCart");
    expect(suggestCategoryIcon("Uber").icon).toBe("CarTaxiFront");
    expect(suggestCategoryIcon("Algo inédito").icon).toBe("Tag");
    expect(suggestCategoryIcon("Prêmio", "income").icon).toBe("Award");
  });

  it("não há mais painel de categorias em Orçamentos e todo seletor usa o combobox", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).not.toContain("gastos-categorias");
    expect(app).not.toMatch(/<label>Categoria<select/);
    expect((app.match(/<CategoryCombobox/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
