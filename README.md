# GranaViva

Aplicativo gratuito de gestão financeira pessoal, investimentos e automações.

## Stack

- React 19 + TypeScript estrito
- Vite
- Supabase (Auth, PostgreSQL e Edge Functions)
- Vitest para testes

## Princípios

- Mesmos recursos para todas as contas cadastradas.
- Segurança por usuário com RLS em todas as tabelas.
- Valores monetários normalizados; estimativas separadas de valores realizados.
- Segredos somente no backend.
- Operações concorrentes e processamento assíncrono idempotentes.

## Estado do projeto

Fase 2 — fundação técnica. O contrato funcional e a arquitetura aprovada estão em `docs/ARQUITETURA_TRAVADA.md`. As migrations devem ser revisadas e testadas em ambiente local antes de qualquer aplicação em projeto remoto.

## Desenvolvimento

Requer Node.js 22+ e npm 10+.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env.local`. Nunca exponha segredos no frontend.
