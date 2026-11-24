-- Add covering indexes for foreign keys flagged by Supabase advisors.
-- These are additive, preserve existing data and do not change RLS or grants.
create index if not exists cards_user_account_fk_idx
  on public.cards (user_id, account_id);

create index if not exists goal_contributions_user_goal_fk_idx
  on public.goal_contributions (user_id, goal_id);
create index if not exists goal_contributions_user_transaction_fk_idx
  on public.goal_contributions (user_id, transaction_id);

create index if not exists import_items_user_transaction_fk_idx
  on public.import_items (user_id, transaction_id);

create index if not exists income_events_user_asset_fk_idx
  on public.income_events (user_id, asset_id);

create index if not exists investment_operations_user_account_fk_idx
  on public.investment_operations (user_id, account_id);
create index if not exists investment_operations_user_transaction_fk_idx
  on public.investment_operations (user_id, transaction_id);

create index if not exists recurrence_rules_user_account_fk_idx
  on public.recurrence_rules (user_id, account_id);
create index if not exists recurrence_rules_user_card_fk_idx
  on public.recurrence_rules (user_id, card_id);
create index if not exists recurrence_rules_user_category_fk_idx
  on public.recurrence_rules (user_id, category_id);

create index if not exists transactions_user_category_fk_idx
  on public.transactions (user_id, category_id);
create index if not exists transactions_user_import_batch_fk_idx
  on public.transactions (user_id, import_batch_id);
create index if not exists transactions_user_transfer_from_fk_idx
  on public.transactions (user_id, transfer_from_account_id);
create index if not exists transactions_user_transfer_to_fk_idx
  on public.transactions (user_id, transfer_to_account_id);
