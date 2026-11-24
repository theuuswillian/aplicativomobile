import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";
import { createVapidAuthorization, encryptWebPushPayload } from "../_shared/push-webpush.ts";

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
    return url.protocol === "https:" && !url.username && !url.password && !url.hash &&
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
  const { error: reserveError } = await db.from("push_deliveries").insert({
    user_id: userId, delivery_key: deliveryKey,
  });
  if (reserveError?.code === "23505") {
    return jsonResponse({ data: { duplicate: true, attempted: 0, delivered: 0, removed: 0 } }, 200, origin);
  }
  if (reserveError) return internalError(origin);

  const { data: subscriptions, error: subscriptionError } = await db.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth_key").eq("user_id", userId).limit(100);
  if (subscriptionError) {
    await db.from("push_deliveries").delete().eq("user_id", userId).eq("delivery_key", deliveryKey);
    return internalError(origin);
  }

  const payload = JSON.stringify({
    title: body.title.trim(), body: body.body,
    url: typeof body.url === "string" ? body.url : "/",
    tag: typeof body.tag === "string" ? body.tag : deliveryKey,
  });
  let delivered = 0, removed = 0, failed = 0;
  for (const subscription of subscriptions ?? []) {
    if (!isTrustedEndpoint(subscription.endpoint)) { removed++; await db.from("push_subscriptions").delete().eq("id", subscription.id).eq("user_id", userId); continue; }
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
        body: encrypted,
      });
      if (response.ok) delivered++;
      else if (response.status === 404 || response.status === 410) {
        removed++;
        await db.from("push_subscriptions").delete().eq("id", subscription.id).eq("user_id", userId);
      } else failed++;
    } catch { failed++; }
  }

  // A delivery key is reserved before sending. It is retained even on partial
  // provider failures to prevent duplicate notifications to devices already reached.
  return jsonResponse({
    data: { duplicate: false, attempted: (subscriptions ?? []).length, delivered, removed, failed },
  }, 202, origin);
});
