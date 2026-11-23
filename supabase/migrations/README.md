# Migrations da fundação

As cinco migrations previstas no contrato de arquitetura ainda não foram publicadas.

Ordem obrigatória:

1. `001_perfis_e_seguranca_base.sql` — perfis, preferências, categorias, helpers, grants e RLS.
2. `002_financeiro_core.sql` — contas, cartões, lançamentos, recorrências, orçamentos, metas, patrimônio, importação e anexos.
3. `003_investimentos_e_radar.sql` — ativos, operações, eventos de renda, cache de cotações, Radar e push.
4. `004_ia_fair_use_e_rate_limit.sql` — cotas técnicas uniformes, rate limit atômico e erros sanitizados.
5. `005_whatsapp_fila_e_outbox.sql` — vínculo, códigos, tentativas, inbox, outbox, leases e idempotência.

Cada migration deverá funcionar em banco vazio, habilitar RLS, limitar grants, validar referências do mesmo usuário e definir `search_path` fixo para funções privilegiadas.

Não copiar migrations históricas do ZIP: parte delas pertence a cobrança, assinaturas, Pluggy ou patches incrementais de produção e não corresponde ao schema limpo aprovado.

Nenhuma migration será aplicada a banco remoto durante a fundação. A execução local e os testes SQL serão pré-requisitos para considerar esta etapa concluída.
