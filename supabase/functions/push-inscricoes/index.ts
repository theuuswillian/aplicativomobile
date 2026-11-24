import { authenticateRequest } from "../_shared/auth.ts";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";
import { isPushSubscriptionId, validatePushSubscription } from "../_shared/push-validation.ts";

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);

  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (!isJsonRequest(request)) {
    return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);
  }

  const body = await readJsonObject(request, 4_096);
  if (!body || typeof body.action !== "string") {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Informe uma ação válida." } }, 400, origin);
  }

  const db = auth.context.supabase;
  const userId = auth.context.user.id;
  try {
    if (body.action === "consultar" && Object.keys(body).length === 1) {
      const { data, error } = await db.from("push_subscriptions")
        .select("id, user_agent, created_at, updated_at")
        .eq("user_id", userId).order("created_at", { ascending: false });
      if (error) return internalError(origin);
      return jsonResponse({ data: data ?? [] }, 200, origin);
    }

    if (body.action === "registrar") {
      const { action: _action, ...input } = body;
      const validated = validatePushSubscription(input);
      if (!validated.ok) {
        return jsonResponse({ error: { code: "INVALID_SUBSCRIPTION", message: "Inscrição de notificações inválida." } }, 400, origin);
      }

      const existing = await db.from("push_subscriptions").select("id")
        .eq("user_id", userId).eq("endpoint", validated.value.endpoint).maybeSingle();
      if (existing.error) return internalError(origin);

      if (existing.data) {
        const { data, error } = await db.from("push_subscriptions")
          .update({ p256dh: validated.value.p256dh, auth_key: validated.value.auth_key,
            user_agent: validated.value.user_agent })
          .eq("id", existing.data.id).eq("user_id", userId)
          .select("id, created_at, updated_at").single();
        if (error || !data) return internalError(origin);
        return jsonResponse({ data }, 200, origin);
      }

      const { data, error } = await db.from("push_subscriptions")
        .insert({ ...validated.value, user_id: userId })
        .select("id, created_at, updated_at").single();
      if (error || !data) return internalError(origin);
      return jsonResponse({ data }, 201, origin);
    }

    if (body.action === "remover") {
      if (Object.keys(body).length !== 2 || !isPushSubscriptionId(body.id)) {
        return jsonResponse({ error: { code: "INVALID_SUBSCRIPTION_ID", message: "Identificador da inscrição inválido." } }, 400, origin);
      }
      const { data, error } = await db.from("push_subscriptions").delete()
        .eq("id", body.id).eq("user_id", userId).select("id").maybeSingle();
      if (error) return internalError(origin);
      if (!data) return jsonResponse({ error: { code: "NOT_FOUND", message: "Inscrição não encontrada." } }, 404, origin);
      return jsonResponse({ data: { deleted: true } }, 200, origin);
    }

    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Ação ou campos inválidos." } }, 400, origin);
  } catch {
    return internalError(origin);
  }
});
