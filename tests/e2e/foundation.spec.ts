import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the foundation and switches between dark and light themes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /sua vida financeira/i })).toBeVisible();

  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Tema claro" }).click();
  await expect(shell).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Tema escuro" })).toBeVisible();
});

test("has no horizontal overflow at the target viewport", async ({ page }) => {
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole("button", { name: /tema/i })).toBeVisible();
});

test("passes automated WCAG 2.2 AA checks in both themes", async ({ page }) => {
  await page.goto("/");
  for (const theme of ["dark", "light"] as const) {
    if (theme === "light") await page.getByRole("button", { name: "Tema claro" }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target),
      })),
      `Acessibilidade no tema ${theme}`,
    ).toEqual([]);
  }
});

test("serves the cached app shell after going offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service Worker indisponível");
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cachedAssets = await page.evaluate(async () => {
    const cache = await caches.open("granaviva-shell-v3");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedAssets).toContain("/");
  expect(cachedAssets.some((path) => path.endsWith(".js"))).toBeTruthy();
  expect(cachedAssets.some((path) => path.endsWith(".css"))).toBeTruthy();
  expect(cachedAssets.some((path) => path.endsWith(".woff2"))).toBeTruthy();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: /sua vida financeira/i })).toBeVisible();
  await context.setOffline(false);
});

test("supports keyboard navigation with a visible focus indicator", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".brand")).toBeFocused();
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: "Tema claro" });
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
});

test("publishes PWA metadata and an iOS home-screen icon", async ({ page }) => {
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.lang).toBe("pt-BR");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((icon: { src: string }) => icon.src === "/icon.svg")).toBeTruthy();

  const appleIcon = await page.request.get("/apple-touch-icon.png");
  expect(appleIcon.status()).toBe(200);
  expect(appleIcon.headers()["content-type"]).toContain("image/png");
});
