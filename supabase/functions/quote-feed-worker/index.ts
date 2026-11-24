import { createClient } from "npm:@supabase/supabase-js@2";
import {
  handleOptions, internalError, isAllowedOrigin, isJsonRequest, jsonResponse,
  methodNotAllowed, originNotAllowedResponse, readJsonObject,
} from "../_shared/http.ts";
import { parseBrapiQuote } from "../_shared/brapi-quotes.ts";

const SUPPORTED_CLASSES = new Set(["stock", "fii", "etf", "bdr"]);
const CACHE_TTL_MS = 30 * 60_000;
const MAX_QUOTES_PER_RUN = 4;
const MONTHLY_SAFE_LIMIT = 12_000;

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return originNotAllowedResponse(origin);
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"], origin);
  if (!isJsonRequest(request)) return jsonResponse({ error: { code: "INVALID_CONTENT_TYPE", message: "Envie conteúdo JSON." } }, 415, origin);

  const expectedSecret = Deno.env.get("QUOTE_WORKER_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-quote-worker-secret") ?? "";
  if (expectedSecret.length < 32 || !safeEqual(expectedSecret, suppliedSecret)) {
    return jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Autenticação necessária." } }, 401, origin);
  }
  const body = await readJsonObject(request, 2_048);
  if (!body || Object.keys(body).length !== 0) {
    return jsonResponse({ error: { code: "INVALID_REQUEST", message: "Corpo inválido." } }, 400, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("BRAPI_API_KEY");
  const displayApproved = Deno.env.get("BRAPI_PUBLIC_DISPLAY_APPROVED") === "true";
  if (!url || !serviceKey || !apiKey || !displayApproved) {
    return jsonResponse({ error: { code: "PROVIDER_NOT_CONFIGURED", message: "Fonte de cotações ainda não habilitada." } }, 503, origin);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const [alertsResult, assetsResult] = await Promise.all([
      db.from("radar_alerts").select("symbol,asset_class").eq("is_enabled", true).limit(2000),
      db.from("investment_assets").select("symbol,asset_class").in("asset_class", ["stock", "fii", "etf", "bdr"]).limit(2000),
    ]);
    if (alertsResult.error || assetsResult.error) return internalError(origin);

    const classesBySymbol = new Map<string, string>();
    for (const item of [...(alertsResult.data ?? []), ...(assetsResult.data ?? [])]) {
      const symbol = String(item.symbol ?? "").toUpperCase();
      const assetClass = String(item.asset_class ?? "");
      if (/^[A-Z0-9.]{1,32}$/.test(symbol) && SUPPORTED_CLASSES.has(assetClass)) {
        if (!classesBySymbol.has(symbol)) classesBySymbol.set(symbol, assetClass);
      }
    }
    const symbols = [...classesBySymbol.keys()].sort();
    if (!symbols.length) {
      return jsonResponse({ data: { discovered: 0, fetched: 0, failed: 0, skipped: 0, unsupported: ["crypto"] } }, 200, origin);
    }

    const cacheRows: Array<{ symbol: string; saved_at: string }> = [];
    for (let offset = 0; offset < symbols.length; offset += 500) {
      const batch = symbols.slice(offset, offset + 500);
      const result = await db.from("quote_cache").select("symbol,saved_at").in("symbol", batch);
      if (result.error) return internalError(origin);
      cacheRows.push(...(result.data ?? []));
    }
    const cacheTime = new Map(cacheRows.map((row) => [row.symbol, Date.parse(row.saved_at)]));
    const periodStart = new Date().toISOString().slice(0, 7) + "-01";
    const { data: usage, error: usageError } = await db.from("market_data_usage")
      .select("last_symbol").eq("provider", "brapi").eq("period_start", periodStart).maybeSingle();
    if (usageError) return internalError(origin);
    const lastSymbol = typeof usage?.last_symbol === "string" ? usage.last_symbol : null;
    const startIndex = lastSymbol ? symbols.findIndex((symbol) => symbol > lastSymbol) : 0;
    const rotated = startIndex > 0
      ? [...symbols.slice(startIndex), ...symbols.slice(0, startIndex)]
      : symbols;
    const now = Date.now();
    const dueAll = rotated.filter((symbol) => {
      const savedAt = cacheTime.get(symbol);
      return savedAt === undefined || !Number.isFinite(savedAt) || now - savedAt >= CACHE_TTL_MS;
    });
    const due = dueAll.slice(0, MAX_QUOTES_PER_RUN);

    let fetched = 0, failed = 0, quotaExhausted = false;
    for (const symbol of due) {
      const { data: reserved, error: reserveError } = await db.rpc("market_data_reserve", {
        p_provider: "brapi", p_symbol: symbol, p_limit: MONTHLY_SAFE_LIMIT,
      });
      if (reserveError) return internalError(origin);
      if (reserved !== true) { quotaExhausted = true; break; }

      try {
        const response = await fetch("https://brapi.dev/api/quote/" + encodeURIComponent(symbol), {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" },
        });
        if (!response.ok) { failed++; continue; }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) { failed++; continue; }
        const raw = await response.text();
        if (raw.length > 64 * 1024) { failed++; continue; }
        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { failed++; continue; }
        const quote = parseBrapiQuote(payload, symbol);
        if (!quote) { failed++; continue; }

        const savedAt = new Date().toISOString();
        const assetClass = classesBySymbol.get(symbol)!;
        const normalized = {
          ...quote,
          asset_class: assetClass,
          source: "brapi.dev",
          source_delay_minutes: 30,
          requested_at: savedAt,
          attribution: "Dados de mercado: brapi.dev",
        };
        const { error: cacheError } = await db.from("quote_cache").upsert({
          symbol, payload: normalized, saved_at: savedAt,
        }, { onConflict: "symbol" });
        if (cacheError) { failed++; continue; }

        const { error: assetError } = await db.from("investment_assets")
          .update({ current_price: quote.price, price_as_of: quote.observed_at })
          .eq("symbol", symbol).eq("asset_class", assetClass).eq("currency", "BRL");
        if (assetError) { failed++; continue; }
        fetched++;
      } catch {
        failed++;
      }
    }

    const remainingDue = Math.max(0, dueAll.length - due.length);
    return jsonResponse({
      data: {
        provider: "brapi.dev",
        discovered: symbols.length,
        fetched,
        failed,
        attempted: due.length,
        deferred: remainingDue,
        cached: symbols.length - dueAll.length,
        quota_exhausted: quotaExhausted,
        unsupported: ["crypto", "fixed_income"],
        max_age_minutes: 45,
        attribution: "Dados de mercado: brapi.dev",
      },
    }, 200, origin);
  } catch {
    return internalError(origin);
  }
});
