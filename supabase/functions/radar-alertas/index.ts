import { authenticateRequest } from "../_shared/auth.ts";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";
import {
  isRadarAlertId, validateRadarAlertInput, validateRadarAlertPatch,
} from "../_shared/radar-validation.ts";

const columns = "id, asset_class, symbol, provider_asset_id, condition_type, threshold, generation, is_enabled, created_at, updated_at";

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
      const { data, error } = await db.from("radar_alerts").select(columns)
        .eq("user_id", userId).order("created_at", { ascending: false });
      if (error) return internalError(origin);
      return jsonResponse({ data: data ?? [] }, 200, origin);
    }

    if (body.action === "consultar_disparos" && Object.keys(body).length === 1) {
      const { data, error } = await db.from("radar_fires")
        .select("alert_key,fired_at,observed_price,source,quote_observed_at")
        .eq("user_id", userId).order("fired_at", { ascending: false }).limit(50);
      if (error) return internalError(origin);
      return jsonResponse({ data: data ?? [] }, 200, origin);
    }

    if (body.action === "criar") {
      const input = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "action"));
      const validated = validateRadarAlertInput(input);
      if (!validated.ok) {
        return jsonResponse({ error: { code: "INVALID_ALERT", message: "Dados do alerta inválidos." } }, 400, origin);
      }
      const { data, error } = await db.from("radar_alerts")
        .insert({ ...validated.value, user_id: userId })
        .select(columns).single();
      if (error || !data) return internalError(origin);
      return jsonResponse({ data }, 201, origin);
    }

    if (body.action === "atualizar") {
      if (!isRadarAlertId(body.id)) {
        return jsonResponse({ error: { code: "INVALID_ALERT_ID", message: "Identificador do alerta inválido." } }, 400, origin);
      }
      const input = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "action" && key !== "id"));
      const current = await db.from("radar_alerts").select("condition_type, threshold")
        .eq("id", body.id).eq("user_id", userId).maybeSingle();
      if (current.error) return internalError(origin);
      if (!current.data) return jsonResponse({ error: { code: "NOT_FOUND", message: "Alerta não encontrado." } }, 404, origin);

      const condition = input.condition_type ?? current.data.condition_type;
      const effectiveThreshold = input.threshold ?? Number(current.data.threshold);
      const validated = validateRadarAlertPatch({ ...input, condition_type: condition, threshold: effectiveThreshold });
      if (!validated.ok) {
        return jsonResponse({ error: { code: "INVALID_ALERT", message: "Dados do alerta inválidos." } }, 400, origin);
      }
      const patch = { ...validated.value };
      if (!("condition_type" in input)) delete patch.condition_type;
      if (!("threshold" in input)) delete patch.threshold;
      const { data, error } = await db.from("radar_alerts").update(patch)
        .eq("id", body.id).eq("user_id", userId).select(columns).maybeSingle();
      if (error) return internalError(origin);
      if (!data) return jsonResponse({ error: { code: "NOT_FOUND", message: "Alerta não encontrado." } }, 404, origin);
      return jsonResponse({ data }, 200, origin);
    }

    if (body.action === "ativar" || body.action === "desativar") {
      if (Object.keys(body).length !== 2 || !isRadarAlertId(body.id)) {
        return jsonResponse({ error: { code: "INVALID_ALERT_ID", message: "Identificador do alerta inválido." } }, 400, origin);
      }
      const { data, error } = await db.rpc("radar_alert_set_enabled", {
        p_alert_id: body.id,
        p_enabled: body.action === "ativar",
      });
      if (error) return internalError(origin);
      if (!data?.length) return jsonResponse({ error: { code: "NOT_FOUND", message: "Alerta não encontrado." } }, 404, origin);
      return jsonResponse({ data: data[0] }, 200, origin);
    }

    if (body.action === "excluir") {
      if (Object.keys(body).length !== 2 || !isRadarAlertId(body.id)) {
        return jsonResponse({ error: { code: "INVALID_ALERT_ID", message: "Identificador do alerta inválido." } }, 400, origin);
      }
      const { data, error } = await db.from("radar_alerts").delete()
        .eq("id", body.id).eq("user_id", userId).select("id").maybeSingle();
      if (error) return internalError(origin);
      if (!data) return jsonResponse({ error: { code: "NOT_FOUND", message: "Alerta não encontrado." } }, 404, origin);
      return jsonResponse({ data: { deleted: true } }, 200, origin);
    }

    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Ação ou campos inválidos." } }, 400, origin);
  } catch {
    return internalError(origin);
  }
});
