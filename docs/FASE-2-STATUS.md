# GranaViva — início do projeto

## Estado atual

O repositório foi reservado para a reconstrução do GranaViva. O README e o ponto de entrada HTML já estão versionados.

**Etapa em andamento:** Fase 2 — fundação técnica.

## Regras de implementação

- React 19, TypeScript estrito e Vite no frontend.
- Supabase para autenticação, PostgreSQL, Storage e Edge Functions.
- RLS em todas as tabelas e isolamento por usuário.
- Todos os recursos disponíveis igualmente a todas as contas.
- Segredos exclusivamente no backend.
- Operações financeiras com valores normalizados e projeções separadas de realizados.
- Migrations revisadas e testadas localmente antes de qualquer alteração em banco remoto.
- Não reaproveitar o monólito legado como implementação.

## Próximos itens da fundação

1. Estrutura de pastas, dependências e configurações de build.
2. Design system e ativos locais.
3. Cliente Supabase e tipos de domínio.
4. Cinco migrations consolidadas e políticas RLS.
5. Testes unitários, assertions SQL e CI.

## Validação

O repositório está apenas no início. Não declarar build, testes ou migrations como aprovados até executá-los em ambiente com dependências e PostgreSQL disponíveis.

A Fase 3 só começa após a conclusão e aprovação explícita da Fase 2.
