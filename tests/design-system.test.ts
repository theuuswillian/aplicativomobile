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
  it("keeps text, secondary text, accent, focus and semantic tokens above WCAG AA contrast", () => {
    for (const selector of [".app-shell", '.app-shell[data-theme="light"]']) {
      const theme = block(selector);
      const backgrounds = ["bg-app", "bg-surface", "bg-elevated", "bg-sidebar"].map((name) => [name, color(theme, name)] as const);
      for (const token of ["text-primary", "text-secondary", "accent-primary", "focus-ring", "positive", "negative", "negative-on-soft", "warning", "accent-secondary-text"]) {
        const foreground = color(theme, token);
        for (const [name, background] of backgrounds) {
          expect(contrast(foreground, background), selector + " " + token + " on " + name).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(color(theme, "text-on-accent"), color(theme, "accent-primary")), selector + " text on primary button").toBeGreaterThanOrEqual(4.5);
      expect(contrast(color(theme, "text-on-accent"), color(theme, "accent-primary-hover")), selector + " text on hovered primary button").toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses the approved fintech dark palette", () => {
    const dark = block(".app-shell");
    expect(color(dark, "bg-app").toLowerCase()).toBe("#09090b");
    expect(color(dark, "bg-surface").toLowerCase()).toBe("#121216");
    expect(color(dark, "bg-elevated").toLowerCase()).toBe("#1a1a22");
    expect(color(dark, "border-subtle").toLowerCase()).toBe("#27272f");
    expect(color(dark, "accent-primary").toLowerCase()).toBe("#10b981");
    expect(color(dark, "accent-secondary").toLowerCase()).toBe("#6366f1");
    expect(color(dark, "text-primary").toLowerCase()).toBe("#f4f4f5");
  });

  it("defines visible keyboard focus and reduced-motion support", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
