import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";
import { evaluateRadarAlert, type RadarEvaluationAlert, type RadarQuote } from "../_shared/radar-evaluation.ts";

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);
  if (!isJsonRequest(request)) return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);

  const expectedSecret = Deno.env.get("RADAR_WORKER_SECRET");
  const suppliedSecret = request.headers.get("x-radar-worker-secret") ?? "";
  if (!expectedSecret || expectedSecret.length < 32 || !safeEqual(expectedSecret, suppliedSecret)) {
    return jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Autenticação necessária." } }, 401, origin);
  }
  const body = await readJsonObject(request, 2_048);
  if (!body || Object.keys(body).some((key) => key !== "symbol") ||
      (body.symbol !== undefined && (typeof body.symbol !== "string" || !/^[A-Z0-9.]{1,32}$/.test(body.symbol)))) {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Símbolo inválido." } }, 400, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return jsonResponse({ error: { code: "SERVER_CONFIGURATION", message: "Serviço indisponível." } }, 503, origin);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const pageSize = 200;
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;
    let checked = 0, fired = 0, duplicates = 0, notifications = 0, notificationFailures = 0;
    const pushSecret = Deno.env.get("PUSH_WORKER_SECRET");

    // PostgREST limita o tamanho de cada resposta. Percorrer páginas explícitas
    // impede que alertas habilitados após o primeiro lote fiquem invisíveis.
    while (true) {
      let alertsQuery = db.from("radar_alerts")
        .select("id,user_id,asset_class,symbol,condition_type,threshold,generation,created_at")
        .eq("is_enabled", true)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(pageSize);
      if (cursorCreatedAt && cursorId) {
        alertsQuery = alertsQuery.or(`created_at.gt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.gt.${cursorId})`);
      }
      if (typeof body.symbol === "string") alertsQuery = alertsQuery.eq("symbol", body.symbol);
      const { data: alerts, error: alertsError } = await alertsQuery;
      if (alertsError) return internalError(origin);
      if (!alerts?.length) break;
      checked += alerts.length;

      const symbols = [...new Set(alerts.map((item) => item.symbol))];
      const { data: quotes, error: quotesError } = await db.from("quote_cache")
        .select("symbol,payload,saved_at").in("symbol", symbols);
      if (quotesError) return internalError(origin);
      const quoteMap = new Map((quotes ?? []).map((item) => [item.symbol, {
        ...(item.payload as Record<string, unknown>), symbol: item.symbol, saved_at: item.saved_at,
      } as RadarQuote]));

      for (const alert of alerts) {
        const quote = quoteMap.get(alert.symbol) ?? null;
        const evaluation = evaluateRadarAlert(alert as RadarEvaluationAlert, quote);
        if (!quote || !evaluation.shouldFire || evaluation.price === null) continue;
        const alertKey = `${alert.id}:${alert.generation}`;
        const { error: fireError } = await db.from("radar_fires").insert({
          user_id: alert.user_id, alert_key: alertKey, observed_price: evaluation.price,
          source: quote.source, quote_observed_at: quote.observed_at ?? quote.saved_at,
        });
        if (fireError?.code === "23505") { duplicates++; continue; }
        if (fireError) return internalError(origin);
        fired++;

        if (!pushSecret || pushSecret.length < 32) { notificationFailures++; continue; }
        try {
          const response = await fetch(`${url}/functions/v1/push-worker`, {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(12_000),
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
              "x-worker-secret": pushSecret,
            },
            body: JSON.stringify({
              user_id: alert.user_id, delivery_key: `radar:${alertKey}`,
              title: "Alerta do Radar",
              body: `${alert.symbol}: condição ${alert.condition_type} atingida. Preço observado: ${evaluation.price}. Fonte: ${quote.source}; cotação de ${new Date(quote.observed_at ?? quote.saved_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
              url: "/",
              tag: `radar-${alertKey}`,
            }),
          });
          if (response.ok) notifications++;
          else notificationFailures++;
        } catch { notificationFailures++; }
      }

      const lastAlert = alerts[alerts.length - 1];
      cursorCreatedAt = lastAlert.created_at;
      cursorId = lastAlert.id;
      if (alerts.length < pageSize) break;
    }

    return jsonResponse({
      data: { checked, fired, duplicates, notifications, notification_failures: notificationFailures },
    }, 200, origin);
  } catch { return internalError(origin); }
});
