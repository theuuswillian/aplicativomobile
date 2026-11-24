import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";

const PAGE_SIZE = 1_000;
const MAX_ROWS_PER_TABLE = 50_000;

async function ownRows(db: ReturnType<typeof createClient>, table: string, userId: string) {
  const rows: unknown[] = [];
  for (let offset = 0; offset <= MAX_ROWS_PER_TABLE; offset += PAGE_SIZE) {
    const { data, error } = await db.from(table).select("*")
      .eq("user_id", userId).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (rows.length > MAX_ROWS_PER_TABLE) throw new RangeError("Exportação excede o limite de linhas por tabela.");
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
  throw new Error("Exportação excede o limite de linhas por tabela.");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (!isJsonRequest(request)) return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);
  const body = await readJsonObject(request, 1_024);
  if (!body || body.action !== "exportar" || Object.keys(body).length !== 1) {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Ação de exportação inválida." } }, 400, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anonKey || !token) return jsonResponse({ error: { code: "SERVER_CONFIGURATION", message: "Serviço indisponível." } }, 503, origin);

  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const userId = auth.context.user.id;
  try {
    const tableNames = [
      "accounts", "cards", "categories", "transactions", "recurrence_rules",
      "budgets", "goals", "goal_contributions", "investment_assets",
      "investment_operations", "income_events", "radar_alerts", "radar_fires",
      "import_batches", "import_items", "receipt_files",
    ];
    const [profile, settings] = await Promise.all([
      db.from("profiles").select("*").eq("id", userId).maybeSingle(),
      db.from("settings").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    if (profile.error || settings.error) return internalError(origin);
    const tables = await Promise.all(tableNames.map((table) => ownRows(db, table, userId)));
    const exportedTables: Record<string, unknown[]> = Object.fromEntries(
      tableNames.map((name, index) => [name, tables[index]]),
    );
    const totalRows = Object.values(exportedTables).reduce((total, rows) => total + rows.length, 0);
    if (totalRows > 50_000) {
      return jsonResponse({ error: { code: "EXPORT_TOO_LARGE", message: "A exportação excede o limite seguro. Solicite um arquivo por período." } }, 413, origin);
    }
    return jsonResponse({
      data: {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        user: { id: userId, email: auth.context.user.email ?? null },
        profile: profile.data,
        settings: settings.data,
        tables: exportedTables,
        excluded_sensitive_data: ["push_subscriptions", "whatsapp_link_codes", "whatsapp_inbox", "whatsapp_outbox"],
      },
    }, 200, origin);
  } catch (error) {
    if (error instanceof RangeError) return jsonResponse({ error: { code: "EXPORT_TOO_LARGE", message: "A exportação excede o limite seguro. Solicite um arquivo por período." } }, 413, origin);
    return internalError(origin);
  }
});
