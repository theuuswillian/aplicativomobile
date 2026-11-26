export type WhatsAppMetaDeliveryStatus = "sent" | "uncertain" | "failed" | "failed_safe" | "busy";

/**
 * Only retryable provider states should return the inbound message to the
 * worker queue. Uncertain is terminal to prevent duplicate external sends.
 */
export function shouldRetryWhatsAppInbox(status: unknown): boolean {
  return status === "failed_safe" || status === "busy";
}
