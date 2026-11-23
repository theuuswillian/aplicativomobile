import { authenticateRequest } from "../_shared/auth.ts";
import {
  handleOptions,
  internalError,
  jsonResponse,
  methodNotAllowed,
  readJsonObject,
  isJsonRequest,
} from "../_shared/http.ts";

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "GET" && request.method !== "PATCH") {
    return methodNotAllowed(["GET", "PATCH", "OPTIONS"], origin);
  }

  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  try {
    if (request.method === "GET") {
      const [profileResult, settingsResult] = await Promise.all([
        auth.context.supabase
          .from("profiles")
          .select("id, display_name, avatar_url, locale, timezone, created_at, updated_at")
          .eq("id", auth.context.user.id)
          .maybeSingle(),
        auth.context.supabase
          .from("settings")
          .select("theme, accent, currency, whatsapp_weekly_summary, push_enabled, quiet_notifications, financial_preferences")
          .eq("user_id", auth.context.user.id)
          .maybeSingle(),
      ]);

      if (profileResult.error || settingsResult.error) return internalError(origin);
      if (!profileResult.data || !settingsResult.data) {
        return jsonResponse(
          { error: { code: "PROFILE_NOT_READY", message: "Perfil ainda não está disponível." } },
          409,
          origin,
        );
      }

      return jsonResponse(
        { data: { profile: profileResult.data, settings: settingsResult.data } },
        200,
        origin,
      );
    }

    if (!isJsonRequest(request)) {
      return jsonResponse(
        { error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } },
        415,
        origin,
      );
    }

    const body = await readJsonObject(request, 4_096);
    if (!body || Object.keys(body).length !== 1 || typeof body.display_name !== "string") {
      return jsonResponse(
        { error: { code: "INVALID_PROFILE", message: "Informe somente display_name como texto." } },
        400,
        origin,
      );
    }

    const displayName = body.display_name.trim();
    if (displayName.length > 80) {
      return jsonResponse(
        { error: { code: "INVALID_PROFILE", message: "O nome deve ter até 80 caracteres." } },
        400,
        origin,
      );
    }

    const { data, error } = await auth.context.supabase
      .from("profiles")
      .update({ display_name: displayName || null })
      .eq("id", auth.context.user.id)
      .select("id, display_name, avatar_url, locale, timezone, created_at, updated_at")
      .maybeSingle();

    if (error) return internalError(origin);
    if (!data) {
      return jsonResponse(
        { error: { code: "PROFILE_NOT_FOUND", message: "Perfil não encontrado." } },
        404,
        origin,
      );
    }

    return jsonResponse({ data: { profile: data } }, 200, origin);
  } catch {
    return internalError(origin);
  }
});
