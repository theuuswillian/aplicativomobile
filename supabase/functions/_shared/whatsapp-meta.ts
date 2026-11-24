const encoder = new TextEncoder();

function decodeHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index++) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyMetaWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret || appSecret.length < 1) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signatureHeader);
  if (!match) return false;
  const supplied = decodeHex(match[1]);
  if (!supplied) return false;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const bodyBuffer = new Uint8Array(rawBody).buffer as ArrayBuffer;
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, bodyBuffer));
  return constantTimeEqual(expected, supplied);
}

export type MetaIncomingMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: string;
};

export function extractMetaIncomingMessages(payload: unknown): MetaIncomingMessage[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const root = payload as Record<string, unknown>;
  if (root.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];
  const messages: MetaIncomingMessage[] = [];
  for (const entry of root.entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const changes = (entry as Record<string, unknown>).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object" || Array.isArray(change)) continue;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const valueRecord = value as Record<string, unknown>;
      if (!Array.isArray(valueRecord.messages)) continue;
      for (const item of valueRecord.messages) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const message = item as Record<string, unknown>;
        if (typeof message.id !== "string" || message.id.length < 1 || message.id.length > 200 ||
            typeof message.from !== "string" || !/^\d{8,15}$/.test(message.from) ||
            typeof message.timestamp !== "string" || !/^\d{9,12}$/.test(message.timestamp) ||
            typeof message.type !== "string" || message.type.length > 40) continue;
        const text = message.type === "text" && message.text && typeof message.text === "object"
          ? (message.text as Record<string, unknown>).body : undefined;
        messages.push({
          id: message.id, from: message.from, timestamp: message.timestamp, type: message.type,
          ...(typeof text === "string" ? { text: text.slice(0, 4096) } : {}),
        });
      }
    }
  }
  return messages;
}

export function parseMetaWebhookVerification(url: URL, expectedToken: string): string | null {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (!expectedToken || mode !== "subscribe" || token !== expectedToken ||
      !challenge || challenge.length > 256 || !/^[\x20-\x7E]+$/.test(challenge)) return null;
  return challenge;
}
