import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { isJsonRequest, readJsonObject, jsonResponse, methodNotAllowed } from "./http.ts";
import { validateDisplayName } from "./validation.ts";
import { validateSettingsPatch } from "./settings-validation.ts";
import { MAX_RECEIPT_BYTES, validateReceiptBase64 } from "./receipt-validation.ts";
import { validateAssistantInput, validateAssistantOutput } from "./assistant-validation.ts";
import { validateReceiptDraft } from "./receipt-ai-validation.ts";

Deno.test("display name trims whitespace and rejects non-text or oversized input", () => {
  deepStrictEqual(validateDisplayName("  Ana  "), { ok: true, value: "Ana" });
  deepStrictEqual(validateDisplayName("   "), { ok: true, value: null });
  strictEqual(validateDisplayName(42).ok, false);
  strictEqual(validateDisplayName("x".repeat(81)).ok, false);
});

Deno.test("settings patch accepts only known fields and strict values", () => {
  deepStrictEqual(validateSettingsPatch({ theme: "dark", push_enabled: false }), {
    ok: true,
    value: { theme: "dark", push_enabled: false },
  });
  strictEqual(validateSettingsPatch({ theme: "system", is_admin: true }).ok, false);
  strictEqual(validateSettingsPatch({ accent: "red" }).ok, false);
  strictEqual(validateSettingsPatch({}).ok, false);
});

Deno.test("receipt validator checks MIME signature and the 5 MB boundary", () => {
  const pdf = btoa("%PDF-1.7");
  const accepted = validateReceiptBase64(pdf, "application/pdf");
  strictEqual(accepted.ok, true);
  deepStrictEqual(validateReceiptBase64(pdf, "image/png"), {
    ok: false,
    reason: "mime_mismatch",
  });
  const oversized = "A".repeat(Math.ceil((MAX_RECEIPT_BYTES + 1) / 3) * 4);
  deepStrictEqual(validateReceiptBase64(oversized, "application/pdf"), {
    ok: false,
    reason: "too_large",
  });
});

Deno.test("bounded JSON reader accepts objects and rejects arrays, malformed and oversized bodies", async () => {
  const valid = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ action: "consultar" }),
  });
  deepStrictEqual(await readJsonObject(valid), { action: "consultar" });

  for (const body of ["[]", "null", "{broken", "x".repeat(100)]) {
    const request = new Request("https://example.test", { method: "POST", body });
    strictEqual(await readJsonObject(request, 32), null);
  }
});

Deno.test("HTTP responses include safe cache and method headers", async () => {
  const response = jsonResponse({ ok: true });
  strictEqual(response.headers.get("Cache-Control"), "no-store");
  strictEqual(response.headers.get("X-Content-Type-Options"), "nosniff");
  strictEqual(response.headers.get("Access-Control-Allow-Origin"), null);

  const rejected = methodNotAllowed(["POST", "OPTIONS"], null);
  strictEqual(rejected.status, 405);
  strictEqual(rejected.headers.get("Allow"), "POST, OPTIONS");
});

Deno.test("JSON content type must match the exact media type", () => {
  strictEqual(isJsonRequest(new Request("https://example.test", {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })), true);
  strictEqual(isJsonRequest(new Request("https://example.test", {
    headers: { "Content-Type": "application/jsonp" },
  })), false);
});

Deno.test("assistant requires consent and rejects invented numbers", () => {
  strictEqual(validateAssistantInput({
    question: "Como foi o mês?",
    facts: { expenses: "R$ 1.200,00" },
  }), null);
  const input = validateAssistantInput({
    consent: true,
    question: "Como foi o mês?",
    facts: { expenses: "R$ 1.200,00" },
    history: [],
  });
  if (!input) throw new Error("Entrada válida deveria ser aceita.");
  if (!validateAssistantOutput({
    answer: "As despesas foram R$ 1.200,00.",
    sufficient: true,
  }, JSON.stringify({ question: input.question, facts: input.facts }))) {
    throw new Error("Número presente nos fatos deveria ser aceito.");
  }
  strictEqual(validateAssistantOutput({
    answer: "As despesas foram R$ 1.200,00 e a economia foi R$ 900,00.",
    sufficient: true,
  }, JSON.stringify({ question: input.question, facts: input.facts })), null);
});

Deno.test("receipt preview validates exact user category and requires manual confirmation", () => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const result = validateReceiptDraft({
    sufficient: true,
    kind: "expense",
    amount: "123.45",
    date: today,
    description: "Mercado",
    category: "Alimentação",
    payment_method: "Crédito",
    installment_count: 1,
    card_last_four: null,
    confidence: 0.9,
    warnings: [],
  }, [{ name: "Alimentação", kind: "expense" }], []);
  strictEqual(result?.sufficient, true);
  strictEqual(result?.category, "Alimentação");
  strictEqual(validateReceiptDraft({
    sufficient: true,
    kind: "expense",
    amount: "10000000.01",
    date: today,
    description: "Mercado",
    category: null,
    payment_method: null,
    installment_count: null,
    card_last_four: null,
    confidence: 0.9,
    warnings: [],
  }, [], []), null);
});
