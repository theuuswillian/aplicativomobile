# Auditoria de segurança e desempenho — 24/11/2026

## Escopo

Auditoria do projeto Supabase Brasil `dvddqexnvllrxogbwmdf`, branch GitHub `fase-3-backend` e preparação da Fase 3. Esta revisão não publica Edge Functions, não ativa workers, não altera Vercel Production e não habilita provedores externos.

## Correções aplicadas

- Migration `20261124210803_add_covering_indexes_for_foreign_keys` aplicada ao Supabase.
- Migration versionada em `supabase/migrations/20261124210803_add_covering_indexes_for_foreign_keys.sql`.
- Criados 14 índices compostos para cobrir as chaves estrangeiras sinalizadas pelo advisor:
  - cards (user_id, account_id)
  - goal_contributions (user_id, goal_id) e (user_id, transaction_id)
  - import_items (user_id, transaction_id)
  - income_events (user_id, asset_id)
  - investment_operations (user_id, account_id) e (user_id, transaction_id)
  - recurrence_rules (user_id, account_id), (user_id, card_id) e (user_id, category_id)
  - transactions (user_id, category_id), (user_id, import_batch_id), (user_id, transfer_from_account_id) e (user_id, transfer_to_account_id)
- Após a migration, o advisor de performance não retornou mais o finding `unindexed_foreign_keys`.

## Avisos de RLS sem policy: avaliados e mantidos intencionalmente

O advisor de segurança ainda lista 15 tabelas com RLS habilitado e nenhuma policy. A verificação direta de privilégios confirmou, para todas elas:
- `anon`: sem SELECT, INSERT, UPDATE ou DELETE;
- `authenticated`: sem SELECT, INSERT, UPDATE ou DELETE;
- `service_role`: acesso administrativo para o backend.

Essas tabelas são internas, usadas por workers, filas, limites de uso, cache ou registros operacionais. Não criar policies para usuários finais: isso ampliaria a superfície de acesso e seria incorreto para o modelo de segurança. A ausência de policy, combinada com a revogação de privilégios dos papéis públicos/autenticados, é deliberada. O finding INFO do advisor é documentado, não uma vulnerabilidade aberta.

Tabelas verificadas: `ai_usage`, `ai_usage_reservations`, `function_errors`, `market_data_cursor`, `market_data_usage`, `push_delivery_attempts`, `quote_cache`, `radar_worker_state`, `rate_limit_buckets`, `whatsapp_inbox`, `whatsapp_link_attempts`, `whatsapp_link_codes`, `whatsapp_outbox`, `whatsapp_pending_transactions`, `whatsapp_weekly_summary_jobs`.

## Avisos de índices não utilizados

O advisor de performance mostra índices ainda sem uso. O banco está em fase de preparação e ainda não tem tráfego representativo; portanto, estatísticas de uso não justificam remover índices. Isso inclui índices novos recém-criados, naturalmente ainda sem leituras. Não remover índices sem observar carga real e plano de consultas.

## Estado operacional mantido

- Nenhuma Edge Function publicada.
- Nenhum worker/cron ativado; `WORKERS_ENABLED` permanece desativado.
- Brapi/feed de cotações permanece desativado.
- Nenhuma credencial OpenAI, Meta WhatsApp ou VAPID foi inventada ou ativada.
- Vercel Production não foi alterada.
- A chave `SUPABASE_SERVICE_ROLE_KEY` foi confirmada pelo operador como chave legada JWT (prefixo `eyJ`); o conteúdo do secret não é legível pelo conector, então não há verificação direta do valor salvo nem autenticação end-to-end neste estágio.

## Próximos gates antes de produção

1. Confirmar CI integral no HEAD atualizado da PR.
2. Fazer validação de autenticação em ambiente controlado sem disparar workers de produção.
3. Configurar e validar, somente quando houver autorização e credenciais reais, os segredos externos necessários a cada integração.
4. Publicar Edge Functions em etapas, com smoke tests por endpoint e sem habilitar cron/workers até o aceite.
5. Fazer teste funcional no Preview e no Safari/PWA; Preview Vercel está sujeito ao limite temporário de deployments já registrado.

