export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false };

export function validateDisplayName(value: unknown): ValidationResult<string | null> {
  if (typeof value !== "string") return { ok: false };
  const normalized = value.trim();
  if (normalized.length > 80) return { ok: false };
  return { ok: true, value: normalized || null };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
