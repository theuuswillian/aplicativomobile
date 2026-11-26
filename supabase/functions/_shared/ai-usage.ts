import { createClient } from "npm:@supabase/supabase-js@2";

export type AiUsageKind = "phrase" | "receipt";

type Limits = {
  daily: number;
  monthly: number;
  hourly: number;
};

type ReservationResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: "configuration" | "rate_limit" | "quota" | "database" };

function readLimit(name: string, maximum: number): number | null {
  const raw = Deno.env.get(name);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum ? value : null;
}

function getLimits(kind: AiUsageKind): Limits | null {
  const prefix = kind === "receipt" ? "AI_RECEIPT" : "AI_ASSISTANT";
  const daily = readLimit(`${prefix}_DAILY_LIMIT`, 10_000);
  const monthly = readLimit(`${prefix}_MONTHLY_LIMIT`, 100_000);
  const hourly = readLimit("AI_RATE_LIMIT_PER_HOUR", 100_000);
  if (daily === null || monthly === null || hourly === null || monthly < daily) return null;
  return { daily, monthly, hourly };
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function reserveAiUsage(
  userId: string,
  kind: AiUsageKind,
): Promise<ReservationResult> {
  const limits = getLimits(kind);
  const client = serviceClient();
  if (!limits || !client) return { ok: false, reason: "configuration" };

  const { data: reservationId, error: reserveError } = await client.rpc("ai_usage_reserve", {
    p_user_id: userId,
    p_usage_kind: kind,
    p_daily_limit: limits.daily,
    p_monthly_limit: limits.monthly,
  });
  if (reserveError) return { ok: false, reason: "database" };
  if (typeof reservationId !== "string") return { ok: false, reason: "quota" };

  const hourWindow = Math.floor(Date.now() / 3_600_000);
  const { data: allowed, error: rateError } = await client.rpc("rate_limit_allow", {
    p_user_id: userId,
    p_key: `ai:${kind}:hour`,
    p_window_start: hourWindow,
    p_limit: limits.hourly,
  });

  if (rateError || allowed !== true) {
    await client.rpc("ai_usage_finalize", {
      p_reservation_id: reservationId,
      p_success: false,
    });
    return { ok: false, reason: rateError ? "database" : "rate_limit" };
  }

  return { ok: true, reservationId };
}

export async function finalizeAiUsage(
  reservationId: string,
  success: boolean,
): Promise<boolean> {
  const client = serviceClient();
  if (!client) return false;
  const { data, error } = await client.rpc("ai_usage_finalize", {
    p_reservation_id: reservationId,
    p_success: success,
  });
  return !error && data === true;
}
