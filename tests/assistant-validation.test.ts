import { describe, expect, it } from "vitest";
import {
  extractNumericTokens,
  validateAssistantInput,
  validateAssistantOutput,
} from "../supabase/functions/_shared/assistant-validation";

describe("validateAssistantInput", () => {
  it("accepts bounded facts, explicit consent and at most three history pairs", () => {
    expect(validateAssistantInput({
      consent: true,
      question: "Como foi meu mês?",
      facts: { income_paid: "R$ 3.200,00", expenses_paid: "R$ 1.200,00" },
      history: [
        { role: "user", content: "E no mês passado?" },
        { role: "assistant", content: "Tenho apenas os dados enviados." },
      ],
    })).not.toBeNull();
  });

  it("requires consent and rejects extra fields or excessive history", () => {
    expect(validateAssistantInput({
      question: "Como foi meu mês?", facts: {}, consent: false,
    })).toBeNull();
    expect(validateAssistantInput({
      question: "Como foi meu mês?", facts: {}, consent: true, user_id: "someone",
    })).toBeNull();
    expect(validateAssistantInput({
      question: "Como foi meu mês?", facts: {}, consent: true,
      history: Array.from({ length: 4 }, () => ({ role: "user", content: "oi" })),
    })).toBeNull();
  });

  it("rejects identifier-like fields and explicit null history", () => {
    expect(validateAssistantInput({
      consent: true,
      question: "Resumo?",
      facts: { user_id: "abc" },
    })).toBeNull();
    expect(validateAssistantInput({
      consent: true,
      question: "Resumo?",
      facts: {},
      history: null,
    })).toBeNull();
  });

  it("rejects deeply nested and oversized financial context", () => {
    expect(validateAssistantInput({
      question: "Resumo?", consent: true,
      facts: { a: { b: { c: { d: { e: "profundo" } } } } },
    })).toBeNull();
    expect(validateAssistantInput({
      question: "Resumo?", consent: true, facts: { data: "x".repeat(12_001) },
    })).toBeNull();
  });
});

describe("validateAssistantOutput", () => {
  it("accepts up to three sentences when every number is present in the source", () => {
    const source = "Receitas realizadas: R$ 3.200,00. Despesas realizadas: R$ 1.200,00.";
    expect(extractNumericTokens(source)).toContain("3200");
    expect(validateAssistantOutput({
      answer: "As receitas foram R$ 3.200,00. As despesas foram R$ 1.200,00.",
      sufficient: true,
    }, source)).not.toBeNull();
  });

  it("rejects invented numbers and answers longer than three sentences", () => {
    const source = "Despesas realizadas: R$ 1.200,00.";
    expect(validateAssistantOutput({
      answer: "Você gastou R$ 1.200,00 e economizou R$ 900,00.",
      sufficient: true,
    }, source)).toBeNull();
    expect(validateAssistantOutput({
      answer: "Uma. Duas. Três. Quatro.",
      sufficient: true,
    }, source)).toBeNull();
  });
});
