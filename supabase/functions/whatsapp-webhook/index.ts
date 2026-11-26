import { createClient } from "npm:@supabase/supabase-js@2";
import {
  extractMetaIncomingMessages, parseMetaWebhookVerification, verifyMetaWebhookSignature,
} from "../_shared/whatsapp-meta.ts";

const MAX_WEBHOOK_BYTES = 1_048_576;

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

Deno.serve(async (request: Request) => {
  if (request.method === "GET") {
    const token = Deno.env.get("WHATSAPP_META_VERIFY_TOKEN") ?? "";
    const challenge = parseMetaWebhookVerification(new URL(request.url), token);
    return challenge === null ? textResponse("Forbidden", 403) : textResponse(challenge, 200);
  }
  if (request.method !== "POST") return textResponse("Method Not Allowed", 405);
  if ((request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return textResponse("Unsupported Media Type", 415);
  }

  const appSecret = Deno.env.get("WHATSAPP_META_APP_SECRET") ?? "";
  const rawBody = await readBoundedBody(request);
  if (!rawBody) return textResponse("Payload Too Large or Invalid", 413);
  const valid = await verifyMetaWebhookSignature(
    rawBody, request.headers.get("x-hub-signature-256"), appSecret,
  );
  if (!valid) return textResponse("Unauthorized", 401);

  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)); }
  catch { return textResponse("Bad Request", 400); }
  const messages = extractMetaIncomingMessages(payload);
  if (messages.length === 0) return textResponse("EVENT_RECEIVED", 200);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return textResponse("Service Unavailable", 503);
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const rows = messages.map((message) => ({
    message_id: message.id,
    payload: { provider: "meta_whatsapp_cloud", message },
    status: "queued",
  }));
  const { error } = await admin.from("whatsapp_inbox").upsert(rows, {
    onConflict: "message_id", ignoreDuplicates: true,
  });
  if (error) return textResponse("Temporarily Unavailable", 503);
  return textResponse("EVENT_RECEIVED", 200);
});
