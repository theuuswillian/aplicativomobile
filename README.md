# GranaViva

Aplicativo gratuito de gestão financeira pessoal, investimentos e automações.

## Stack

- React 19, TypeScript estrito e Vite.
- Supabase: Auth, PostgreSQL, Storage e Edge Functions.
- Vitest para testes unitários.

## Princípios inegociáveis

- Os mesmos recursos para todas as contas cadastradas; sem planos comerciais ou cobrança.
- RLS e isolamento de dados por usuário.
- Valores monetários exatos; estimativas separadas de valores realizados.
- Segredos exclusivamente no backend.
- Operações concorrentes e webhooks idempotentes.
- Não reaproveitar o monólito legado como implementação.
- Nenhuma migration aplicada a banco remoto sem revisão e autorização explícita.

## Estado

Fase 2 — fundação técnica em andamento. Consulte [docs/FASE-2-STATUS.md](docs/FASE-2-STATUS.md) para acompanhar os itens concluídos, validações executadas e bloqueios restantes. O contrato integral, as fontes locais, o ícone e o shell PWA estão publicados na branch de trabalho.

## Desenvolvimento

Requer Node.js 22+ e npm 10+.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Configure somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no cliente. Nunca use `service_role`, tokens administrativos ou segredos em variáveis `VITE_*`.
