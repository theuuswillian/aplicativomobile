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
- Não ativar workers nem realizar envios externos reais sem validação controlada.

## Estado real do projeto — 25/11/2026

- Branch de trabalho do backend: `fase-3-backend`.
- PR #2 foi mesclada em `fase-2-fundacao`, não em `main`. PRs #3–#7 também foram mescladas em `fase-2-fundacao`; PR #8 continua aberta e precisa de reconciliação.
- PR #1 continua draft; a branch `main` ainda não recebeu a consolidação da Fase 2/3.
- Supabase Brasil (`dvddqexnvllrxogbwmdf`) está `ACTIVE_HEALTHY`, PostgreSQL 17, com 17 migrations registradas.
- Supabase informa 16 Edge Functions em estado `ACTIVE` (versão 3). Isso confirma publicação das funções, mas não comprova secrets válidos nem testes end-to-end com provedores externos.
- GitHub Actions no commit `a6f27d1504db330d55290c56371e2bd6c7bc7d94`: validate, SQL/PostgreSQL 17, Edge Runtime e integração local Supabase passaram; lockfile foi skipped pelo filtro esperado.
- Vercel tem Preview `READY` no commit `df182b4fa841eb7455f451237e840f3a7ef0b466`. As duas variáveis públicas Supabase foram cadastradas especificamente para Preview da branch `fase-3-backend`; é necessário gerar novo Preview para consumir essas variáveis no build.
- Workers, credenciais externas e testes reais de OpenAI/Meta/Push ainda precisam de confirmação operacional. Production não foi alterada.
- Cotações automáticas continuam bloqueadas por licença; preço manual é a alternativa ativa e não aciona o Radar.

Consulte [docs/FASE-3-PLANO-E-STATUS.md](docs/FASE-3-PLANO-E-STATUS.md) e [docs/CONFIGURACAO-REMOTA-FASE-3.md](docs/CONFIGURACAO-REMOTA-FASE-3.md) para o registro detalhado.

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
