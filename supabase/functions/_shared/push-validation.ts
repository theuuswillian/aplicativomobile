export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
  user_agent: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function decodedKeyLength(value: string): number {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    return atob(base64 + "=".repeat((4 - base64.length % 4) % 4)).length;
  } catch { return -1; }
}

export function validatePushSubscription(value: unknown):
  | { ok: true; value: PushSubscriptionInput }
  | { ok: false } {
  if (!isRecord(value)) return { ok: false };
  const allowed = ["endpoint", "p256dh", "auth_key", "user_agent"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return { ok: false };

  if (typeof value.endpoint !== "string" || value.endpoint.length > 2048) return { ok: false };
  let endpoint: URL;
  try { endpoint = new URL(value.endpoint); } catch { return { ok: false }; }
  const trustedPushHost = endpoint.hostname === "fcm.googleapis.com" ||
    endpoint.hostname === "updates.push.services.mozilla.com" ||
    endpoint.hostname === "web.push.apple.com" ||
    endpoint.hostname.endsWith(".notify.windows.com");
  if (endpoint.protocol !== "https:" || !trustedPushHost || endpoint.username || endpoint.password ||
      endpoint.hash || endpoint.toString() !== value.endpoint) return { ok: false };

  if (typeof value.p256dh !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(value.p256dh) ||
      decodedKeyLength(value.p256dh) !== 65 ||
      typeof value.auth_key !== "string" || !/^[A-Za-z0-9_-]{20,32}$/.test(value.auth_key) ||
      decodedKeyLength(value.auth_key) !== 16) {
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
