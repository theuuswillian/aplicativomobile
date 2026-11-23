import { authenticateRequest } from "../_shared/auth.ts";
import {
  handleOptions,
  internalError,
  isJsonRequest,
  jsonResponse,
  methodNotAllowed,
  readJsonObject,
} from "../_shared/http.ts";
import { validateSettingsPatch } from "../_shared/settings-validation.ts";

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
      const { data, error } = await auth.context.supabase
        .from("settings")
        .select("theme, accent, currency, whatsapp_weekly_summary, push_enabled, quiet_notifications, financial_preferences, updated_at")
        .eq("user_id", auth.context.user.id)
        .maybeSingle();

      if (error) return internalError(origin);
      if (!data) {
        return jsonResponse(
          { error: { code: "SETTINGS_NOT_FOUND", message: "Preferências ainda não estão disponíveis." } },
          409,
          origin,
        );
      }
      return jsonResponse({ data }, 200, origin);
    }

    if (!isJsonRequest(request)) {
      return jsonResponse(
        { error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } },
        415,
        origin,
      );
    }

    const body = await readJsonObject(request, 4_096);
    const validated = validateSettingsPatch(body);
    if (!validated.ok) {
      return jsonResponse(
        { error: { code: "INVALID_SETTINGS", message: "Preferências inválidas ou campos não permitidos." } },
        400,
        origin,
      );
    }

    const { data, error } = await auth.context.supabase
      .from("settings")
      .update(validated.value)
      .eq("user_id", auth.context.user.id)
      .select("theme, accent, currency, whatsapp_weekly_summary, push_enabled, quiet_notifications, financial_preferences, updated_at")
      .maybeSingle();

    if (error) return internalError(origin);
    if (!data) {
      return jsonResponse(
        { error: { code: "SETTINGS_NOT_FOUND", message: "Preferências não encontradas." } },
        404,
        origin,
      );
    }
    return jsonResponse({ data }, 200, origin);
  } catch {
    return internalError(origin);
  }
});
