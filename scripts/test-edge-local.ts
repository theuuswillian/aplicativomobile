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
      apikey: anonKey!,
      Origin: allowedOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, apikey, content-type",
    },
  });
  assert(
    preflight.status === 200 || preflight.status === 204,
    "Preflight CORS permitido deve retornar sucesso HTTP (200 ou 204).",
  );
  // The local Supabase gateway may answer OPTIONS itself with its platform-wide
  // preflight headers. The function's exact allowlist is tested at runtime below.

  const unauthenticated = await invoke("minha-conta", null, { action: "consultar" });
  assert(
    unauthenticated.response.status === 401,
    `Requisição sem JWT deve ser rejeitada (status=${unauthenticated.response.status}; body=${JSON.stringify(unauthenticated.body)}).`,
  );

  const wrongMethod = await invoke("minha-conta", tokenA, undefined, "GET");
  assert(wrongMethod.response.status === 405, "Método GET deve ser rejeitado.");
  assert(
    wrongMethod.response.headers.get("Allow")?.includes("POST"),
    "Resposta 405 deve informar Allow.",
  );

  const profile = await invoke("minha-conta", tokenA, { action: "consultar" });
  assert(profile.response.ok, `Usuário autenticado deve consultar seu perfil (status=${profile.response.status}; body=${JSON.stringify(profile.body)}).`);
  // O gateway local do Supabase pode anexar seu próprio cabeçalho CORS
  // global (inclusive "*") antes de a resposta da função chegar ao cliente.
  // A allowlist da Edge Function é verificada diretamente pelos testes Deno,
  // e a rejeição de uma origem externa é verificada no POST abaixo.

  const hostileOriginRequest = await invoke(
    "minha-conta",
    tokenA,
    { action: "consultar" },
    "POST",
    "https://attacker.example",
  );
  assert(
    hostileOriginRequest.response.status === 403,
    `A função deve rejeitar requisições de origens não configuradas, mesmo com JWT válido (status=${hostileOriginRequest.response.status}; allow-origin=${hostileOriginRequest.response.headers.get("Access-Control-Allow-Origin") ?? "ausente"}; body=${JSON.stringify(hostileOriginRequest.body)}).`,
  );
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

  const radarCreated = await invoke("radar-alertas", tokenA, {
    action: "criar",
    asset_class: "stock",
    symbol: "PETR4",
    condition_type: "above",
    threshold: 38.5,
  });
  assert(radarCreated.response.status === 201 && radarCreated.body?.data?.generation === 1,
    `Usuário A deve criar alerta Radar (status=${radarCreated.response.status}; body=${JSON.stringify(radarCreated.body)}).`);
  const radarId = radarCreated.body.data.id as string;

  const radarListA = await invoke("radar-alertas", tokenA, { action: "consultar" });
  assert(radarListA.response.ok && radarListA.body?.data?.length === 1,
    "Usuário A deve consultar somente seus alertas Radar.");

  const radarListB = await invoke("radar-alertas", tokenB, { action: "consultar" });
  assert(radarListB.response.ok && radarListB.body?.data?.length === 0,
    "Alertas Radar do usuário A não podem aparecer para o usuário B.");

  const radarDisabled = await invoke("radar-alertas", tokenA, { action: "desativar", id: radarId });
  assert(radarDisabled.response.ok && radarDisabled.body?.data?.generation === 1 &&
    radarDisabled.body?.data?.is_enabled === false, "Desativar Radar não deve incrementar geração.");

  const radarEnabled = await invoke("radar-alertas", tokenA, { action: "ativar", id: radarId });
  assert(radarEnabled.response.ok && radarEnabled.body?.data?.generation === 2 &&
    radarEnabled.body?.data?.is_enabled === true, "Reativar Radar deve incrementar geração uma única vez.");

  const radarCrossUser = await invoke("radar-alertas", tokenB, { action: "desativar", id: radarId });
  assert(radarCrossUser.response.status === 404,
    "Usuário B não pode alterar alerta Radar do usuário A.");

  const radarInvalid = await invoke("radar-alertas", tokenA, {
    action: "criar", asset_class: "stock", symbol: "petr4",
    condition_type: "above", threshold: 38.5, generation: 999,
  });
  assert(radarInvalid.response.status === 400,
    "Radar deve rejeitar símbolo inválido e campos internos privilegiados.");

  const pushRegistered = await invoke("push-inscricoes", tokenA, {
    action: "registrar",
    endpoint: "https://fcm.googleapis.com/fcm/send/local-test-token",
    p256dh: "A".repeat(87),
    auth_key: "B".repeat(22),
    user_agent: "GranaViva Integration Test",
  });
  assert(pushRegistered.response.status === 201 && pushRegistered.body?.data?.id,
    "Usuário A deve registrar inscrição Push.");
  const pushId = pushRegistered.body.data.id as string;
  const pushRepeated = await invoke("push-inscricoes", tokenA, {
    action: "registrar",
    endpoint: "https://fcm.googleapis.com/fcm/send/local-test-token",
    p256dh: "A".repeat(87),
    auth_key: "B".repeat(22),
    user_agent: "GranaViva Integration Test",
  });
  assert(pushRepeated.response.ok && pushRepeated.body?.data?.id === pushId,
    "Registrar novamente a mesma inscrição deve ser idempotente.");
  const pushListA = await invoke("push-inscricoes", tokenA, { action: "consultar" });
  assert(pushListA.response.ok && pushListA.body?.data?.length === 1,
    "Usuário A deve consultar sua inscrição Push.");
  const pushListB = await invoke("push-inscricoes", tokenB, { action: "consultar" });
  assert(pushListB.response.ok && pushListB.body?.data?.length === 0,
    "Inscrição Push do usuário A não pode aparecer para usuário B.");
  const pushRemovedByB = await invoke("push-inscricoes", tokenB, { action: "remover", id: pushId });
  assert(pushRemovedByB.response.status === 404,
    "Usuário B não pode remover inscrição Push do usuário A.");
  const pushRemoved = await invoke("push-inscricoes", tokenA, { action: "remover", id: pushId });
  assert(pushRemoved.response.ok && pushRemoved.body?.data?.deleted === true,
    "Usuário A deve remover sua inscrição Push.");

  const assistantWithoutConsent = await invoke("assistente", tokenA, {
    question: "Como foi meu mês?",
    facts: { expenses_paid: "R$ 1.200,00" },
  });
  assert(
    assistantWithoutConsent.response.status === 400,
    "Assistente deve exigir consentimento antes de enviar fatos à IA.",
  );

  const receiptWithoutConsent = await invoke("ler-comprovante", tokenA, {
    file_base64: btoa("%PDF-1.7"),
    mime_type: "application/pdf",
  });
  assert(
    receiptWithoutConsent.response.status === 400,
    "Leitura de comprovante deve exigir consentimento antes de enviar o arquivo à IA.",
  );

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
