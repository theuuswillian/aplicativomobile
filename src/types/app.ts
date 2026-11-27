// Linhas do Supabase usadas pela interface (formato devolvido pelo PostgREST/Edge Functions).
import type { RecurrenceFrequency } from "../domain/recurrence";
import type { ImportRow } from "../domain/imports";

export type PushSubscriptionRow = { id: string; endpoint: string; user_agent: string | null };
export type WhatsappLinkState = { phone: string; weekly_summary_enabled: boolean };
export type RadarFireRow = { alert_key: string; fired_at: string; observed_price: string; source: string | null; quote_observed_at: string | null };
export type RadarAlert = {
  id: string;
  asset_class: "stock" | "fii" | "etf" | "bdr" | "crypto";
  symbol: string;
  condition_type: "above" | "below" | "daily_drop";
  threshold: number;
  generation: number;
  is_enabled: boolean;
};
export type Profile = { display_name: string | null; email?: string };
export type AccountRow = { id: string; name: string; account_type: string; opening_balance: string; opening_balance_date: string; is_primary: boolean; institution_name?: string | null; institution_code?: string | null; institution_logo_key?: string | null };
export type CardRow = { id: string; name: string; institution_name: string; last_four: string; brand: string | null; credit_limit: string; closing_day: number; due_day: number; is_archived: boolean };
export type CategoryRow = { id: string; name: string; kind: "income" | "expense"; color: string | null; icon: string | null };
export type RecurrenceRow = { id: string; name: string; kind: "income" | "expense"; amount: string; frequency: RecurrenceFrequency; interval_count: number; weekday: number | null; month_day: number | null; month_of_year: number | null; starts_on: string; ends_on: string | null; next_occurrence_on: string; account_id: string | null; card_id: string | null; is_active: boolean };
export type BudgetRow = { id: string; category_id: string; year: number; month: number; limit_amount: string };
export type GoalRow = { id: string; name: string; target_amount: string; current_amount: string; monthly_contribution: string; target_month: string | null };
export type GoalContributionRow = { id: string; goal_id: string; amount: string; contribution_date: string; source: string; created_at: string };
export type InvestmentAssetRow = { id: string; symbol: string; name: string; asset_class: "stock" | "fii" | "etf" | "bdr" | "fixed_income" | "crypto"; currency: "BRL" | "USD"; current_price?: string | number | null; price_as_of?: string | null; price_source?: "manual" | "brapi.dev" | null; metadata?: Record<string, unknown> };
export type InvestmentOperationRow = { id: string; asset_id: string; operation_type: "opening" | "buy" | "sell"; operation_date: string; quantity: string; unit_price: string; gross_amount: string; fees: string };
export type IncomeEventRow = { id: string; asset_id: string; event_type: "dividend" | "jcp" | "distribution" | "coupon" | "interest" | "amortization" | "other"; reference_date: string; payment_date: string | null; announced_amount: string; received_amount: string; status: "announced" | "planned" | "received" | "cancelled"; account_id?: string | null; transaction_id?: string | null; settlement_state?: "unsettled" | "settled" };
export type BudgetSpendRow = { category_id: string | null; settled_amount: string };
export type AccountBalanceRpcRow = { account_id: string; balance: string | number };
export type TransactionRow = { id: string; kind: "income" | "expense" | "transfer"; status: "paid" | "planned" | "cancelled"; payment_method?: "pix" | "debit" | "cash" | "credit" | null; amount: string; transaction_date: string; description: string; account_id: string | null; card_id: string | null; transfer_from_account_id: string | null; transfer_to_account_id: string | null; category_id: string | null };
export type CardInvoicePaymentRow = { id: string; card_id: string; account_id: string; invoice_closing_date: string; amount: string; payment_date: string; description: string };
export type CardInvoiceInstallmentRow = { id: string; transaction_id: string; card_id: string; invoice_closing_date: string; invoice_due_date: string; installment_number: number; installment_count: number; amount: string };
export type ImportPreviewRow = ImportRow & { dedupeKey: string; duplicate: boolean };
export type ReceiptFileRow = { id: string; transaction_id: string; storage_path: string; mime_type: string; byte_size: number; created_at: string };
export type ReceiptDraft = { sufficient: boolean; kind: "income" | "expense" | null; amount: string | null; date: string | null; description: string | null; category: string | null; payment_method: string | null; installment_count: number | null; card_last_four: string | null; confidence: number; warnings: string[] };
export type Theme = "dark" | "light";
export type FinancialSummary = { receivables_brl?: number; overtime_forecast_brl?: number; investment_reference_brl?: number; investment_reference_usd?: number };
