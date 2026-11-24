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

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);
  if (!isJsonRequest(request)) return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);

  const secret = Deno.env.get("WHATSAPP_WORKER_SECRET") ?? "";
  if (secret.length < 32 || !safeEqual(secret, request.headers.get("x-whatsapp-worker-secret") ?? "")) {
    return jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Autenticação necessária." } }, 401, origin);
  }
  const body = await readJsonObject(request, 8_192);
  if (!body || Object.keys(body).some((key) => !["idempotency_key", "phone", "text"].includes(key)) ||
      typeof body.idempotency_key !== "string" || body.idempotency_key.length < 1 || body.idempotency_key.length > 200 ||
      typeof body.phone !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(body.phone) ||
      typeof body.text !== "string" || body.text.trim().length < 1 || body.text.length > 4096) {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Dados da mensagem inválidos." } }, 400, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accessToken = Deno.env.get("WHATSAPP_META_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_META_PHONE_NUMBER_ID");
  const graphVersion = Deno.env.get("WHATSAPP_META_GRAPH_VERSION");
  if (!url || !serviceKey || !accessToken || !phoneNumberId || !/^v\d+\.\d+$/.test(graphVersion ?? "")) {
    return jsonResponse({ error: { code: "SERVER_CONFIGURATION", message: "Serviço temporariamente indisponível." } }, 503, origin);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: body.phone.slice(1),
    type: "text",
    text: { preview_url: false, body: body.text.trim() },
  };

  try {
    const { data: reservations, error: reserveError } = await db.rpc("whatsapp_outbox_reserve", {
      p_idempotency_key: body.idempotency_key,
      p_phone: body.phone,
      p_payload: payload,
      p_lease_seconds: 90,
    });
    if (reserveError) return internalError(origin);
    const reservation = Array.isArray(reservations) ? reservations[0] : null;
    if (!reservation) return internalError(origin);
    if (reservation.reservation_status !== "reserved" || typeof reservation.fencing_token !== "string") {
      return jsonResponse({ data: { status: reservation.reservation_status, attempts: reservation.attempt_number } }, 200, origin);
    }

    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      await db.rpc("whatsapp_outbox_finalize", {
        p_idempotency_key: body.idempotency_key, p_fencing_token: reservation.fencing_token,
        p_status: "uncertain", p_error: "Falha de rede ou timeout; envio não será repetido automaticamente.",
      });
      return jsonResponse({ data: { status: "uncertain" } }, 202, origin);
    }

    let responseBody: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) responseBody = parsed as Record<string, unknown>;
    } catch { /* provider response may be empty */ }

    const messages = Array.isArray(responseBody.messages) ? responseBody.messages : [];
    const firstMessage = messages[0] && typeof messages[0] === "object" ? messages[0] as Record<string, unknown> : null;
    const providerMessageId = typeof firstMessage?.id === "string" ? firstMessage.id : null;
    let status: "sent" | "failed_safe" | "failed" | "uncertain";
    if (response.ok && providerMessageId) status = "sent";
    else if (response.status === 429) status = "failed_safe";
    else if (response.status >= 500 || response.ok) status = "uncertain";
    else status = "failed";

    const { data: finalized, error: finalizeError } = await db.rpc("whatsapp_outbox_finalize", {
      p_idempotency_key: body.idempotency_key,
      p_fencing_token: reservation.fencing_token,
      p_status: status,
      p_provider_message_id: providerMessageId,
      p_error: status === "sent" ? null : `Meta Cloud API HTTP ${response.status}`,
    });
    if (finalizeError || finalized !== true) return internalError(origin);
    return jsonResponse({ data: { status, provider_message_id: providerMessageId } }, status === "sent" ? 200 : 202, origin);
  } catch { return internalError(origin); }
});
