import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function openAppearance(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^Conta$/ }).click();
  await page.getByRole("button", { name: /Personalização/ }).click();
}

test("renders the foundation and switches between dark and light themes", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".bottom-nav button")).toHaveCount(4);
  await openAppearance(page);
  await expect(shell).toHaveAttribute("data-theme", "light");

  // A marca não deve recarregar a aplicação nem descartar a preferência.
  await page.locator(".brand").click();
  await expect(shell).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(shell).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".bottom-nav button")).toHaveCount(4);
});

test("has no horizontal overflow and keeps a four-item mobile dock", async ({ page }) => {
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  const dock = page.locator(".bottom-nav");
  await expect(dock).toBeVisible();
  await expect(dock.locator("button")).toHaveCount(4);
  await expect(dock).toHaveCSS("grid-template-columns", /\d+px\s+\d+px\s+\d+px\s+\d+px/);
});

test("passes automated WCAG 2.2 AA checks in both themes", async ({ page }) => {
  await page.goto("/");
  for (const theme of ["dark", "light"] as const) {
    if (theme === "light") await openAppearance(page);
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
  const navigation = await page.goto("/", { waitUntil: "domcontentloaded" })
    .then((response) => response?.status() ?? "sem resposta")
    .catch((error: Error) => `erro de navegação: ${error.message}`);
  const offlineSnapshot = {
    navigation,
    url: page.url(),
    title: await page.title().catch(() => "indisponível"),
    body: await page.locator("body").innerText().catch(() => "indisponível"),
    pageErrors,
  };
  console.log("Diagnóstico offline:", JSON.stringify(offlineSnapshot));
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".bottom-nav button")).toHaveCount(4);
  await context.setOffline(false);
});

test("supports keyboard navigation with a visible focus indicator", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".brand")).toBeFocused();
  const firstDockItem = page.locator(".bottom-nav button").first();
  await firstDockItem.focus();
  await expect(firstDockItem).toBeFocused();
  await expect(firstDockItem).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.locator(".bottom-nav button").nth(0)).toHaveAttribute("aria-current", "page");
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
