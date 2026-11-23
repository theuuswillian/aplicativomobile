import { authenticateRequest } from "../_shared/auth.ts";
import {
  handleOptions,
  internalError,
  isJsonRequest,
  jsonResponse,
  methodNotAllowed,
  readJsonObject,
} from "../_shared/http.ts";
import { validateDisplayName } from "../_shared/validation.ts";

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") {
    return methodNotAllowed(["POST", "OPTIONS"], origin);
  }

  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (!isJsonRequest(request)) {
    return jsonResponse(
      { error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } },
      415,
      origin,
    );
  }

  const body = await readJsonObject(request, 4_096);
  if (!body || typeof body.action !== "string") {
    return jsonResponse(
      { error: { code: "INVALID_REQUEST", message: "Informe uma ação válida." } },
      400,
      origin,
    );
  }

  try {
    if (body.action === "consultar" && Object.keys(body).length === 1) {
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

    if (body.action === "atualizar" && Object.keys(body).length === 2 &&
        Object.hasOwn(body, "display_name")) {
      const validatedName = validateDisplayName(body.display_name);
      if (!validatedName.ok) {
        return jsonResponse(
          { error: { code: "INVALID_PROFILE", message: "O nome deve ser um texto com até 80 caracteres." } },
          400,
          origin,
        );
      }

      const { data, error } = await auth.context.supabase
        .from("profiles")
        .update({ display_name: validatedName.value })
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
    }

    return jsonResponse(
      { error: { code: "INVALID_REQUEST", message: "Ação ou campos inválidos." } },
      400,
      origin,
    );
  } catch {
    return internalError(origin);
  }
});
