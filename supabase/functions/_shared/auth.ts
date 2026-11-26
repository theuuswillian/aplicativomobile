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
      push_subscriptions: {
        Row: { id: string; user_id: string; endpoint: string; p256dh: string; auth_key: string; user_agent: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; endpoint: string; p256dh: string; auth_key: string; user_agent?: string | null; created_at?: string; updated_at?: string };
        Update: { endpoint?: string; p256dh?: string; auth_key?: string; user_agent?: string | null; updated_at?: string };
        Relationships: [];
      };
      radar_alerts: {
        Row: {
          id: string; user_id: string; asset_class: "stock" | "fii" | "etf" | "bdr" | "crypto";
          symbol: string; provider_asset_id: string | null; condition_type: "above" | "below" | "daily_drop";
          threshold: number; generation: number; is_enabled: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; user_id: string; asset_class: "stock" | "fii" | "etf" | "bdr" | "crypto";
          symbol: string; provider_asset_id?: string | null; condition_type: "above" | "below" | "daily_drop";
          threshold: number; generation?: number; is_enabled?: boolean; created_at?: string; updated_at?: string;
        };
        Update: {
          symbol?: string; provider_asset_id?: string | null; condition_type?: "above" | "below" | "daily_drop";
          threshold?: number; is_enabled?: boolean; updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: { id: string; user_id: string; name: string; is_primary: boolean; is_archived: boolean };
        Insert: { id?: string; user_id: string; name: string; is_primary?: boolean; is_archived?: boolean };
        Update: { name?: string; is_primary?: boolean; is_archived?: boolean };
        Relationships: [];
      };
      transactions: {
        Row: { id: string; user_id: string; kind: "income" | "expense" | "transfer"; status: "paid" | "planned" | "cancelled"; amount: number; transaction_date: string };
        Insert: { id?: string; user_id: string; kind: "income" | "expense" | "transfer"; status?: "paid" | "planned" | "cancelled"; amount: number; transaction_date: string };
        Update: { status?: "paid" | "planned" | "cancelled"; amount?: number; transaction_date?: string };
        Relationships: [];
      };
      whatsapp_links: {
        Row: { user_id: string; phone: string; weekly_summary_enabled: boolean; last_summary_week: string | null };
        Insert: { user_id: string; phone: string; weekly_summary_enabled?: boolean; last_summary_week?: string | null };
        Update: { phone?: string; weekly_summary_enabled?: boolean; last_summary_week?: string | null };
        Relationships: [];
      };
      whatsapp_weekly_summary_jobs: {
        Row: {
          user_id: string; week_start: string; phone: string; message: string;
          status: "pending" | "processing" | "sent" | "uncertain" | "failed" | "skipped";
          lease_token: string | null; lease_until: string | null; attempts: number;
          last_error: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          user_id: string; week_start: string; phone: string; message: string;
          status?: "pending" | "processing" | "sent" | "uncertain" | "failed" | "skipped";
          lease_token?: string | null; lease_until?: string | null; attempts?: number;
          last_error?: string | null;
        };
        Update: {
          status?: "pending" | "processing" | "sent" | "uncertain" | "failed" | "skipped";
          lease_token?: string | null; lease_until?: string | null; attempts?: number;
          last_error?: string | null;
        };
        Relationships: [];
      };
      whatsapp_inbox: {
        Row: { message_id: string; payload: Json; status: "queued" | "processing" | "completed" | "failed" | "exhausted"; lease_token: string | null; lease_until: string | null; attempts: number; created_at: string };
        Insert: { message_id: string; payload: Json; status?: "queued" | "processing" | "completed" | "failed" | "exhausted" };
        Update: { status?: "queued" | "processing" | "completed" | "failed" | "exhausted"; lease_token?: string | null; lease_until?: string | null; attempts?: number };
        Relationships: [];
      };
      whatsapp_pending_transactions: {
        Row: { id: string; user_id: string; phone: string; payload: Json; source_message_id: string; status: "pending" | "confirmed" | "cancelled" | "expired"; expires_at: string };
        Insert: { id: string; user_id: string; phone: string; payload: Json; source_message_id: string; status?: "pending" | "confirmed" | "cancelled" | "expired"; expires_at: string };
        Update: { status?: "pending" | "confirmed" | "cancelled" | "expired" };
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
    Functions: {
      radar_alert_set_enabled: { Args: { p_alert_id: string; p_enabled: boolean }; Returns: { id: string; generation: number; is_enabled: boolean }[] };
      whatsapp_link_attempt_allow: { Args: { p_phone: string }; Returns: boolean };
      whatsapp_link_consume: { Args: { p_code_hash: string; p_phone: string }; Returns: string | null };
      whatsapp_inbox_reserve: { Args: { p_message_id: string; p_payload: Json; p_lease_seconds?: number }; Returns: { reservation_status: string; fencing_token: string | null; attempt_number: number }[] };
      whatsapp_inbox_finalize: { Args: { p_message_id: string; p_fencing_token: string; p_success: boolean; p_error?: string | null }; Returns: boolean };
      whatsapp_pending_confirm: { Args: { p_pending_id: string }; Returns: { result: string; transaction_id: string | null }[] };
      whatsapp_summary_reserve: { Args: { p_user_id: string; p_week: string }; Returns: boolean };
      whatsapp_summary_job_enqueue: { Args: { p_user_id: string; p_week: string; p_phone: string; p_message: string }; Returns: boolean };
      whatsapp_summary_job_skip: { Args: { p_user_id: string; p_week: string }; Returns: boolean };
      whatsapp_summary_job_claim: { Args: { p_user_id: string; p_week: string; p_lease_seconds?: number }; Returns: { reservation_status: string; fencing_token: string | null; phone: string | null; message: string | null; attempt_number: number }[] };
      whatsapp_summary_job_finalize: { Args: { p_user_id: string; p_week: string; p_fencing_token: string; p_status: string; p_error?: string | null }; Returns: boolean };
    };
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
