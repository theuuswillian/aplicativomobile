# GranaViva — Fase 2: fundação técnica

## Estado atual

A Fase 2 está em andamento na branch `fase-2-fundacao`. O repositório contém o scaffold React/Vite, configuração TypeScript/Vitest/ESLint, CI inicial e um primeiro helper monetário com teste.

A interface atual é somente uma prévia visual: os valores exibidos são ilustrativos e não representam dados persistidos nem funcionalidades financeiras implementadas.

## Itens desta fase

- [x] Repositório e branch de trabalho definidos.
- [x] Scaffold React 19 + TypeScript + Vite.
- [x] Configuração inicial de build, lint, testes e CI.
- [x] Helper monetário inicial e teste unitário.
- [x] Publicar a cópia integral do contrato em `docs/ARQUITETURA_TRAVADA.md` (commit `0a9e6f0`).
- [ ] Design system alinhado ao contrato, com fontes e ativos locais (fontes, logos, ícones e imagens ainda não publicados).
- [x] Primeiros tipos e semântica do domínio financeiro (a cobertura completa ainda está pendente).
- [x] Cinco migrations consolidadas publicadas na branch; execução PostgreSQL e revisão SQL final pendentes.
- [x] Assertions SQL publicadas para isolamento, grants, RLS e funções privilegiadas; execução pendente.
- [x] Primeiros testes unitários de datas e semântica dos lançamentos (execução pendente).
- [x] Script inicial de verificação de lista negra e arquivos monolíticos (execução local do script concluída).
- [ ] Build, lint, typecheck e testes executados com sucesso em ambiente com dependências.

## Limites de segurança

- Nenhuma migration foi aplicada a projeto Supabase remoto.
- Nenhuma chave secreta deve ser enviada ao frontend ou versionada.
- Não copiar `app.js`, `app.min.js`, `index.html` legado, código de pagamentos, assinaturas, Pluggy ou funções antigas como implementação da reconstrução.
- Não considerar números de demonstração como lançamentos realizados.

## Validação pendente

O build e os testes ainda precisam ser executados com dependências instaladas. A validação SQL exige PostgreSQL/Supabase local. Até essas verificações ocorrerem, nada será declarado como validado.

A Fase 3 permanece bloqueada até conclusão e aprovação explícita da Fase 2.


## Atualização de continuidade — 22/11/2026

- O estado da branch foi conferido antes da alteração: as cinco migrations e as assertions SQL ainda não estavam no GitHub.
- O contrato arquitetural integral foi publicado em `docs/ARQUITETURA_TRAVADA.md` na branch `fase-2-fundacao`.
- Nenhuma migration foi inventada ou aplicada nesta atualização; o pacote local anterior não está disponível no ambiente desta sessão e precisa ser reconstruído ou reapresentado antes de publicar SQL.
- O repositório continua sem as cinco migrations, sem testes reais de PostgreSQL/RLS e sem validação integral de build/lint/testes.
- A Fase 2 continua em andamento e a Fase 3 continua bloqueada.


## Atualização de análise do legado — 22/11/2026

- O ZIP original enviado nesta conversa foi aberto e inventariado: 222 entradas.
- Foi publicada a análise de evidências e decisões em `docs/LEGADO-ANALISE-2026-11-22.md` (commit `b3b1b58`).
- A análise confirma que o protótipo React do legado é visual e usa dados locais ilustrativos; não é uma implementação persistida a reaproveitar.
- Foram documentados os riscos de replay das migrations antigas, os limites da auditoria remota de 20/11 e os padrões de WhatsApp que podem ser reavaliados sem trazer pagamentos/Pluggy.
- Nenhuma migration foi aplicada nem publicada nesta atualização. A baseline SQL nova e suas assertions continuam pendentes de reconstrução e validação em PostgreSQL isolado.


## Atualização de implementação SQL — 22/11/2026

Foram publicadas na branch `fase-2-fundacao` as cinco migrations previstas no contrato:

1. `001_perfis_e_seguranca_base.sql` — profiles, settings, categories, trigger de criação de usuário, RLS e grants.
2. `002_financeiro_core.sql` — contas, cartões, recorrências, lançamentos, orçamentos, metas, patrimônio, importação e comprovantes.
3. `003_investimentos_e_radar.sql` — ativos, livro de operações, proventos, cache privado, Radar e push.
4. `004_ia_fair_use_e_rate_limit.sql` — cotas operacionais com reservas atômicas, rate limit e log interno de erros.
5. `005_whatsapp_fila_e_outbox.sql` — vínculo, tentativas, pendentes, inbox com fencing, outbox idempotente e reserva de resumo semanal.

Também foram publicados:
- `tests/rls_schema_assertions.sql` — assertions de catálogo, RLS, privilégios, funções privilegiadas e isolamento entre dois usuários.
- `tests/sql/bootstrap.sql` — fixture mínima de Auth/roles para PostgreSQL isolado.
- `scripts/test-sql.sh` e comando `npm run test:sql`.
- CI atualizado para executar as migrations e assertions em PostgreSQL 17.

## Validação desta atualização

- [x] Arquivos das cinco migrations conferidos na branch e delimitados por transação.
- [x] Verificação estática confirmou ausência de referências a Pluggy, Mercado Pago, Stripe e billing nas migrations.
- [x] Verificação estática confirmou RLS nas migrations e `search_path` fixo em todas as funções `SECURITY DEFINER`.
- [x] Sintaxe Bash do runner verificada com `bash -n`.
- [ ] Execução efetiva das cinco migrations em PostgreSQL 17.
- [ ] Execução efetiva das assertions SQL e dos testes de isolamento.
- [ ] CI do GitHub concluído com sucesso.
- [ ] Revisão SQL por execução real e validação completa de build, lint, typecheck e testes frontend.
- [ ] Design system e ativos locais completos.

**Limite importante:** as migrations foram publicadas no GitHub, mas ainda não foram executadas em PostgreSQL nesta sessão e não foram aplicadas ao Supabase remoto. A checagem estática não substitui execução SQL. A Fase 2 permanece em andamento; a Fase 3 continua bloqueada.
