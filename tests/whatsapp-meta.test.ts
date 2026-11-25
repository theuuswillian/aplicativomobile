import { describe, expect, it } from "vitest";
import {
  extractMetaIncomingMessages, parseMetaWebhookVerification, verifyMetaWebhookSignature,
} from "../supabase/functions/_shared/whatsapp-meta";

describe("Meta WhatsApp webhook security", () => {
  it("validates GET subscription challenge only for the exact token", () => {
    const url = new URL("https://example.test/webhook?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=abc123");
    expect(parseMetaWebhookVerification(url, "secret")).toBe("abc123");
    expect(parseMetaWebhookVerification(url, "wrong")).toBeNull();
    expect(parseMetaWebhookVerification(new URL("https://example.test/?hub.mode=unsubscribe&hub.verify_token=secret&hub.challenge=x"), "secret")).toBeNull();
  });

  it("verifies the raw-body HMAC SHA-256 signature and rejects altered bodies", async () => {
    const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}');
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("app-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
    const hex = [...signature].map((value) => value.toString(16).padStart(2, "0")).join("");
    expect(await verifyMetaWebhookSignature(body, `sha256=${hex}`, "app-secret")).toBe(true);
    expect(await verifyMetaWebhookSignature(new TextEncoder().encode("{}"), `sha256=${hex}`, "app-secret")).toBe(false);
    expect(await verifyMetaWebhookSignature(body, "invalid", "app-secret")).toBe(false);
  });

  it("extracts only bounded stable message identifiers and safe text", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { messages: [
        { id: "wamid.123", from: "5511999999999", timestamp: "1760000000", type: "text", text: { body: "Olá" } },
        { id: "bad", from: "x", timestamp: "now", type: "text", text: { body: "ignore" } },
      ] } }] }],
    };
    expect(extractMetaIncomingMessages(payload)).toEqual([{
      id: "wamid.123", from: "5511999999999", timestamp: "1760000000", type: "text", text: "Olá",
    }]);
  });

  it("ignores status-only and malformed webhook envelopes", () => {
    expect(extractMetaIncomingMessages({ object: "whatsapp_business_account", entry: [] })).toEqual([]);
    expect(extractMetaIncomingMessages(null)).toEqual([]);
  });
});
