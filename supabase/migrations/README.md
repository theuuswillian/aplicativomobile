# Migrations do GranaViva

As migrations versionadas da fundação e das integrações são aplicadas em ordem crescente:

1. `001_perfis_e_seguranca_base.sql` — perfis, preferências, categorias, helpers, grants e RLS.
2. `002_financeiro_core.sql` — contas, cartões, lançamentos, recorrências, orçamentos, metas, patrimônio, importação e anexos.
3. `003_investimentos_e_radar.sql` — ativos, operações, eventos de renda, cache de cotações, Radar e Push.
4. `004_ia_fair_use_e_rate_limit.sql` — cotas técnicas uniformes, rate limit atômico e erros sanitizados.
5. `005_whatsapp_fila_e_outbox.sql` — vínculo, códigos, tentativas, inbox, outbox, leases e idempotência.
6. `006_radar_alert_generation.sql` — geração atômica de alertas do Radar.
7. `007_goal_contribution_atomic.sql` — histórico e atualização atômica de contribuições de metas.
8. `008_whatsapp_and_receipt_storage_safety.sql` — consentimento explícito para resumos WhatsApp, confirmação transacional idempotente e bucket privado de comprovantes.
9. `009_recurrence_generation.sql` — geração de lançamentos previstos, datas de calendário e idempotência por recorrência/data.

Cada migration deve funcionar em banco vazio, habilitar RLS nas tabelas expostas, limitar grants, validar referências do mesmo usuário e fixar `search_path` para funções privilegiadas.

Não copiar migrations históricas do ZIP: parte delas pertence a cobrança, assinaturas, Pluggy ou patches incrementais de produção e não corresponde ao schema limpo aprovado.

O CI aplica todas as migrations em PostgreSQL isolado e testa RLS, grants, Storage privado e concorrência. Nenhuma migration foi aplicada ao banco remoto.
