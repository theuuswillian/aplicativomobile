import { expect, test, type Page } from "@playwright/test";

// Regressões dos bugs corrigidos em fix/redesign-e-correcoes-geral.
// O PostgREST devolve colunas `numeric` como número JSON; os mocks abaixo seguem esse formato.
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "40000000-0000-4000-8000-000000000001";
const CARD_ID = "50000000-0000-4000-8000-000000000001";
const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthStart = iso(new Date(today.getFullYear(), today.getMonth(), 1));

const openNav = async (page: Page, id: string) => {
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.isVisible()) await menu.click();
  await page.locator(`.sidebar [data-nav="${id}"]`).click();
};

async function signIn(page: Page, posts: Array<{ table: string; body: Record<string, unknown> }>) {
  const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: "teste@granaviva.invalid", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  const tables: Record<string, unknown[]> = {
    accounts: [{ id: ACCOUNT_ID, name: "Conta principal", account_type: "checking", opening_balance: 1000, opening_balance_date: "2026-01-01", is_primary: true, institution_name: null, institution_code: null, institution_logo_key: null }],
    cards: [{ id: CARD_ID, name: "Cartão teste", institution_name: "Banco", last_four: "1234", brand: null, credit_limit: 5000, closing_day: 1, due_day: 10, is_archived: false }],
    transactions: [
      { id: "70000000-0000-4000-8000-000000000001", kind: "expense", status: "paid", payment_method: "pix", amount: 1234.5, transaction_date: monthStart, description: "Compra grande", account_id: ACCOUNT_ID, card_id: null, transfer_from_account_id: null, transfer_to_account_id: null, category_id: null },
      { id: "70000000-0000-4000-8000-000000000002", kind: "expense", status: "paid", payment_method: "credit", amount: 300, transaction_date: monthStart, description: "Compra no cartão", account_id: null, card_id: CARD_ID, transfer_from_account_id: null, transfer_to_account_id: null, category_id: null },
    ],
    receivable_loans: [{ id: "f1000000-0000-4000-8000-000000000001", person_name: "Carla", principal_amount: 400, loan_date: "2026-11-01", expected_date: null, source_account_id: ACCOUNT_ID, notes: null }],
    receivable_repayments: [{ id: "f2000000-0000-4000-8000-000000000001", loan_id: "f1000000-0000-4000-8000-000000000001", amount: 150, received_date: "2026-11-10" }],
  };
  await page.route("https://test.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range" };
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: { ...cors, "content-range": "0-0/*" }, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/auth/v1/user") return json(user);
    if (url.pathname.startsWith("/functions/v1/")) return json({ data: url.pathname.endsWith("minhas-preferencias") ? { theme: "dark" } : [] });
    if (url.pathname === "/rest/v1/rpc/get_account_balances") return json([{ account_id: ACCOUNT_ID, balance: 2500.75 }]);
    if (url.pathname.startsWith("/rest/v1/rpc/")) return json({});
    const table = url.pathname.split("/").pop() ?? "";
    if (request.method() === "POST") {
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      posts.push({ table, body });
      return json({ id: "99999999-0000-4000-8000-000000000001", current_amount: 0, ...body }, 201);
    }
    return json(tables[table] ?? []);
  });
  await page.addInitScript(({ sessionUser, accessToken }) => {
    localStorage.setItem("sb-test-auth-token", JSON.stringify({ access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r", user: sessionUser }));
  }, { sessionUser: user, accessToken: token });
}

test("não quebra com valores numéricos do PostgREST e formata saldo, empréstimo e edição", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, []);
  await page.goto("/");
  await expect(page.locator(".overview-balance-value")).toContainText("2.500,75");
  await page.getByRole("button", { name: "Ver metas" }).click();
  await expect(page.locator(".receivables-summary")).toContainText("250,00");
  await openNav(page, "lancamentos");
  await page.locator(".transaction-list .transaction-main", { hasText: "Compra grande" }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.locator(".transaction-edit-form").getByLabel("Valor (R$)")).toHaveValue("1.234,50");
  expect(errors).toEqual([]);
});

test("cria meta com mês desejado e registra pagamento de fatura", async ({ page, browserName }) => {
  // O WebKit de Linux usado no CI não implementa os seletores nativos de mês/data como o Safari do iPhone;
  // o fluxo é validado no Chromium, e a validação de datas tem teste unitário em money-parsing.test.ts.
  test.skip(browserName === "webkit", "input type=month/date sem suporte equivalente no WebKit de Linux");
  const posts: Array<{ table: string; body: Record<string, unknown> }> = [];
  await signIn(page, posts);
  await page.goto("/");
  await page.getByRole("button", { name: "Ver metas" }).click();
  const goalDrawer = page.locator("#planejamento-metas details.management-drawer").first();
  await goalDrawer.locator("summary").click();
  await goalDrawer.getByLabel("Nome da meta").fill("Viagem");
  await goalDrawer.getByLabel("Valor desejado (R$)").fill("500000");
  await goalDrawer.getByLabel("Mês desejado (opcional)").fill("2027-05");
  await goalDrawer.getByRole("button", { name: "Criar meta" }).click();
  await expect.poll(() => posts.find((post) => post.table === "goals")?.body.target_month).toBe("2027-05-01");
  expect(posts.find((post) => post.table === "goals")?.body.target_amount).toBe("5000.00");

  await page.evaluate(() => window.scrollTo(0, 0));
  await openNav(page, "cartoes");
  await expect(page.getByRole("tab", { name: "Contas", exact: true })).toHaveAttribute("aria-selected", "true");
  const invoiceDrawer = page.locator("#gastos-cartoes details.management-drawer", { hasText: "pagamento de fatura" });
  await invoiceDrawer.locator("summary").click();
  await invoiceDrawer.getByLabel("Data de fechamento da fatura").fill(monthStart);
  await invoiceDrawer.getByLabel("Valor pago (R$)").fill("10000");
  await invoiceDrawer.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect.poll(() => posts.find((post) => post.table === "card_invoice_payments")?.body.amount).toBe("100.00");
});

test("telas autenticadas não têm rolagem horizontal do celular ao desktop largo", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, []);
  await page.goto("/");
  await expect(page.locator(".overview-balance-value")).toContainText("2.500,75");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const destination of ["inicio", "lancamentos", "cartoes", "investimentos", "ajustes"]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await openNav(page, destination);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `rolagem horizontal em ${destination} com ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});

test("gaveta abre arrastando da borda esquerda e fecha arrastando para a esquerda ou tocando fora", async ({ page }) => {
  test.skip(test.info().project.name === "chromium-desktop", "Gesto de gaveta é só do layout mobile.");
  test.skip(test.info().project.name.startsWith("webkit"), "O WebKit de desktop não permite construir Touch sintético; o gesto é coberto no perfil chromium-iphone.");
  await signIn(page, []);
  await page.goto("/");
  await expect(page.locator(".overview-balance-value")).toContainText("2.500,75");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toBeHidden();
  const swipe = (fromX: number, toX: number) => page.evaluate(async ([startX, endX]) => {
    const target = document.elementFromPoint(Math.max(1, startX), 300) ?? document.body;
    const touchAt = (x: number) => new Touch({ identifier: 1, target, clientX: x, clientY: 300 });
    target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touchAt(startX)], changedTouches: [touchAt(startX)] }));
    const steps = 8;
    for (let index = 1; index <= steps; index += 1) {
      const x = startX + ((endX - startX) * index) / steps;
      target.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, touches: [touchAt(x)], changedTouches: [touchAt(x)] }));
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touchAt(endX)] }));
  }, [fromX, toX] as const);

  // Fora da faixa de 24px da borda, nada acontece.
  await swipe(120, 320);
  await expect(sidebar).toBeHidden();
  await swipe(4, 260);
  await expect(sidebar).toHaveClass(/is-open/);
  await expect(sidebar).toBeVisible();
  await swipe(250, 20);
  await expect(sidebar).not.toHaveClass(/is-open/);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(sidebar).toHaveClass(/is-open/);
  await page.locator(".sidebar-overlay").click({ position: { x: 370, y: 400 } });
  await expect(sidebar).not.toHaveClass(/is-open/);
});

test("novo lançamento no modal: reconhece o estabelecimento e cria categoria pelo combobox", async ({ page, browserName }) => {
  const posts: Array<{ table: string; body: Record<string, unknown> }> = [];
  await signIn(page, posts);
  await page.goto("/");
  await expect(page.locator(".overview-balance-value")).toContainText("2.500,75");
  await page.getByRole("button", { name: "Novo lançamento" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo lançamento" });
  await dialog.getByRole("button", { name: "Despesa" }).click();
  const form = page.getByRole("dialog", { name: "Nova despesa" });
  await expect(form).toBeVisible();
  const description = form.getByLabel("Descrição");
  await expect(description).toBeFocused();
  await description.fill("UBER *TRIP HELP.UBER.COM");
  await expect(form.locator(".tx-description-control .merchant-logo")).toHaveAttribute("src", "/merchants/uber.svg");
  await expect(form.locator(".tx-merchant-hint")).toContainText("Uber");
  await description.fill("IFD*IFOOD.COM");
  await expect(form.locator(".tx-description-control .merchant-logo")).toHaveAttribute("src", "/banks/ifood.svg");
  await form.getByLabel("Valor (R$)").fill("32,90");
  await form.getByRole("combobox", { name: "Conta", exact: true }).selectOption({ label: "Conta principal" });
  const combo = form.getByRole("combobox", { name: "Categoria" });
  await combo.click();
  await expect(form.getByRole("listbox", { name: "Categoria" })).toBeVisible();
  await combo.fill("Lanches da firma");
  const createOption = form.getByRole("option", { name: "Criar categoria “Lanches da firma”" });
  await expect(createOption).toBeVisible();
  // POSTs interceptados falham no WebKit de Linux ("Load failed"), como no teste de contas; o salvamento é coberto no Chromium.
  if (browserName === "webkit") return;
  await createOption.click();
  await expect.poll(() => posts.find((post) => post.table === "categories" && !Array.isArray(post.body) && post.body.name === "Lanches da firma")?.body.kind).toBe("expense");
  await expect(combo).toHaveValue("Lanches da firma");
  await form.getByRole("button", { name: "Salvar lançamento" }).click();
  await expect.poll(() => posts.find((post) => post.table === "transactions")?.body.description).toBe("IFD*IFOOD.COM");
  const transaction = posts.find((post) => post.table === "transactions")?.body;
  expect(transaction?.amount).toBe("32.90");
  expect(transaction?.category_id).toBe("99999999-0000-4000-8000-000000000001");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
