import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(values[0] % 1_000_000).padStart(6, "0");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);

  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (!isJsonRequest(request)) return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);
  const body = await readJsonObject(request, 2_048);
  if (!body || typeof body.action !== "string") {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Informe uma ação válida." } }, 400, origin);
  }

  const userId = auth.context.user.id;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    return jsonResponse({ error: { code: "SERVER_CONFIGURATION", message: "Serviço temporariamente indisponível." } }, 503, origin);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    if (body.action === "consultar" && Object.keys(body).length === 1) {
      const [{ data: link, error: linkError }, { data: settings, error: settingsError }] = await Promise.all([
        auth.context.supabase.from("whatsapp_links").select("phone,weekly_summary_enabled").eq("user_id", userId).maybeSingle(),
        auth.context.supabase.from("settings").select("whatsapp_weekly_summary").eq("user_id", userId).maybeSingle(),
      ]);
      if (linkError || settingsError) return internalError(origin);
      return jsonResponse({ data: {
        linked: Boolean(link), phone: link?.phone ?? null,
        weekly_summary_enabled: Boolean(link?.weekly_summary_enabled && settings?.whatsapp_weekly_summary),
      } }, 200, origin);
    }

    if (body.action === "gerar_codigo" && Object.keys(body).length === 1) {
      const windowStart = Math.floor(Date.now() / 3_600_000);
      const { data: allowed, error: rateError } = await admin.rpc("rate_limit_allow", {
        p_user_id: userId, p_key: "whatsapp-link-code", p_window_start: windowStart, p_limit: 3,
      });
      if (rateError) return internalError(origin);
      if (!allowed) return jsonResponse({ error: { code: "RATE_LIMIT", message: "Você já gerou vários códigos. Tente novamente mais tarde." } }, 429, origin);

      const code = generateCode();
      const codeHash = await sha256Hex(code);
      const { error: clearError } = await admin.from("whatsapp_link_codes").delete().eq("user_id", userId);
      if (clearError) return internalError(origin);
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { error: insertError } = await admin.from("whatsapp_link_codes").insert({
        code_hash: codeHash, user_id: userId, expires_at: expiresAt,
      });
      if (insertError) return internalError(origin);

      // Gerar um código não concede consentimento para resumos semanais.
      const { error: settingsError } = await auth.context.supabase.from("settings")
        .update({ whatsapp_weekly_summary: false }).eq("user_id", userId);
      if (settingsError) return internalError(origin);
      await admin.from("whatsapp_links").update({ weekly_summary_enabled: false }).eq("user_id", userId);
      return jsonResponse({ data: { code, expires_at: expiresAt, provider_ready: false } }, 201, origin);
    }

    if (body.action === "resumo" && typeof body.enabled === "boolean" && Object.keys(body).length === 2) {
      const { data: link, error: linkError } = await auth.context.supabase.from("whatsapp_links")
        .update({ weekly_summary_enabled: body.enabled }).eq("user_id", userId)
        .select("phone").maybeSingle();
      if (linkError) return internalError(origin);
      if (!link) return jsonResponse({ error: { code: "NOT_LINKED", message: "Vincule um número antes de alterar o resumo semanal." } }, 409, origin);
      const { error: settingsError } = await auth.context.supabase.from("settings")
        .update({ whatsapp_weekly_summary: body.enabled }).eq("user_id", userId);
      if (settingsError) return internalError(origin);
      return jsonResponse({ data: { weekly_summary_enabled: body.enabled } }, 200, origin);
    }

    if (body.action === "desvincular" && Object.keys(body).length === 1) {
      const { error: linkError } = await admin.from("whatsapp_links").delete().eq("user_id", userId);
      if (linkError) return internalError(origin);
      const { error: codeError } = await admin.from("whatsapp_link_codes").delete().eq("user_id", userId);
      if (codeError) return internalError(origin);
      const { error: pendingError } = await admin.from("whatsapp_pending_transactions")
        .update({ status: "cancelled" }).eq("user_id", userId).eq("status", "pending");
      if (pendingError) return internalError(origin);
      const { error: settingsError } = await auth.context.supabase.from("settings")
        .update({ whatsapp_weekly_summary: false }).eq("user_id", userId);
      if (settingsError) return internalError(origin);
      return jsonResponse({ data: { unlinked: true } }, 200, origin);
    }

    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Ação ou campos inválidos." } }, 400, origin);
  } catch {
    return internalError(origin);
  }
});
