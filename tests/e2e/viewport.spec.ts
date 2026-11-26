import { expect, test } from "@playwright/test";

test("declares a device-width viewport at the default one-to-one scale", async ({ page }) => {
  await page.goto("/");
  const viewport = page.locator('meta[name="viewport"]');
  await expect(viewport).toHaveAttribute("content", /width=device-width/);
  await expect(viewport).toHaveAttribute("content", /initial-scale=1(?:\.0)?/);
  const settings = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(settings).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/i);
  await expect(page.locator(".app-shell")).toBeVisible();
});

test("fits common phone, tablet and desktop widths without horizontal page overflow", async ({ page }) => {
  await page.goto("/");
  for (const width of [320, 360, 375, 390, 402, 430, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const frame = document.querySelector<HTMLElement>(".app-frame");
      const shellRect = shell?.getBoundingClientRect();
      const frameRect = frame?.getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        shellWidth: shellRect?.width ?? 0,
        frameRight: frameRect?.right ?? 0,
      };
    });
    expect(dimensions.viewport, `viewport de ${width}px`).toBe(width);
    expect(dimensions.document, `overflow horizontal em ${width}px`).toBeLessThanOrEqual(width);
    expect(dimensions.shellWidth, `largura do app em ${width}px`).toBeLessThanOrEqual(width);
    expect(dimensions.frameRight, `limite do conteúdo em ${width}px`).toBeLessThanOrEqual(width + 1);
  }
});

test("keeps the browser visual viewport at its natural scale on initial load", async ({ page }) => {
  await page.goto("/");
  const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  expect(scale).toBe(1);
});
