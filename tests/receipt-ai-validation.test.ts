import { describe, expect, it } from "vitest";
import { validateReceiptDraft } from "../supabase/functions/_shared/receipt-ai-validation";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const categories = [
  { name: "Alimentação", kind: "expense" },
  { name: "Salário", kind: "income" },
];

function draft(overrides: Record<string, unknown> = {}) {
  return {
    sufficient: true,
    kind: "expense",
    amount: "123.45",
    date: today,
    description: "Mercado",
    category: "Alimentação",
    payment_method: "Crédito",
    installment_count: 1,
    confidence: 0.96,
    warnings: [],
    ...overrides,
  };
}

describe("validateReceiptDraft", () => {
  it("accepts a bounded preview and maps a category from the user's own list", () => {
    expect(validateReceiptDraft(draft(), categories)).toMatchObject({
      sufficient: true,
      kind: "expense",
      amount: "123.45",
      category: "Alimentação",
      installment_count: null,
    });
  });

  it("rejects amounts above R$ 10 million and invalid calendar dates", () => {
    expect(validateReceiptDraft(draft({ amount: "10000000.01" }), categories)).toBeNull();
    expect(validateReceiptDraft(draft({ date: "2026-02-31" }), categories)).toBeNull();
  });

  it("does not accept categories outside the user's categories or wrong kind", () => {
    expect(validateReceiptDraft(draft({ category: "Investimentos" }), categories)).toMatchObject({
      category: null,
      warnings: ["A categoria sugerida não existe na sua lista e precisa ser escolhida na revisão."],
    });
    expect(validateReceiptDraft(draft({ kind: "income", category: "Alimentação" }), categories))
      .toMatchObject({ category: null });
  });

  it("rejects malformed installments and returns an empty draft when insufficient", () => {
    expect(validateReceiptDraft(draft({ installment_count: 49 }), categories)).toBeNull();
    expect(validateReceiptDraft({
      sufficient: false,
      kind: null,
      amount: null,
      date: null,
      description: null,
      category: null,
      payment_method: null,
      installment_count: null,
      confidence: 0.2,
      warnings: ["Documento ilegível"],
    }, categories)).toMatchObject({ sufficient: false, kind: null, amount: null });
  });
});
