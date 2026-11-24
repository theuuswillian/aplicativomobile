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
10. `010_market_data_provider.sql` — controle atômico de consumo e cursor do provedor de cotações.
11. `011_manual_investment_reference_prices.sql` — origem explícita de preços manuais de referência dos ativos.

Cada migration deve funcionar em banco vazio, habilitar RLS nas tabelas expostas, limitar grants, validar referências do mesmo usuário e fixar `search_path` para funções privilegiadas.

Em projetos Supabase novos, confirme também em **Integrations → Data API** que o schema `public` está incluído nos schemas expostos. Desde a mudança de plataforma de 2026, tabelas novas não são automaticamente expostas à Data API por padrão. Exposição do schema não substitui grants mínimos nem RLS: mantenha ambos revisados.

Não copiar migrations históricas do ZIP: parte delas pertence a cobrança, assinaturas, Pluggy ou patches incrementais de produção e não corresponde ao schema limpo aprovado.

O CI aplica todas as migrations em PostgreSQL isolado e testa RLS, grants, Storage privado e concorrência. Nenhuma migration foi aplicada ao banco remoto por este procedimento de preparação.
