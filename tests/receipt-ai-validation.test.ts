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
    card_last_four: null,
    confidence: 0.96,
    warnings: [],
    ...overrides,
  };
}

describe("validateReceiptDraft", () => {
  it("accepts a bounded preview and maps a category from the user's own list", () => {
    expect(validateReceiptDraft(draft(), categories, [{ name: "Cartão principal", last_four: "1234" }])).toMatchObject({
      sufficient: true,
      kind: "expense",
      amount: "123.45",
      category: "Alimentação",
      installment_count: null,
      card_last_four: null,
    });
  });

  it("rejects amounts above R$ 10 million and invalid calendar dates", () => {
    expect(validateReceiptDraft(draft({ amount: "10000000.01" }), categories, [])).toBeNull();
    expect(validateReceiptDraft(draft({ date: "2026-02-31" }), categories, [])).toBeNull();
  });

  it("does not accept categories outside the user's categories or wrong kind", () => {
    expect(validateReceiptDraft(draft({ category: "Investimentos" }), categories, [])).toMatchObject({
      category: null,
      warnings: ["A categoria sugerida não existe na sua lista e precisa ser escolhida na revisão."],
    });
    expect(validateReceiptDraft(draft({ kind: "income", category: "Alimentação" }), categories, []))
      .toMatchObject({ category: null });
  });

  it("rejects malformed installments and returns an empty draft when insufficient", () => {
    expect(validateReceiptDraft(draft({ installment_count: 49 }), categories, [])).toBeNull();
    expect(validateReceiptDraft({
      sufficient: false,
      kind: null,
      amount: null,
      date: null,
      description: null,
      category: null,
      payment_method: null,
      installment_count: null,
      card_last_four: null,
      confidence: 0.2,
      warnings: ["Documento ilegível"],
    }, categories, [])).toMatchObject({ sufficient: false, kind: null, amount: null });
  });
});

  it("accepts a card final only when it matches exactly one active user card", () => {
    expect(validateReceiptDraft(
      draft({ card_last_four: "1234" }),
      categories,
      [{ name: "Cartão principal", last_four: "1234" }],
    )).toMatchObject({ card_last_four: "1234" });

    expect(validateReceiptDraft(
      draft({ card_last_four: "1234" }),
      categories,
      [
        { name: "Cartão A", last_four: "1234" },
        { name: "Cartão B", last_four: "1234" },
      ],
    )).toMatchObject({
      card_last_four: null,
      warnings: ["Há mais de um cartão com esse final; escolha o cartão manualmente."],
    });
  });
