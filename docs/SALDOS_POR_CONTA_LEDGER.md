# Saldos por conta — GranaViva

## Fonte de verdade

Os saldos por conta devem vir do ledger privado (`private.journal_entries`, `private.journal_lines` e `private.ledger_accounts`), não apenas da projeção local de `transactions`. Operações registradas por RPC — como empréstimos a receber, devoluções, conversões de horas extras e operações de investimento — podem movimentar o ledger sem criar uma linha correspondente em `public.transactions`.

## RPC

A migration `20261125030000_get_account_balances.sql` adiciona `public.get_account_balances(p_as_of date)`:

- Retorna `account_id` e saldo contábil em BRL para as contas do usuário autenticado.
- Soma somente lançamentos com `journal_entries.status = 'posted'`.
- Inclui contas bancárias, dinheiro físico e caixa de investimentos.
- A RPC pública usa `SECURITY INVOKER`; a leitura privilegiada fica em `private.get_account_balances(date)`, com `SECURITY DEFINER`, `auth.uid()` obrigatório, `search_path` fixo e tabelas privadas totalmente qualificadas.
- Não concede leitura direta das tabelas privadas nem acesso a `anon`; somente `authenticated` recebe `USAGE` no schema privado e `EXECUTE` nessa função interna específica.

## Atualização no aplicativo

O aplicativo usa a RPC como fonte preferencial para os saldos exibidos. Se a função ainda não estiver instalada no projeto Supabase remoto, mantém a projeção local existente como fallback. O saldo é atualizado após mudanças em contas, lançamentos, pagamentos de fatura, operações de investimento, recebimentos de proventos e operações do painel de recebíveis/horas extras.

## Aplicação remota

A migration foi adicionada e coberta pelos testes SQL isolados. Ela não é aplicada automaticamente ao projeto Supabase remoto. A aplicação remota exige autorização explícita e deve ocorrer depois de revisar o Preview.
