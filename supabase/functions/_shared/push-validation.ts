export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
  user_agent: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validatePushSubscription(value: unknown):
  | { ok: true; value: PushSubscriptionInput }
  | { ok: false } {
  if (!isRecord(value)) return { ok: false };
  const allowed = ["endpoint", "p256dh", "auth_key", "user_agent"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return { ok: false };

  if (typeof value.endpoint !== "string" || value.endpoint.length > 2048) return { ok: false };
  let endpoint: URL;
  try { endpoint = new URL(value.endpoint); } catch { return { ok: false }; }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
      endpoint.hash || endpoint.toString() !== value.endpoint) return { ok: false };

  if (typeof value.p256dh !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(value.p256dh) ||
      typeof value.auth_key !== "string" || !/^[A-Za-z0-9_-]{20,32}$/.test(value.auth_key)) {
    return { ok: false };
  }
  const userAgent = value.user_agent === undefined ? null : value.user_agent;
  if (userAgent !== null && (typeof userAgent !== "string" || userAgent.length > 256)) {
    return { ok: false };
  }
  return { ok: true, value: {
    endpoint: value.endpoint,
    p256dh: value.p256dh,
    auth_key: value.auth_key,
    user_agent: userAgent,
  } };
}

export function isPushSubscriptionId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
