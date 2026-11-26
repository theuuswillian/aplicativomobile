import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_BYTES, validateReceiptBase64 } from "../supabase/functions/_shared/receipt-validation";

const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

describe("validateReceiptBase64", () => {
  it("accepts a PDF with a matching signature", () => {
    const result = validateReceiptBase64(base64([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), "application/pdf");
    expect(result.ok).toBe(true);
  });

  it("accepts PNG and JPEG signatures", () => {
    expect(validateReceiptBase64(
      base64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    ).ok).toBe(true);
    expect(validateReceiptBase64(
      base64([0xff, 0xd8, 0xff, 0x00]),
      "image/jpeg",
    ).ok).toBe(true);
  });

  it("rejects a declared MIME that does not match the bytes", () => {
    const result = validateReceiptBase64(base64([0x25, 0x50, 0x44, 0x46, 0x2d]), "image/png");
    expect(result).toEqual({ ok: false, reason: "mime_mismatch" });
  });

  it("rejects unsupported MIME and malformed base64", () => {
    expect(validateReceiptBase64("!!!!", "application/pdf").ok).toBe(false);
    expect(validateReceiptBase64("YWJj", "application/octet-stream").ok).toBe(false);
  });

  it("rejects payloads above 5 MB before decoding", () => {
    const oversized = "A".repeat(Math.ceil((MAX_RECEIPT_BYTES + 1) / 3) * 4);
    expect(validateReceiptBase64(oversized, "application/pdf")).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("accepts UTF-8 CSV and rejects binary content declared as CSV", () => {
    expect(validateReceiptBase64(btoa("data,valor\nmercado,12.50"), "text/csv").ok).toBe(true);
    expect(validateReceiptBase64(base64([0xff, 0xfe, 0x00]), "text/csv")).toEqual({
      ok: false,
      reason: "invalid_text",
    });
  });
});
