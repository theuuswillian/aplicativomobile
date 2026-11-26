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
    const workerKey = typeof body.symbol === "string" ? `radar-alerts:${body.symbol}` : "radar-alerts";
    const { data: claimRows, error: claimError } = await db.rpc("radar_worker_claim", {
      p_worker_key: workerKey, p_lease_seconds: 180,
    });
    if (claimError) return internalError(origin);
    const claim = Array.isArray(claimRows) ? claimRows[0] : null;
    if (!claim) return internalError(origin);
    if (claim.reservation_status === "busy") {
      return jsonResponse({ data: { busy: true, checked: 0, has_more: true } }, 200, origin);
    }
    if (claim.reservation_status !== "reserved" || typeof claim.fencing_token !== "string") return internalError(origin);

    const fencingToken = claim.fencing_token;
    const pageSize = 20;
    let alertsQuery = db.from("radar_alerts")
      .select("id,user_id,asset_class,symbol,condition_type,threshold,generation,created_at")
      .eq("is_enabled", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(pageSize);
    if (claim.cursor_created_at && claim.cursor_id) {
      alertsQuery = alertsQuery.or(
        `created_at.gt.${claim.cursor_created_at},and(created_at.eq.${claim.cursor_created_at},id.gt.${claim.cursor_id})`,
      );
    }
    if (typeof body.symbol === "string") alertsQuery = alertsQuery.eq("symbol", body.symbol);

    const { data: alerts, error: alertsError } = await alertsQuery;
    if (alertsError) return internalError(origin);
    const page = alerts ?? [];
    const symbols = [...new Set(page.map((item) => item.symbol))];
    const { data: quotes, error: quotesError } = symbols.length
      ? await db.from("quote_cache").select("symbol,payload,saved_at").in("symbol", symbols)
      : { data: [], error: null };
    if (quotesError) return internalError(origin);
    const quoteMap = new Map((quotes ?? []).map((item) => [item.symbol, {
      ...(item.payload as Record<string, unknown>), symbol: item.symbol, saved_at: item.saved_at,
    } as RadarQuote]));

    let fired = 0, duplicates = 0;
    const notificationsToSend: Array<{ alertKey: string; userId: string; symbol: string; condition: string; price: number; source: string; observedAt: string }> = [];
    for (const alert of page) {
      const quote = quoteMap.get(alert.symbol) ?? null;
      const evaluation = evaluateRadarAlert(alert as RadarEvaluationAlert, quote);
      if (!quote || !evaluation.shouldFire || evaluation.price === null) continue;
      const alertKey = `${alert.id}:${alert.generation}`;
      const { error: fireError } = await db.from("radar_fires").insert({
        user_id: alert.user_id, alert_key: alertKey, observed_price: evaluation.price,
        source: quote.source, quote_observed_at: quote.observed_at ?? quote.saved_at,
      });
      if (fireError?.code === "23505") duplicates++;
      else if (fireError) return internalError(origin);
      else fired++;
      // Reenviar também quando o fire já existe: push-worker usa delivery_key
      // idempotente. Isso recupera uma queda entre gravar o fire e notificar.
      notificationsToSend.push({
        alertKey, userId: alert.user_id, symbol: alert.symbol,
        condition: alert.condition_type, price: evaluation.price,
        source: quote.source, observedAt: quote.observed_at ?? quote.saved_at,
      });
    }

    const pushSecret = Deno.env.get("PUSH_WORKER_SECRET");
    if (notificationsToSend.length && (!pushSecret || pushSecret.length < 32)) {
      return jsonResponse({ error: { code: "PUSH_CONFIGURATION", message: "Notificações pendentes; checkpoint preservado." } }, 503, origin);
    }
    const notificationResults = await Promise.all(notificationsToSend.map(async (item) => {
      try {
        const response = await fetch(`${url}/functions/v1/push-worker`, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(115_000),
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            "x-worker-secret": pushSecret!,
          },
          body: JSON.stringify({
            user_id: item.userId, delivery_key: `radar:${item.alertKey}`,
            title: "Alerta do Radar",
            body: `${item.symbol}: condição ${item.condition} atingida. Preço observado: ${item.price}. Fonte: ${item.source}; cotação de ${new Date(item.observedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
            url: "/", tag: `radar-${item.alertKey}`,
          }),
        });
        const result = await response.json().catch(() => null) as { data?: { retryable?: boolean } } | null;
        return response.ok && result?.data?.retryable !== true;
      } catch { return false; }
    }));
    const notifications = notificationResults.filter(Boolean).length;
    const notificationFailures = notificationResults.length - notifications;
    if (notificationFailures > 0) {
      return jsonResponse({
        error: { code: "PUSH_DELIVERY_PENDING", message: "Há notificações pendentes; checkpoint preservado." },
        data: { checked: page.length, fired, duplicates, notifications, notification_failures: notificationFailures },
      }, 503, origin);
    }

    const lastAlert = page[page.length - 1];
    const complete = page.length < pageSize;
    const { data: checkpointed, error: checkpointError } = await db.rpc("radar_worker_checkpoint", {
      p_worker_key: workerKey,
      p_fencing_token: fencingToken,
      p_cursor_created_at: complete ? null : lastAlert.created_at,
      p_cursor_id: complete ? null : lastAlert.id,
      p_complete: complete,
    });
    if (checkpointError || checkpointed !== true) return internalError(origin);

    return jsonResponse({
      data: {
        checked: page.length, fired, duplicates, notifications,
        notification_failures: notificationFailures, has_more: !complete,
      },
    }, 200, origin);
  } catch { return internalError(origin); }
});
