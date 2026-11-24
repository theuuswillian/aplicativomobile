import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { isAllowedOrigin, isJsonRequest, readJsonObject, jsonResponse, methodNotAllowed, handleOptions, originNotAllowedResponse } from "./http.ts";
import { validateDisplayName } from "./validation.ts";
import { validateSettingsPatch } from "./settings-validation.ts";
import { MAX_RECEIPT_BYTES, validateReceiptBase64 } from "./receipt-validation.ts";
import { validateAssistantInput, validateAssistantOutput } from "./assistant-validation.ts";
import { validateReceiptDraft } from "./receipt-ai-validation.ts";
import { isRadarAlertId, validateRadarAlertInput, validateRadarAlertPatch } from "./radar-validation.ts";
import { isPushSubscriptionId, validatePushSubscription } from "./push-validation.ts";
import { base64UrlBytes, createVapidAuthorization, encryptWebPushPayload, toArrayBuffer } from "./push-webpush.ts";

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

Deno.test("CORS allowlist is exact and rejects unconfigured browser origins", () => {
  const previous = Deno.env.get("APP_ORIGIN");
  Deno.env.set("APP_ORIGIN", "http://localhost:5173");
  try {
    strictEqual(isAllowedOrigin("http://localhost:5173"), true);
    strictEqual(isAllowedOrigin("https://attacker.example"), false);
    strictEqual(isAllowedOrigin(null), true);
    const allowed = handleOptions(new Request("https://edge.example", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    }));
    strictEqual(allowed.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
    const denied = handleOptions(new Request("https://edge.example", {
      method: "OPTIONS",
      headers: { Origin: "https://attacker.example" },
    }));
    strictEqual(denied.headers.get("Access-Control-Allow-Origin"), null);
    const blocked = originNotAllowedResponse("https://attacker.example");
    strictEqual(blocked.status, 403);
    strictEqual(blocked.headers.get("Access-Control-Allow-Origin"), null);
  } finally {
    if (previous === undefined) Deno.env.delete("APP_ORIGIN");
    else Deno.env.set("APP_ORIGIN", previous);
  }
});

Deno.test("Radar validates symbols, thresholds, conditions and rejects privileged fields", () => {
  const valid = validateRadarAlertInput({
    asset_class: "stock", symbol: "PETR4", condition_type: "above", threshold: 38.5,
  });
  strictEqual(valid.ok, true);
  strictEqual(validateRadarAlertInput({
    asset_class: "stock", symbol: "petr4", condition_type: "above", threshold: 38,
  }).ok, false);
  strictEqual(validateRadarAlertInput({
    asset_class: "crypto", symbol: "BTC-USD", condition_type: "daily_drop", threshold: 101,
  }).ok, false);
  strictEqual(validateRadarAlertInput({
    asset_class: "stock", symbol: "PETR4", condition_type: "above", threshold: 38, generation: 99,
  }).ok, false);
  strictEqual(validateRadarAlertPatch({ threshold: 10, is_enabled: true }).ok, false);
  strictEqual(validateRadarAlertPatch({ condition_type: "daily_drop", threshold: 4 }).ok, true);
  strictEqual(isRadarAlertId("20000000-0000-4000-8000-000000000001"), true);
  strictEqual(isRadarAlertId("not-a-uuid"), false);
});

Deno.test("push subscriptions require HTTPS endpoints and valid browser keys", () => {
  const valid = validatePushSubscription({
    endpoint: "https://fcm.googleapis.com/fcm/send/opaque-token",
    p256dh: "A".repeat(87),
    auth_key: "B".repeat(22),
    user_agent: "Test Browser",
  });
  strictEqual(valid.ok, true);
  strictEqual(validatePushSubscription({
    endpoint: "http://push.example.test/send/token",
    p256dh: "A".repeat(87), auth_key: "B".repeat(22),
  }).ok, false);
  strictEqual(validatePushSubscription({
    endpoint: "https://user:pass@push.example.test/send/token",
    p256dh: "A".repeat(87), auth_key: "B".repeat(22),
  }).ok, false);
  strictEqual(validatePushSubscription({
    endpoint: "https://fcm.googleapis.com/fcm/send/token",
    p256dh: "A".repeat(10), auth_key: "B".repeat(22),
  }).ok, false);
  strictEqual(isPushSubscriptionId("20000000-0000-4000-8000-000000000001"), true);
});

Deno.test("VAPID authorization signs an ES256 JWT for the push origin", async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const publicKey = base64UrlBytes(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateKey = base64UrlBytes(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)));
  const authorization = await createVapidAuthorization(
    "https://fcm.googleapis.com/fcm/send/test", publicKey, privateKey, "mailto:security@example.test",
  );
  const token = authorization.match(/^vapid t=([^,]+), k=/)?.[1];
  if (!token) throw new Error("VAPID token was not produced.");
  const [header, payload, signature] = token.split(".");
  const verifyKey = await crypto.subtle.importKey(
    "raw", Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - publicKey.length % 4) % 4)), (c) => c.charCodeAt(0)),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  const decodedPayload = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - payload.length % 4) % 4)), (c) => c.charCodeAt(0)),
  ));
  strictEqual(decodedPayload.aud, "https://fcm.googleapis.com");
  strictEqual(await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, verifyKey,
    Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - signature.length % 4) % 4)), (c) => c.charCodeAt(0)),
    new TextEncoder().encode(`${header}.${payload}`),
  ), true);
});

Deno.test("Web Push payload encryption creates an aes128gcm record", async () => {
  const client = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  );
  const clientPublic = base64UrlBytes(new Uint8Array(await crypto.subtle.exportKey("raw", client.publicKey)));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const auth = base64UrlBytes(authSecret);
  const encrypted = await encryptWebPushPayload('{"title":"GranaViva"}', clientPublic, auth);
  strictEqual(encrypted.length > 86, true);
  strictEqual(encrypted[20], 65);
  strictEqual(encrypted[16], 0);
  strictEqual(encrypted[17], 0);
  strictEqual(encrypted[18], 16);
  strictEqual(encrypted[19], 0);

  const salt = encrypted.slice(0, 16);
  const serverPublic = encrypted.slice(21, 86);
  const serverKey = await crypto.subtle.importKey(
    "raw", serverPublic, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: serverKey }, client.privateKey, 256,
  ));
  const hmac = async (keyBytes: Uint8Array, data: Uint8Array) => {
    const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(data)));
  };
  const expand = async (prk: Uint8Array, info: Uint8Array, length: number) => {
    let previous = new Uint8Array(), result = new Uint8Array();
    for (let counter = 1; result.length < length; counter++) {
      previous = new Uint8Array(await hmac(prk, new Uint8Array([...previous, ...info, counter])));
      result = new Uint8Array([...result, ...previous]);
    }
    return result.slice(0, length);
  };
  const authPrk = await hmac(authSecret, shared);
  const clientPublicBytes = (() => {
    const base64 = clientPublic.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  })();
  const info = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info\0"), ...clientPublicBytes, ...serverPublic,
  ]);
  const inputKey = await expand(authPrk, info, 32);
  const contentPrk = await hmac(salt, inputKey);
  const cek = await expand(contentPrk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await expand(contentPrk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 }, aes, encrypted.slice(86),
  ));
  strictEqual(new TextDecoder().decode(plaintext.slice(0, -1)), '{"title":"GranaViva"}');
  strictEqual(plaintext[plaintext.length - 1], 2);
});


Deno.test("Radar evaluator applies thresholds and daily drop percentage", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");
  const base = {
    id: "alert-1", generation: 2, asset_class: "stock", symbol: "PETR4",
    condition_type: "above" as const, threshold: "30.00",
  };
  const fresh = { symbol: "PETR4", price: "30.00", source: "test", saved_at: "2026-11-24T11:59:00Z" };
  strictEqual(evaluateRadarAlert(base, fresh, now).shouldFire, true);
  strictEqual(evaluateRadarAlert({ ...base, condition_type: "below", threshold: 25 }, fresh, now).shouldFire, false);
  strictEqual(evaluateRadarAlert({ ...base, condition_type: "daily_drop", threshold: 5 }, {
    ...fresh, price: 90, previous_close: 100,
  }, now).shouldFire, true);
});

Deno.test("Radar evaluator rejects stale, mismatched and incomplete quotes", () => {
  const alert = {
    id: "alert-2", generation: 1, asset_class: "fii", symbol: "HGLG11",
    condition_type: "daily_drop" as const, threshold: 5,
  };
  const quote = { symbol: "HGLG11", price: 90, previous_close: 100, asset_class: "fii", source: "test", saved_at: "2026-11-24T11:59:00Z" };
  strictEqual(evaluateRadarAlert(alert, { ...quote, saved_at: "2026-11-24T10:00:00Z" }, Date.parse("2026-11-24T12:00:00Z")).reason, "stale_quote");
  strictEqual(evaluateRadarAlert(alert, { ...quote, asset_class: "stock" }, Date.parse("2026-11-24T12:00:00Z")).reason, "asset_mismatch");
  strictEqual(evaluateRadarAlert(alert, { ...quote, previous_close: null }, Date.parse("2026-11-24T12:00:00Z")).reason, "invalid_quote");
});
