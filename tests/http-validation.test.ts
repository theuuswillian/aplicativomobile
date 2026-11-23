import { describe, expect, it } from "vitest";
import { readJsonObject } from "../supabase/functions/_shared/http";

describe("readJsonObject", () => {
  it("parses a bounded JSON object", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ display_name: "Ana" }),
    });
    await expect(readJsonObject(request)).resolves.toEqual({ display_name: "Ana" });
  });

  it("rejects arrays, primitives and malformed JSON", async () => {
    for (const body of ["[]", "true", "{invalid"]) {
      const request = new Request("https://example.test", { method: "POST", body });
      await expect(readJsonObject(request)).resolves.toBeNull();
    }
  });

  it("rejects oversized bodies even without content-length", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: "x".repeat(100),
    });
    await expect(readJsonObject(request, 16)).resolves.toBeNull();
  });

  it("rejects invalid UTF-8", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: new Uint8Array([0xc3, 0x28]),
    });
    await expect(readJsonObject(request)).resolves.toBeNull();
  });
});
