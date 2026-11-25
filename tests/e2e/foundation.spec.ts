import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the public foundation without exposing authenticated navigation", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".brand")).toBeVisible();
  await expect(page.locator("#welcome-title")).toBeVisible();
  // Sem sessão, as áreas financeiras e o dock autenticado não devem aparecer.
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
  await expect(page.locator("#dashboard")).toHaveCount(0);
});

test("restores the saved appearance preference on reload", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("granaviva:theme:v1", "light"));
  await page.goto("/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#welcome-title")).toBeVisible();
  await page.reload();
  await expect(shell).toHaveAttribute("data-theme", "light");
});

test("has no horizontal overflow on the mobile welcome screen", async ({ page }) => {
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.locator(".welcome")).toBeVisible();
  await expect(page.locator(".bottom-nav")).toHaveCount(0);
});

test("passes automated WCAG 2.2 AA checks in dark and light themes", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".app-shell");
  for (const theme of ["dark", "light"] as const) {
    if (theme === "light") {
      await page.evaluate(() => localStorage.setItem("granaviva:theme:v1", "light"));
      await page.reload();
      await expect(shell).toHaveAttribute("data-theme", "light");
    }
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

test("serves the cached public app shell after going offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service Worker indisponível");
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cachedAssets = await page.evaluate(async () => {
    const workerSource = await fetch("/sw.js", { cache: "no-store" }).then((response) => response.text());
    const cacheName = workerSource.match(/const CACHE_NAME = "([^"]+)"/)?.[1];
    if (!cacheName) throw new Error("Versão do cache do Service Worker não encontrada");
    const cache = await caches.open(cacheName);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedAssets).toContain("/");
  expect(cachedAssets.some((path) => path.endsWith(".js"))).toBeTruthy();
  expect(cachedAssets.some((path) => path.endsWith(".css"))).toBeTruthy();
  expect(cachedAssets.some((path) => path.endsWith(".woff2"))).toBeTruthy();

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await context.setOffline(true);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator("#welcome-title")).toBeVisible();
  expect(pageErrors).toEqual([]);
  await context.setOffline(false);
});

test("keeps a visible keyboard focus indicator on the brand link", async ({ page }) => {
  await page.goto("/");
  const brand = page.locator(".brand");
  await brand.focus();
  await expect(brand).toBeFocused();
  await expect(brand).toHaveCSS("outline-style", "solid");
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
