# GranaViva

Aplicativo gratuito de gestão financeira pessoal, investimentos e automações.

## Stack

- React 19, TypeScript estrito e Vite.
- Supabase Auth, PostgreSQL, RLS, Storage e Edge Functions.
- Vitest, Deno, PostgreSQL 17 e Playwright para validação.

## Princípios inegociáveis

- Os mesmos recursos para todas as contas; sem planos comerciais ou cobrança.
- RLS e isolamento de dados por usuário.
- Valores monetários exatos; estimativas separadas de valores realizados.
- Segredos exclusivamente no backend.
- Operações concorrentes e webhooks idempotentes.
- Cotações automáticas B3 desativadas até licença escrita adequada; preços manuais são referências e não alimentam o Radar.
- Nenhuma alteração de produção, ativação de workers ou envio externo real sem validação e autorização específicas.

## Estado real do projeto — 25/11/2026

- A branch de trabalho do backend é `fase-3-backend`; a PR #2 foi mesclada em `fase-2-fundacao`, não em `main`.
- As PRs #3, #4, #5, #6 e #7 também foram mescladas em `fase-2-fundacao`.
- A PR #8 (cadastro de contas e logos bancários) continua aberta e precisa de reconciliação após os merges recentes.
- A PR #1 permanece draft e a branch `main` ainda não recebeu a consolidação da Fase 2/3.
- O CI da Fase 3 no commit `a6f27d1504db330d55290c56371e2bd6c7bc7d94` passou nos jobs validate, SQL/PostgreSQL 17, Edge Runtime e integração Supabase local.
- A aprovação do CI não significa publicação remota: Edge Functions e workers ainda não foram ativados; secrets externos ainda dependem de configuração segura.
- O projeto Supabase brasileiro e a configuração de Vercel devem ser conferidos nos painéis antes de qualquer deploy. Production permanece preservada.

Consulte [docs/FASE-3-PLANO-E-STATUS.md](docs/FASE-3-PLANO-E-STATUS.md) para o registro de execução e pendências verificadas. Consulte [docs/CONFIGURACAO-REMOTA-FASE-3.md](docs/CONFIGURACAO-REMOTA-FASE-3.md) para os gates de implantação.

## Desenvolvimento

Requer Node.js 22+ e npm 11.21.2+.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Configure somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no cliente. Nunca use `service_role`, tokens administrativos ou segredos em variáveis `VITE_*`.

## Validação local

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
bash scripts/test-edge-local.sh
DATABASE_URL=postgresql://... bash scripts/test-sql.sh
```

Os testes de integração devem usar apenas ambientes locais isolados, nunca um projeto Supabase hospedado.
