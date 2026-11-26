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

test("renders authenticated sections with accessible navigation in dark and light themes", async ({ page }) => {
  test.setTimeout(90_000);
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    aud: "authenticated",
    role: "authenticated",
    email: "teste@granaviva.invalid",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { name: "Conta de teste" },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: user.id, role: "authenticated", aud: "authenticated", exp: now + 3600,
  })).toString("base64url");
  const accessToken = `${header}.${payload}.test-signature`;

  await page.route("https://test.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS, HEAD",
      "access-control-allow-headers": "*",
      "access-control-expose-headers": "content-range, content-location, content-profile, preference-applied",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: JSON.stringify(user) });
      return;
    }
    if (url.pathname.startsWith("/functions/v1/")) {
      const functionName = url.pathname.split("/").pop();
      const data = functionName === "minha-conta"
        ? { profile: { display_name: "Conta de teste", email: user.email } }
        : functionName === "minhas-preferencias"
          ? { theme: "dark" }
          : functionName === "whatsapp-vincular"
            ? { linked: false, weekly_summary_enabled: false }
            : [];
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: JSON.stringify({ data }) });
      return;
    }
    if (url.pathname === "/rest/v1/rpc/get_financial_summary") {
      await route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: JSON.stringify({ receivables_brl: 0, overtime_forecast_brl: 0 }) });
      return;
    }
    if (url.pathname === "/rest/v1/accounts" && request.method() === "POST") {
      const created = {
        id: "40000000-0000-4000-8000-000000000002",
        user_id: user.id,
        name: "Conta Nubank de teste",
        account_type: "checking",
        opening_balance: "250.00",
        opening_balance_date: "2026-01-01",
        is_primary: false,
        institution_name: "Nubank",
        institution_code: "260",
        institution_logo_key: "nubank.com.br",
      };
      await route.fulfill({
        status: 201,
        headers: { ...corsHeaders, "content-range": "0-0/1", "preference-applied": "return=representation" },
        contentType: "application/vnd.pgrst.object+json",
        body: JSON.stringify(created),
      });
      return;
    }
    if (url.pathname === "/rest/v1/accounts") {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-range": "0-0/1" },
        contentType: "application/json",
        body: JSON.stringify([{
          id: "40000000-0000-4000-8000-000000000001",
          user_id: user.id,
          name: "Conta principal",
          account_type: "checking",
          opening_balance: "0.00",
          opening_balance_date: "2026-01-01",
          is_primary: true,
          institution_name: null,
          institution_code: null,
          institution_logo_key: null,
        }]),
      });
      return;
    }
    if (url.pathname === "/rest/v1/rpc/get_account_balances") {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: "application/json",
        body: JSON.stringify([{ account_id: "40000000-0000-4000-8000-000000000001", balance: "123.45" }]),
      });
      return;
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      await route.fulfill({ status: 200, headers: { ...corsHeaders, "content-range": "0-0/0" }, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({ status: 200, headers: corsHeaders, contentType: "application/json", body: JSON.stringify({}) });
  });

  const accountInsertPayloads: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/accounts**", async (route) => {
    if (route.request().method() === "POST") {
      accountInsertPayloads.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        headers: { "access-control-allow-origin": "*", "content-range": "0-0/1", "preference-applied": "return=representation" },
        contentType: "application/json",
        body: JSON.stringify({
          id: "40000000-0000-4000-8000-000000000002",
          user_id: user.id,
          name: "Conta Nubank de teste",
          account_type: "checking",
          opening_balance: "250.00",
          opening_balance_date: "2026-01-01",
          is_primary: false,
          institution_name: "Nubank",
          institution_code: "260",
          institution_logo_key: "nubank.com.br",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*", "content-range": "0-0/1" },
      contentType: "application/json",
      body: JSON.stringify([{
        id: "40000000-0000-4000-8000-000000000001",
        user_id: user.id,
        name: "Conta principal",
        account_type: "checking",
        opening_balance: "0.00",
        opening_balance_date: "2026-01-01",
        is_primary: true,
        institution_name: null,
        institution_code: null,
        institution_logo_key: null,
      }]),
    });
  });

  await page.addInitScript(({ sessionUser, token }) => {
    localStorage.setItem("sb-test-auth-token", JSON.stringify({
      access_token: token,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "test-refresh-token",
      user: sessionUser,
    }));
    localStorage.setItem("granaviva:theme:v1", "dark");
  }, { sessionUser: user, token: accessToken });

  await page.goto("/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".bottom-nav")).toBeVisible();

  const tabs = [
    { name: "Início", selector: ".overview-grid" },
    { name: "Gastos", selector: "#gastos" },
    { name: "Patrimônio", selector: "#patrimonio" },
    { name: "Conta", selector: "#conta" },
  ];

  for (const theme of ["dark", "light"] as const) {
    if (theme === "light") {
      await page.getByRole("button", { name: "Conta", exact: true }).click();
      await page.getByRole("button", { name: /Personalização/ }).click();
      await expect(shell).toHaveAttribute("data-theme", "light");
    }
    for (const tab of tabs) {
      await page.getByRole("button", { name: tab.name, exact: true }).click();
      await expect(page.locator(tab.selector)).toBeVisible();
      if (tab.name === "Gastos") {
        const drawer = page.locator("#gastos details.management-drawer").first();
        await drawer.locator("summary").click();
        await drawer.getByLabel("Nome da conta").fill("Conta Nubank de teste");
        await drawer.getByLabel("Banco ou instituição").selectOption("nubank.com.br");
        await expect(drawer.locator(".bank-selected img")).toHaveAttribute("src", "/banks/nubank.svg");
        await drawer.getByLabel("Saldo inicial (R$)").fill("1.234,56");
        await drawer.getByRole("button", { name: "Adicionar conta", exact: true }).click();
        expect(accountInsertPayloads[0]?.opening_balance).toBe("1234.56");
        await expect(page.locator("#gastos .account-list")).toContainText("Conta Nubank de teste");
        await expect(page.locator("#gastos .account-list img.bank-logo")).toHaveAttribute("src", "/banks/nubank.svg");
      }
      if (tab.name === "Início") await expect(page.locator(".overview-balance strong")).toContainText("123,45");
      if (tab.name === "Conta") await expect(page.locator(".account-profile-card")).toBeVisible();
      const dock = page.locator(".bottom-nav");
      // A navegação deve permanecer visível mesmo após rolar a página.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(dock).toBeVisible();
      await expect(dock).toHaveAttribute("aria-hidden", "false");
      await page.evaluate(() => window.scrollTo(0, 0));
      const dockBox = await dock.boundingBox();
      const viewport = page.viewportSize();
      if (!dockBox || !viewport) throw new Error("Não foi possível medir a navegação inferior.");
      expect(dockBox.x).toBeGreaterThanOrEqual(0);
      expect(dockBox.x + dockBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(viewport.height + 1);
      const touchTargets = await dock.locator("button").evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      );
      expect(touchTargets).toHaveLength(4);
      expect(touchTargets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
      await expect(page.getByRole("button", { name: tab.name, exact: true })).toHaveAttribute("aria-current", "page");
      const activeNavButton = dock.locator("button.active");
      await expect(activeNavButton).toHaveCount(1);
      await expect(activeNavButton).toHaveAttribute("aria-current", "page");
      await expect(activeNavButton).toContainText(tab.name);
      const dockPaddingBottom = await dock.evaluate((element) => getComputedStyle(element).paddingBottom);
      expect(Number.parseFloat(dockPaddingBottom)).toBeLessThanOrEqual(8);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
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
        `Acessibilidade da área ${tab.name} no tema ${theme}`,
      ).toEqual([]);
    }
  }
});
