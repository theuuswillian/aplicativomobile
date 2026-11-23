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
- [ ] Cinco migrations consolidadas, reproduzíveis e com RLS.
- [ ] Assertions SQL para isolamento, grants e funções privilegiadas.
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
