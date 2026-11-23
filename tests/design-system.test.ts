import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

function block(selector: string): string {
  const match = selector === ".app-shell"
    ? css.match(/\.app-shell\s*\{([^}]+)\}/)
    : css.match(/\.app-shell\[data-theme="light"\]\s*\{([^}]+)\}/);
  if (!match) throw new Error("Bloco de tokens ausente: " + selector);
  return match[1];
}

function color(source: string, name: string): string {
  const value = source.match(new RegExp("--" + name + ":\\s*(#[0-9a-f]{6})", "i"))?.[1];
  if (!value) throw new Error("Token de cor ausente: " + name);
  return value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("design system accessibility foundations", () => {
  it("keeps text, muted text, accent and focus tokens above WCAG AA contrast", () => {
    for (const selector of [".app-shell", '.app-shell[data-theme="light"]']) {
      const theme = block(selector);
      const bg = color(theme, "color-bg");
      const surface = color(theme, "color-surface");
      for (const token of ["color-text", "color-muted", "color-accent", "color-focus"]) {
        const foreground = color(theme, token);
        expect(contrast(foreground, bg), selector + " " + token + " on background").toBeGreaterThanOrEqual(4.5);
        expect(contrast(foreground, surface), selector + " " + token + " on surface").toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("defines visible keyboard focus and reduced-motion support", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
