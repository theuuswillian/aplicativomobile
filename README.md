# GranaViva

Aplicativo gratuito de gestão financeira pessoal, investimentos e automações.

## Stack
- React 19, TypeScript estrito e Vite.
- Supabase Auth, PostgreSQL, RLS, Storage e Edge Functions.
- Vitest, Deno, PostgreSQL 17 e Playwright.

## Princípios
- Recursos iguais para todos, sem planos comerciais ou cobrança.
- RLS e isolamento de dados por usuário.
- Valores monetários exatos; estimativas separadas de valores realizados.
- Segredos exclusivamente no backend.
- Operações concorrentes e webhooks idempotentes.
- Cotações automáticas B3 desativadas até licença escrita adequada; preços manuais não alimentam o Radar.

## Estado de continuidade — 25/11/2026
- PRs #2, #3, #4, #5, #6, #7 e #8 foram mescladas nesta branch `fase-2-fundacao`.
- PR #1 continua draft para consolidação com `main`; o merge está bloqueado por divergência histórica e ainda exige aceite manual final no iPhone.
- Supabase Brasil está `ACTIVE_HEALTHY`, PostgreSQL 17, com 17 migrations e 16 Edge Functions ACTIVE (versão 3).
- A migration de metas de renda passiva da PR #7 ainda não aparece entre as migrations remotas; não considerar esse fluxo publicado no banco até aplicar e validar a migration.
- Preview Vercel desta branch está READY: [abrir GranaViva Preview](https://granaviva-ri31u83iw-grana6.vercel.app), commit `123fe754db88124e976816fc09ae3dc560a9f9dc`.
- A publicação é Preview, não Production. Nenhum deploy de produção foi realizado nesta continuidade.
- Workers e provedores externos dependem de confirmação de secrets e testes controlados. Brapi permanece bloqueada por licença.

Consulte `docs/FASE-3-PLANO-E-STATUS.md` e `docs/CONFIGURACAO-REMOTA-FASE-3.md` para o histórico detalhado.

## Design system (26/11/2026)
- Uma única folha de estilos: `src/styles/app.css`, com tokens em `src/styles/tokens.css` (cores, espaçamento, tipografia, raios, sombras, tema claro/escuro).
- As antigas camadas `styles.css`, `visual-refresh.css`, `quality-overrides.css`, `viewport.css`, `signature.css` e `income-goals.css` foram removidas; não crie novos arquivos de "override".
- Mobile-first: ajustes de tablet/desktop ficam apenas nos `@media (min-width: …)` no fim de `app.css`.

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

Testes de integração devem usar apenas ambientes locais isolados, nunca um projeto Supabase hospedado.
