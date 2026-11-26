import { expect, test, type Page } from "@playwright/test";

// Regressões dos bugs corrigidos em fix/redesign-e-correcoes-geral.
// O PostgREST devolve colunas `numeric` como número JSON; os mocks abaixo seguem esse formato.
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "40000000-0000-4000-8000-000000000001";
const CARD_ID = "50000000-0000-4000-8000-000000000001";
const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthStart = iso(new Date(today.getFullYear(), today.getMonth(), 1));

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
  await page.getByRole("button", { name: "Metas", exact: true }).click();
  await expect(page.locator(".receivables-summary")).toContainText("250,00");
  await page.getByRole("button", { name: "Gastos", exact: true }).click();
  await page.locator(".transaction-list .transaction-main", { hasText: "Compra grande" }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.locator(".transaction-edit-form").getByLabel("Valor (R$)")).toHaveValue("1.234,50");
  expect(errors).toEqual([]);
});

test("cria meta com mês desejado e registra pagamento de fatura", async ({ page }) => {
  const posts: Array<{ table: string; body: Record<string, unknown> }> = [];
  await signIn(page, posts);
  await page.goto("/");
  await page.getByRole("button", { name: "Metas", exact: true }).click();
  const goalDrawer = page.locator("#planejamento-metas details.management-drawer").first();
  await goalDrawer.locator("summary").click();
  await goalDrawer.getByLabel("Nome da meta").fill("Viagem");
  await goalDrawer.getByLabel("Valor desejado (R$)").fill("500000");
  await goalDrawer.getByLabel("Mês desejado (opcional)").fill("2027-05");
  await goalDrawer.getByRole("button", { name: "Criar meta" }).click();
  await expect.poll(() => posts.find((post) => post.table === "goals")?.body.target_month).toBe("2027-05-01");
  expect(posts.find((post) => post.table === "goals")?.body.target_amount).toBe("5000.00");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Gastos", exact: true }).click();
  await page.getByRole("tab", { name: "Contas", exact: true }).click();
  const invoiceDrawer = page.locator("#gastos-cartoes details.management-drawer", { hasText: "pagamento de fatura" });
  await invoiceDrawer.locator("summary").click();
  await invoiceDrawer.getByLabel("Data de fechamento da fatura").fill(monthStart);
  await invoiceDrawer.getByLabel("Valor pago (R$)").fill("10000");
  await invoiceDrawer.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect.poll(() => posts.find((post) => post.table === "card_invoice_payments")?.body.amount).toBe("100.00");
});
