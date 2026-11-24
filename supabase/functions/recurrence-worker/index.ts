import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function brazilDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);
  if (!isJsonRequest(request)) return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);

  const expectedSecret = Deno.env.get("RECURRENCE_WORKER_SECRET");
  const suppliedSecret = request.headers.get("x-recurrence-worker-secret") ?? "";
  if (!expectedSecret || expectedSecret.length < 32 || !safeEqual(expectedSecret, suppliedSecret)) {
    return jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Autenticação necessária." } }, 401, origin);
  }
  const body = await readJsonObject(request, 2_048);
  if (!body || Object.keys(body).some((key) => !["until_date", "max_occurrences"].includes(key))) {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Parâmetros inválidos." } }, 400, origin);
  }

  const untilDate = body.until_date === undefined ? addDays(brazilDate(), 30) : body.until_date;
  const maxOccurrences = body.max_occurrences === undefined ? 100 : body.max_occurrences;
  if (typeof untilDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(untilDate) ||
      !Number.isInteger(maxOccurrences) || (maxOccurrences as number) < 1 || (maxOccurrences as number) > 500) {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Data ou limite de geração inválido." } }, 400, origin);
  }
  const date = new Date(`${untilDate}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== untilDate) {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Data inválida." } }, 400, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return jsonResponse({ error: { code: "SERVER_CONFIGURATION", message: "Serviço indisponível." } }, 503, origin);
  try {
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("recurrence_generate_due", {
      p_until: untilDate, p_max_occurrences: maxOccurrences,
    });
    if (error) return internalError(origin);
    const result = Array.isArray(data) ? data[0] : data;
    return jsonResponse({ data: result ?? { created_count: 0, processed_count: 0, has_more: false } }, 200, origin);
  } catch { return internalError(origin); }
});
