const apiUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigin = "http://localhost:5173";

if (!apiUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Variáveis locais do Supabase não foram fornecidas.");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function jsonRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function createUser(name: string) {
  const email = `granaviva-${crypto.randomUUID()}@example.test`;
  const password = `Local-Test-${crypto.randomUUID()}-Aa1!`;
  const { response, body } = await jsonRequest(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    }),
  });
  assert(response.ok && body?.id, "Não foi possível criar usuário de teste local.");
  return { id: body.id as string, email, password };
}

async function signIn(email: string, password: string) {
  const { response, body } = await jsonRequest(
    `${apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: anonKey!, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  assert(response.ok && body?.access_token, "Não foi possível autenticar usuário de teste.");
  return body.access_token as string;
}

async function invoke(
  functionName: string,
  token: string | null,
  body?: unknown,
  method = "POST",
  origin = allowedOrigin,
) {
  const headers = new Headers({ apikey: anonKey!, Origin: origin });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return jsonRequest(`${apiUrl}/functions/v1/${functionName}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function deleteUser(userId: string) {
  await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey!}`,
    },
  });
}

const createdUsers: string[] = [];
try {
  const userA = await createUser("Conta de Teste A");
  createdUsers.push(userA.id);
  const userB = await createUser("Conta de Teste B");
  createdUsers.push(userB.id);

  const tokenA = await signIn(userA.email, userA.password);
  const tokenB = await signIn(userB.email, userB.password);

  const preflight = await fetch(`${apiUrl}/functions/v1/minha-conta`, {
    method: "OPTIONS",
    headers: {
      Origin: allowedOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, apikey, content-type",
    },
  });
  assert(preflight.status === 204, "Preflight CORS permitido deveria retornar 204.");
  assert(
    preflight.headers.get("Access-Control-Allow-Origin") === allowedOrigin,
    "CORS deve liberar somente a origem configurada.",
  );

  const hostilePreflight = await fetch(`${apiUrl}/functions/v1/minha-conta`, {
    method: "OPTIONS",
    headers: { Origin: "https://attacker.example", "Access-Control-Request-Method": "POST" },
  });
  assert(
    hostilePreflight.headers.get("Access-Control-Allow-Origin") === null,
    "CORS não deve refletir origem não configurada.",
  );

  const unauthenticated = await invoke("minha-conta", null, { action: "consultar" });
  assert(unauthenticated.response.status === 401, "Requisição sem JWT deve ser rejeitada.");

  const wrongMethod = await invoke("minha-conta", tokenA, undefined, "GET");
  assert(wrongMethod.response.status === 405, "Método GET deve ser rejeitado.");
  assert(
    wrongMethod.response.headers.get("Allow")?.includes("POST"),
    "Resposta 405 deve informar Allow.",
  );

  const profile = await invoke("minha-conta", tokenA, { action: "consultar" });
  assert(profile.response.ok, "Usuário autenticado deve consultar seu perfil.");
  assert(profile.body?.data?.profile?.id === userA.id, "Perfil retornado deve pertencer ao usuário A.");
  assert(profile.body?.data?.settings, "Preferências iniciais devem ser criadas pelo trigger.");

  const updatedProfile = await invoke("minha-conta", tokenA, {
    action: "atualizar",
    display_name: "Nome Atualizado",
  });
  assert(
    updatedProfile.response.ok && updatedProfile.body?.data?.profile?.display_name === "Nome Atualizado",
    "Usuário deve conseguir atualizar apenas o próprio nome.",
  );

  const invalidProfile = await invoke("minha-conta", tokenA, {
    action: "atualizar",
    display_name: "N".repeat(81),
  });
  assert(invalidProfile.response.status === 400, "Nome acima de 80 caracteres deve ser rejeitado.");

  const updatedSettings = await invoke("minhas-preferencias", tokenA, {
    action: "atualizar",
    theme: "light",
    push_enabled: true,
  });
  assert(
    updatedSettings.response.ok &&
      updatedSettings.body?.data?.theme === "light" &&
      updatedSettings.body?.data?.push_enabled === true,
    "Usuário deve atualizar somente os campos permitidos das próprias preferências.",
  );

  const invalidSettings = await invoke("minhas-preferencias", tokenA, {
    action: "atualizar",
    theme: "dark",
    user_id: userB.id,
  });
  assert(invalidSettings.response.status === 400, "Campo user_id enviado pelo cliente deve ser rejeitado.");

  const userBProfile = await fetch(
    `${apiUrl}/rest/v1/profiles?id=eq.${userB.id}&select=id`,
    {
      headers: { apikey: anonKey!, Authorization: `Bearer ${tokenA}` },
    },
  );
  const isolatedRows = await userBProfile.json();
  assert(
    userBProfile.ok && Array.isArray(isolatedRows) && isolatedRows.length === 0,
    "RLS deve impedir o usuário A de ler o perfil do usuário B.",
  );

  const ownPreferences = await invoke("minhas-preferencias", tokenB, { action: "consultar" });
  assert(
    ownPreferences.response.ok && ownPreferences.body?.data?.theme === "dark",
    "Preferências do usuário B devem permanecer isoladas do usuário A.",
  );

  console.log("Integração local Supabase/Auth/Edge Functions/RLS aprovada.");
} finally {
  for (const userId of createdUsers) await deleteUser(userId);
}
