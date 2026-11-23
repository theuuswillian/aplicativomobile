# Análise do legado para a Fase 2 — 22/11/2026

## Escopo inspecionado

Arquivo-fonte: `grana-viva-rebuild-grana-viva-next(1).zip`, enviado nesta conversa.

O arquivo contém 222 entradas. Foram inspecionados o README, a auditoria read-only do Supabase datada de 20/11/2026, o scaffold React/Vite, migrations SQL selecionadas, funções de WhatsApp e testes SQL de reconciliação.

Esta análise não representa acesso ao banco remoto. A auditoria do legado descreve observações feitas em 20/11/2026; não foi repetida nesta etapa.

## Evidências do legado

- O README descreve o produto anterior como PWA com Supabase Auth/PostgreSQL, RLS, Edge Functions, service worker e automações.
- O frontend React/Vite incluído no ZIP é um protótipo visual: usa arrays locais de demonstração e estado de navegação; não comprova persistência financeira.
- O legado contém migrações e funções de assinaturas/pagamentos, Mercado Pago e Pluggy. Esses componentes não serão copiados para a reconstrução.
- O legado contém fluxos de WhatsApp com deduplicação, leases, fencing e outbox. Esses padrões podem orientar requisitos técnicos, mas precisam ser reimplementados sob o contrato gratuito e com escopo reduzido.
- A auditoria de 20/11/2026 informa 30 arquivos SQL locais, 18 migrations registradas remotamente e 12 arquivos sem registro remoto. Ela alerta expressamente para não reaplicar em lote nem reparar o histórico automaticamente.
- A mesma auditoria relata que o schema remoto observado estava em PostgreSQL 17 e descreve tabelas genéricas legadas como `tx`, `bancos`, `cartoes`, `fiis`, `metas` e `settings`. O ZIP não contém uma baseline completa e reproduzível de todas essas tabelas.
- A auditoria relata que objetos internos sem policies tinham grants limitados a `postgres` e `service_role`; portanto, não se deve adicionar policies genéricas apenas para remover alertas do advisor.
- A auditoria registra dependências operacionais de `pg_net` em oito jobs do pg_cron. Não mover a extensão nem alterar esses jobs como parte da reconstrução sem um plano específico.

## Semântica financeira que deve ser preservada

O contrato arquitetural publicado continua sendo a autoridade. A modelagem inicial no repositório já distingue:
- natureza do lançamento: `income`, `expense`, `transfer`;
- situação: `paid`, `planned`, `cancelled`;
- valor em centavos inteiros;
- conta/cartão e contas de origem/destino de transferência;
- valor liquidado e instante de liquidação.

No helper de domínio existente, somente `paid` é efetivo e transferências não são classificadas como receita ou despesa. Essa separação é requisito para impedir que previsões sejam somadas ao realizado.

## Decisões para a reconstrução

1. Não copiar o monólito legado, nem o protótipo React legado como aplicação funcional.
2. Não trazer assinaturas, pagamentos, planos, cobrança, Mercado Pago ou Pluggy.
3. Não tratar o snapshot de RLS do legado como migration incremental.
4. Não reaplicar migrations ausentes do histórico remoto sem reconciliação e autorização específica.
5. Criar schema novo, explícito e reproduzível para a aplicação reconstruída, com isolamento por usuário, RLS e grants mínimos.
6. Manter funções privilegiadas inacessíveis a `anon` e `authenticated`, com `search_path` fixo e execução concedida somente aos papéis necessários.
7. Usar constraints e chaves estrangeiras para preservar integridade de transferências e histórico financeiro.
8. Separar tabelas de domínio acessíveis ao usuário de filas, outbox, rate limits e demais tabelas internas.
9. Validar migrations em PostgreSQL isolado e testar isolamento com pelo menos dois usuários antes de declarar a fundação concluída.

## Limitações ainda abertas

- Não foi feita conexão nem consulta ao Supabase remoto nesta etapa.
- Não foi executado PostgreSQL local, Supabase CLI, Docker ou suite de testes SQL nesta etapa.
- A semântica completa de todos os campos JSON do legado ainda exige leitura dirigida do monólito e dos fluxos de importação; não se deve inferir colunas a partir de nomes isolados.
- A publicação desta análise não significa que migrations, RLS, Storage ou integração de autenticação estejam implementados.

## Próximo trabalho

Consolidar o modelo de domínio e a baseline SQL da nova aplicação, usando o contrato arquitetural e esta análise como limites. Em seguida, escrever migrations incrementais novas e assertions SQL em ambiente isolado. Nenhuma migration será aplicada em produção nesta fase.
