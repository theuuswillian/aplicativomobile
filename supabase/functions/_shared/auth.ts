import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "./http.ts";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          locale: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          user_id: string;
          theme: "dark" | "light" | "system";
          accent: string | null;
          currency: "BRL";
          whatsapp_weekly_summary: boolean;
          push_enabled: boolean;
          quiet_notifications: boolean;
          financial_preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          theme?: "dark" | "light" | "system";
          accent?: string | null;
          currency?: "BRL";
          whatsapp_weekly_summary?: boolean;
          push_enabled?: boolean;
          quiet_notifications?: boolean;
          financial_preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          theme?: "dark" | "light" | "system";
          accent?: string | null;
          whatsapp_weekly_summary?: boolean;
          push_enabled?: boolean;
          quiet_notifications?: boolean;
          financial_preferences?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          normalized_name: string;
          kind: "income" | "expense";
          color: string | null;
          icon: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          kind: "income" | "expense";
          color?: string | null;
          icon?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          kind?: "income" | "expense";
          color?: string | null;
          icon?: string | null;
          is_default?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          user_id: string;
          account_id: string | null;
          name: string;
          institution_name: string;
          last_four: string;
          brand: string | null;
          credit_limit: number;
          closing_day: number;
          due_day: number;
          interest_rate: number | null;
          late_fee_rate: number | null;
          monthly_interest_rate: number | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          account_id?: string | null;
          name: string;
          institution_name: string;
          last_four: string;
          brand?: string | null;
          credit_limit?: number;
          closing_day: number;
          due_day: number;
          interest_rate?: number | null;
          late_fee_rate?: number | null;
          monthly_interest_rate?: number | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          name?: string;
          institution_name?: string;
          last_four?: string;
          brand?: string | null;
          credit_limit?: number;
          closing_day?: number;
          due_day?: number;
          interest_rate?: number | null;
          late_fee_rate?: number | null;
          monthly_interest_rate?: number | null;
          is_archived?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type AuthenticatedContext = {
  user: User;
  supabase: SupabaseClient<Database, "public">;
};

export type AuthResult =
  | { ok: true; context: AuthenticatedContext }
  | { ok: false; response: Response };

export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const origin = request.headers.get("origin");
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\\s+(.+)$/i)?.[1];

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

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } },
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
