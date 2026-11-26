import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";
import { createVapidAuthorization, encryptWebPushPayload, toArrayBuffer } from "../_shared/push-webpush.ts";

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function isTrustedEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash &&
      (url.hostname === "fcm.googleapis.com" ||
       url.hostname === "updates.push.services.mozilla.com" ||
       url.hostname === "web.push.apple.com" ||
       url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);
  if (!isJsonRequest(request)) return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);

  const expectedSecret = Deno.env.get("PUSH_WORKER_SECRET");
  const suppliedSecret = request.headers.get("x-worker-secret") ?? "";
  if (!expectedSecret || expectedSecret.length < 32 || !safeEqual(expectedSecret, suppliedSecret)) {
    return jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Autenticação necessária." } }, 401, origin);
  }

  const body = await readJsonObject(request, 4_096);
  if (!body || !isUuid(body.user_id) ||
      typeof body.delivery_key !== "string" || body.delivery_key.length < 1 || body.delivery_key.length > 200 ||
      typeof body.title !== "string" || body.title.trim().length < 1 || body.title.length > 80 ||
      typeof body.body !== "string" || body.body.length > 240 ||
      (body.url !== undefined && (typeof body.url !== "string" || !body.url.startsWith("/") || body.url.startsWith("//"))) ||
      (body.tag !== undefined && (typeof body.tag !== "string" || body.tag.length > 120))) {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Dados da notificação inválidos." } }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("PUSH_VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("PUSH_VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("PUSH_VAPID_SUBJECT");
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return jsonResponse({ error: { code: "SERVER_CONFIGURATION", message: "Serviço temporariamente indisponível." } }, 503, origin);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const userId = body.user_id;
  const deliveryKey = body.delivery_key;
  const { data: settings, error: settingsError } = await db.from("settings")
    .select("push_enabled").eq("user_id", userId).maybeSingle();
  if (settingsError) return internalError(origin);
  if (!settings?.push_enabled) {
    return jsonResponse({ data: { suppressed: true, reason: "push_disabled", retryable: false } }, 200, origin);
  }

  // A linha agregada permanece como registro da notificação; o controle de
  // retry é individual por assinatura, para não repetir dispositivos já atendidos.
  const { error: deliveryError } = await db.from("push_deliveries").insert({
    user_id: userId, delivery_key: deliveryKey,
  });
  if (deliveryError && deliveryError.code !== "23505") return internalError(origin);

  const { data: subscriptions, error: subscriptionError } = await db.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_key").eq("user_id", userId).limit(100);
  if (subscriptionError) return internalError(origin);

  const payload = JSON.stringify({
    title: body.title.trim(), body: body.body,
    url: typeof body.url === "string" ? body.url : "/",
    tag: typeof body.tag === "string" ? body.tag : deliveryKey,
  });
  let attempted = 0, delivered = 0, removed = 0, failedSafe = 0, uncertain = 0, busy = 0;

  const processSubscription = async (subscription: {
    id: string; endpoint: string; p256dh: string; auth_key: string;
  }) => {
    const { data: reservations, error: reserveError } = await db.rpc("push_delivery_reserve", {
      p_user_id: userId, p_delivery_key: deliveryKey,
      p_subscription_id: subscription.id, p_lease_seconds: 60,
    });
    if (reserveError) return { error: true, attempted: 0, delivered: 0, removed: 0, failedSafe: 0, uncertain: 0, busy: 0 };
    const reservation = Array.isArray(reservations) ? reservations[0] : null;
    if (!reservation) return { error: true, attempted: 0, delivered: 0, removed: 0, failedSafe: 0, uncertain: 0, busy: 0 };
    if (reservation.reservation_status === "sent") return { error: false, attempted: 0, delivered: 1, removed: 0, failedSafe: 0, uncertain: 0, busy: 0 };
    if (reservation.reservation_status === "removed") return { error: false, attempted: 0, delivered: 0, removed: 1, failedSafe: 0, uncertain: 0, busy: 0 };
    if (reservation.reservation_status === "uncertain") return { error: false, attempted: 0, delivered: 0, removed: 0, failedSafe: 0, uncertain: 1, busy: 0 };
    if (reservation.reservation_status === "busy") return { error: false, attempted: 0, delivered: 0, removed: 0, failedSafe: 0, uncertain: 0, busy: 1 };
    if (reservation.reservation_status !== "reserved" || typeof reservation.fencing_token !== "string") {
      return { error: true, attempted: 0, delivered: 0, removed: 0, failedSafe: 0, uncertain: 0, busy: 0 };
    }

    let finalStatus: "sent" | "failed_safe" | "uncertain" | "removed";
    let errorMessage: string | null = null;
    if (!isTrustedEndpoint(subscription.endpoint)) {
      finalStatus = "removed";
      errorMessage = "Endpoint push não permitido";
    } else {
      try {
        const authorization = await createVapidAuthorization(
          subscription.endpoint, vapidPublicKey, vapidPrivateKey, vapidSubject,
        );
        const encrypted = await encryptWebPushPayload(payload, subscription.p256dh, subscription.auth_key);
        const response = await fetch(subscription.endpoint, {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: authorization,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: "3600",
            Urgency: "normal",
          },
          body: toArrayBuffer(encrypted),
        });
        if (response.ok) finalStatus = "sent";
        else if (response.status === 404 || response.status === 410) finalStatus = "removed";
        else if (response.status === 429) {
          finalStatus = "failed_safe";
          errorMessage = "Provedor push limitou temporariamente a entrega (HTTP 429)";
        } else {
          finalStatus = "uncertain";
          errorMessage = `Provedor push respondeu HTTP ${response.status}; não repetir automaticamente.`;
        }
        if (finalStatus === "removed") {
          await db.from("push_subscriptions").delete().eq("id", subscription.id).eq("user_id", userId);
        }
      } catch {
        finalStatus = "uncertain";
        errorMessage = "Falha de rede/timeout; estado de entrega não confirmado.";
      }
    }

    const { data: finalized, error: finalizeError } = await db.rpc("push_delivery_finalize", {
      p_user_id: userId, p_delivery_key: deliveryKey, p_subscription_id: subscription.id,
      p_fencing_token: reservation.fencing_token, p_status: finalStatus, p_error: errorMessage,
    });
    if (finalizeError || finalized !== true) {
      return { error: true, attempted: 1, delivered: 0, removed: 0, failedSafe: 0, uncertain: 0, busy: 0 };
    }
    return {
      error: false, attempted: 1,
      delivered: finalStatus === "sent" ? 1 : 0,
      removed: finalStatus === "removed" ? 1 : 0,
      failedSafe: finalStatus === "failed_safe" ? 1 : 0,
      uncertain: finalStatus === "uncertain" ? 1 : 0,
      busy: 0,
    };
  };

  const subscriptionList = subscriptions ?? [];
  for (let offset = 0; offset < subscriptionList.length; offset += 10) {
    const batch = await Promise.all(subscriptionList.slice(offset, offset + 10).map(processSubscription));
    if (batch.some((item) => item.error)) return internalError(origin);
    for (const item of batch) {
      attempted += item.attempted;
      delivered += item.delivered;
      removed += item.removed;
      failedSafe += item.failedSafe;
      uncertain += item.uncertain;
      busy += item.busy;
    }
  }

  return jsonResponse({
    data: {
      duplicate: attempted === 0 && delivered > 0,
      attempted, delivered, removed, failed_safe: failedSafe, uncertain, busy,
      retryable: failedSafe > 0 || busy > 0,
    },
  }, 202, origin);
});
