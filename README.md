# GranaViva

Aplicativo gratuito de gestão financeira pessoal, investimentos e automações.

## Stack

- React 19 + TypeScript estrito + Vite
- Supabase: Auth, PostgreSQL, Storage e Edge Functions
- Vitest para testes

## Princípios

- Os mesmos recursos para todas as contas cadastradas.
- Segurança por usuário com RLS em todas as tabelas.
- Valores monetários normalizados; estimativas separadas de valores realizados.
- Segredos exclusivamente no backend.
- Operações concorrentes e processamento assíncrono idempotentes.
- Nenhuma alteração em banco remoto sem revisão e aprovação explícita.

## Estado

A Fase 2 (fundação técnica) está em andamento. O status e os próximos critérios estão em [docs/FASE-2-STATUS.md](docs/FASE-2-STATUS.md).

## Desenvolvimento

Requer Node.js 22+ e npm 10+.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env.local`. Nunca exponha chaves secretas no frontend.
