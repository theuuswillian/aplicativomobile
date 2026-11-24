import { describe, expect, it } from "vitest";
import { shouldRetryWhatsAppInbox } from "../supabase/functions/_shared/whatsapp-delivery";

describe("WhatsApp inbox retry policy", () => {
  it("retries only safe rejection and an active outbox reservation", () => {
    expect(shouldRetryWhatsAppInbox("failed_safe")).toBe(true);
    expect(shouldRetryWhatsAppInbox("busy")).toBe(true);
  });

  it("does not retry terminal or ambiguous provider outcomes", () => {
    expect(shouldRetryWhatsAppInbox("sent")).toBe(false);
    expect(shouldRetryWhatsAppInbox("uncertain")).toBe(false);
    expect(shouldRetryWhatsAppInbox("failed")).toBe(false);
    expect(shouldRetryWhatsAppInbox(null)).toBe(false);
    expect(shouldRetryWhatsAppInbox("unknown")).toBe(false);
  });
});
