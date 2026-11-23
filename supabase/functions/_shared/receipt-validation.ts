export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export type ReceiptMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"
  | "text/csv";

export type ReceiptValidation =
  | { ok: true; bytes: Uint8Array; mime: ReceiptMime }
  | { ok: false; reason: "invalid_base64" | "too_large" | "mime_mismatch" | "invalid_text" };

const supportedMimes = new Set<ReceiptMime>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/csv",
]);

function hasSignature(bytes: Uint8Array, mime: ReceiptMime): boolean {
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/png") {
    return bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        .every((byte, index) => bytes[index] === byte);
  }
  if (mime === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  if (mime === "application/pdf") {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  }
  return true;
}

export function validateReceiptBase64(
  encoded: unknown,
  mimeInput: unknown,
): ReceiptValidation {
  if (typeof encoded !== "string") {
    return { ok: false, reason: "invalid_base64" };
  }
  if (encoded.length > Math.ceil(MAX_RECEIPT_BYTES / 3) * 4) {
    return { ok: false, reason: "too_large" };
  }
  if (typeof mimeInput !== "string" ||
      !supportedMimes.has(mimeInput as ReceiptMime) ||
      encoded.length === 0 || encoded.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    return { ok: false, reason: "invalid_base64" };
  }

  const estimatedBytes = Math.floor(encoded.length * 3 / 4) -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (estimatedBytes > MAX_RECEIPT_BYTES) return { ok: false, reason: "too_large" };

  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    return { ok: false, reason: "invalid_base64" };
  }
  if (binary.length > MAX_RECEIPT_BYTES) return { ok: false, reason: "too_large" };

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const mime = mimeInput as ReceiptMime;
  if (!hasSignature(bytes, mime)) return { ok: false, reason: "mime_mismatch" };

  if (mime === "text/csv") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\u0000") || text.trim().length === 0) {
        return { ok: false, reason: "invalid_text" };
      }
    } catch {
      return { ok: false, reason: "invalid_text" };
    }
  }

  return { ok: true, bytes, mime };
}
