import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANK_CATALOG } from "../src/data/bank-catalog";

describe("bank identity assets", () => {
  it("uses one distinct local SVG for every institution in the selector", () => {
    const paths = BANK_CATALOG.map((bank) => bank.logoPath);
    expect(new Set(paths).size).toBe(BANK_CATALOG.length);
    for (const bank of BANK_CATALOG) {
      const path = resolve(process.cwd(), "public", bank.logoPath.slice(1));
      expect(existsSync(path), bank.name).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg, bank.name).toContain("<svg");
      expect(svg, bank.name).not.toMatch(/<script|foreignObject|onload=/i);
    }
  });

  it("keeps institution keys unique for previously saved accounts", () => {
    const keys = BANK_CATALOG.map((bank) => bank.logoKey);
    expect(new Set(keys).size).toBe(BANK_CATALOG.length);
  });
});
