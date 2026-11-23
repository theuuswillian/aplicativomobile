export type JsonRecord = Record<string, unknown>;

const corsHeaders = (origin: string | null): HeadersInit => {
  const configuredOrigin = Deno.env.get("APP_ORIGIN");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };

  if (configuredOrigin && origin === configuredOrigin) {
    headers["Access-Control-Allow-Origin"] = configuredOrigin;
  }

  return headers;
};

export function jsonResponse(
  body: JsonRecord,
  status = 200,
  origin: string | null = null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export function methodNotAllowed(
  allowed: string[],
  origin: string | null,
): Response {
  return jsonResponse(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } },
    405,
    origin,
  );
}

export function invalidRequest(
  message = "Requisição inválida.",
  origin: string | null = null,
): Response {
  return jsonResponse(
    { error: { code: "INVALID_REQUEST", message } },
    400,
    origin,
  );
}

export function internalError(origin: string | null): Response {
  return jsonResponse(
    { error: { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação." } },
    500,
    origin,
  );
}

export function isJsonRequest(request: Request): boolean {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

export async function readJsonObject(
  request: Request,
  maxBytes = 16_384,
): Promise<JsonRecord | null> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as JsonRecord;
  } catch {
    return null;
  }
}
