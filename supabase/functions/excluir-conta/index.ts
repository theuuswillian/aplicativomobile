import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";

const PAGE_SIZE = 500;
const MAX_RECEIPTS = 10_000;

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (!isJsonRequest(request)) return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);

  const body = await readJsonObject(request, 1_024);
  if (!body || body.confirmation !== "EXCLUIR_CONTA" || Object.keys(body).length !== 1) {
    return jsonResponse({ error: { code: "CONFIRMATION_REQUIRED", message: "Confirme a exclusão digitando EXCLUIR_CONTA." } }, 400, origin);
  }

  const lastSignIn = auth.context.user.last_sign_in_at ? Date.parse(auth.context.user.last_sign_in_at) : NaN;
  if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > 15 * 60_000 || lastSignIn > Date.now() + 2 * 60_000) {
    return jsonResponse({ error: { code: "RECENT_AUTH_REQUIRED", message: "Entre novamente na conta antes de excluí-la." } }, 403, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return jsonResponse({ error: { code: "SERVER_CONFIGURATION", message: "Serviço indisponível." } }, 503, origin);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const userId = auth.context.user.id;
  try {
    const storageDb = admin.schema("storage").from("objects");
    const paths: string[] = [];
    for (let offset = 0; offset < MAX_RECEIPTS; offset += PAGE_SIZE) {
      const { data, error } = await storageDb.select("name").eq("bucket_id", "receipt-files")
        .like("name", `${userId}/%`).range(offset, offset + PAGE_SIZE - 1);
      if (error) return internalError(origin);
      paths.push(...(data ?? []).map((item: { name: string }) => item.name));
      if (paths.length > MAX_RECEIPTS) {
        return jsonResponse({ error: { code: "TOO_MANY_RECEIPTS", message: "Há muitos comprovantes para excluir com segurança nesta operação." } }, 413, origin);
      }
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }

    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await admin.storage.from("receipt-files").remove(paths.slice(offset, offset + 100));
      if (error) return internalError(origin);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) return internalError(origin);
    return jsonResponse({ data: { deleted: true, removed_receipts: paths.length } }, 200, origin);
  } catch { return internalError(origin); }
});
