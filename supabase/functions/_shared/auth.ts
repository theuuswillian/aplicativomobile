import { createClient, type User } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "./http.ts";

export type AuthenticatedContext = {
  user: User;
  supabase: ReturnType<typeof createClient>;
};

export type AuthResult =
  | { ok: true; context: AuthenticatedContext }
  | { ok: false; response: Response };

export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const origin = request.headers.get("origin");
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return {
      ok: false,
      response: jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "Autenticação necessária." } },
        401,
        origin,
      ),
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      response: jsonResponse(
        { error: { code: "SERVER_CONFIGURATION", message: "Serviço temporariamente indisponível." } },
        503,
        origin,
      ),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      response: jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "Sessão inválida ou expirada." } },
        401,
        origin,
      ),
    };
  }

  return { ok: true, context: { user: data.user, supabase } };
}
