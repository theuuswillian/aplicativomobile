# GranaViva

Aplicativo gratuito de gestão financeira pessoal, investimentos e automações.

## Stack

- React 19, TypeScript estrito e Vite.
- Supabase Auth, PostgreSQL, RLS e Edge Functions.
- Vitest, Deno, PostgreSQL 17 e Playwright para validação.

## Princípios inegociáveis

- Os mesmos recursos para todas as contas cadastradas; sem planos comerciais ou cobrança.
- RLS e isolamento de dados por usuário.
- Valores monetários exatos; estimativas separadas de valores realizados.
- Segredos exclusivamente no backend.
- Operações concorrentes e webhooks idempotentes.
- Não reaproveitar o monólito legado como implementação.
- Nenhuma migration aplicada a banco remoto sem revisão e autorização explícita.

## Estado do projeto

- Fase 2: fundação técnica concluída e aprovada em testes manuais.
- Fase 3: em execução na branch `fase-3-backend`, PR #2 em rascunho.
- Autenticação, preferências, Radar e registro de inscrições Push têm implementação inicial.
- Cotações, envio Push, WhatsApp e fluxos financeiros/IA no frontend ainda têm pendências.
- A Fase 3 não será considerada concluída até o CI integral ficar verde e os testes manuais serem aprovados.

Consulte [docs/FASE-3-PLANO-E-STATUS.md](docs/FASE-3-PLANO-E-STATUS.md) para o registro detalhado e os bloqueios atuais. O contrato integral está em [docs/ARQUITETURA_TRAVADA.md](docs/ARQUITETURA_TRAVADA.md).

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
```

Os testes de integração Supabase e SQL usam apenas ambientes locais isolados:

```bash
bash scripts/test-edge-local.sh
DATABASE_URL=postgresql://... bash scripts/test-sql.sh
```

Não vincule os scripts de teste a um projeto Supabase hospedado.
