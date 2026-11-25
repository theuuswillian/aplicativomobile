import { describe, expect, it } from "vitest";
import { isPlainObject, validateDisplayName } from "../supabase/functions/_shared/validation";

describe("validateDisplayName", () => {
  it("normalizes surrounding whitespace", () => {
    expect(validateDisplayName("  Maria Silva  ")).toEqual({
      ok: true,
      value: "Maria Silva",
    });
  });

  it("converts an empty name to null", () => {
    expect(validateDisplayName("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts the 80-character boundary", () => {
    expect(validateDisplayName("a".repeat(80)).ok).toBe(true);
  });

  it("rejects non-strings and values above the limit", () => {
    expect(validateDisplayName(null).ok).toBe(false);
    expect(validateDisplayName("a".repeat(81)).ok).toBe(false);
  });
});

describe("isPlainObject", () => {
  it("accepts JSON objects and null-prototype records", () => {
    expect(isPlainObject({ value: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("rejects arrays, null and primitives", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("text")).toBe(false);
  });
});
