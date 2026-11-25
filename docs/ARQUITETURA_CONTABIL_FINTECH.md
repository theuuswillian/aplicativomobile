# Arquitetura Contábil e Financeira — GranaViva

**Status:** implementação na branch `fase-3-backend`; migration ainda não aplicada ao Supabase remoto. Não houve deploy nem alteração em Production.

## 1. Princípios de integridade

- PostgreSQL é a autoridade para contabilização. A UI valida para orientar, mas não decide sozinha se uma movimentação é permitida.
- Valores persistidos usam `numeric(...,2)`; cálculos de domínio no TypeScript usam centavos inteiros/BigInt. Não usar `number` decimal para somar dinheiro.
- Cada evento contabilizado gera um diário de partidas dobradas: soma de débitos = soma de créditos.
- Diários publicados são imutáveis. Correções devem gerar estorno e novo lançamento.
- Triggers executam dentro da mesma transação do evento de origem. Se uma regra falhar, o evento e as partidas são revertidos juntos.
- `ledger_source_state` identifica a origem e o diário ativo para evitar duplicidade em INSERT/UPDATE/DELETE.
- BRL e USD são saldos separados. A conversão cambial explícita não está habilitada; não se mistura valor USD em conta BRL.

## 2. Modelo relacional

### Contas, cartões e lançamentos

- `accounts`: contas bancárias, carteira de dinheiro físico e caixa de corretora (`account_type = investment`). Saldo inicial, data-base e tipo ficam imutáveis após o cadastro; correções exigem lançamento contábil.
- `cards`: limite, fechamento e vencimento.
- `transactions`: eventos de receita, despesa e transferência; forma de pagamento normalizada para `pix`, `debit`, `cash` ou `credit`.
- `card_invoice_installments`: parcelas exatas em centavos, com fechamento e vencimento de cada fatura.
- `card_invoice_payments`: pagamentos parciais/totais, vinculados a cartão, fatura e conta de origem.

### Ledger privado

- `private.ledger_accounts`: contas contábeis para banco, dinheiro, caixa de corretora, passivo de cartão, ativos, recebíveis, receita, despesa e patrimônio inicial.
- `private.journal_entries`: cabeçalho do diário, origem, data e estado.
- `private.journal_lines`: partidas de débito/crédito.
- `private.ledger_source_state`: diário ativo por evento de origem.

As tabelas privadas não são expostas ao cliente. RPCs e triggers com `SECURITY DEFINER` usam `search_path` fixo e validam a titularidade.

### Investimentos e proventos

- `investment_assets`: ações, FIIs, ETFs/BDRs, renda fixa e cripto; moeda do ativo explícita.
- `investment_operations`: operações e posição do ativo.
- `income_events`: proventos anunciados, previstos ou recebidos. Ao confirmar recebimento em BRL, o trigger cria uma receita no ledger, na conta bancária escolhida ou no caixa da corretora.
- Provento USD não é liquidado em conta BRL até existir fluxo de câmbio explícito. Selecionar caixa de corretora significa creditar o caixa da corretora; não compra automaticamente novas cotas/unidades.

### Valores a receber e horas extras

- `receivable_loans`: principal emprestado, pessoa, data e conta de origem.
- `receivable_repayments`: recebimentos parciais/totais, conta de destino e chave de idempotência.
- `overtime_entries`: data, horas, valor-hora, adicional e valor previsto.
- `overtime_conversion_batches`: lote de conversão para recebimento, conta de destino, eventos convertidos e chave de idempotência.

## 3. Regras de contabilização

| Evento | Débito | Crédito | Efeito esperado |
|---|---|---|---|
| Despesa PIX/débito/dinheiro | Despesa | Banco/dinheiro | Reduz liquidez |
| Compra no crédito | Despesa | Passivo do cartão | Não toca conta bancária; consome limite |
| Pagamento de fatura | Passivo do cartão | Banco/dinheiro | Reduz banco e passivo; não cria nova despesa |
| Transferência banco → corretora | Caixa da corretora | Banco | Aporte explícito; não é gasto |
| Resgate corretora → banco | Banco | Caixa da corretora | Só permite até o caixa investido disponível |
| Empréstimo a terceiro | Valores a receber | Banco/dinheiro | Reduz liquidez, não é despesa pessoal |
| Devolução de empréstimo | Banco/dinheiro | Valores a receber | Aumenta liquidez, não é salário |
| Hora extra registrada | Sem diário | Sem diário | Apenas previsão |
| Converter hora extra | Banco/dinheiro | Receita | Só então aumenta saldo e arquiva o ciclo |
| Provento BRL recebido | Banco ou caixa da corretora | Receita de investimento | Crédito conciliado uma única vez |

## 4. Controles no banco

- **Pagamento no cartão:** trigger aloca parcelas e bloqueia compra que exceda o limite disponível. O cartão é bloqueado por linha durante alterações concorrentes.
- **Fechamento:** a compra é alocada à fatura correta, respeitando o dia de fechamento e o último dia de meses curtos.
- **Parcelamento:** total convertido para centavos; divisão inteira e centavos residuais distribuídos na primeira parcela, mantendo a soma exata.
- **Pagamento de fatura:** trava por cartão/fatura, verifica saldo da fatura e rejeita data futura ou pagamento acima do saldo. Pagamento concorrente não consegue ultrapassar o total. Se a data do pagamento for anterior à data-base da conta, a contrapartida usa patrimônio inicial em vez de movimentar novamente o saldo bancário.
- **Firewall de investimentos:** despesa em conta de investimento é rejeitada. Pagamento de fatura, empréstimo e conversão de hora extra não podem usar conta de investimento. Resgate é explícito e não pode exceder o caixa da corretora.
- **Moeda:** partidas de um diário precisam ter a mesma moeda. Não há conversão implícita.
- **Proventos:** recebimento BRL cria transação e diário na mesma transação SQL; o evento recebido fica protegido contra edição/exclusão e a transação vinculada não pode ser apagada isoladamente.
- **Idempotência:** empréstimos, pagamentos, horas extras e conversões usam chaves únicas; operações concorrentes usam locks transacionais.
- **Exclusão de usuário:** limpeza controlada remove o ledger privado e dependências antes das cascatas, sem permitir apagar diários publicados durante o uso normal.

## 5. Serviços e sequência

1. A UI envia o evento com conta/cartão, valor, data e tipo.
2. RLS valida o usuário e as FKs compostas validam que conta, cartão e ativo pertencem ao mesmo usuário.
3. Triggers normalizam forma de pagamento e validam limites, saldo de corretora, moeda e fatura.
4. O serviço interno cria o diário e suas duas partidas.
5. Uma constraint trigger diferida verifica o equilíbrio antes do commit.
6. O estado da origem é atualizado na mesma transação.
7. A UI recarrega os dados; os resumos do ledger são consultados por RPC.

Falha em qualquer etapa cancela a operação inteira. Não há atualização manual de um saldo agregado para tentar compensar um lançamento.

## 6. Interface

Navegação principal em cinco áreas: **Início**, **Cartões**, **Investimentos**, **A Receber & Extras** e **Contas & Relatórios**.

O dashboard separa:
1. **Saldo livre hoje:** apenas contas bancárias e dinheiro físico.
2. **Compromissos & extras:** faturas abertas, empréstimos a receber e horas extras previstas, identificados separadamente.
3. **Patrimônio investido:** caixa da corretora e ativos, com BRL/USD separados e sem entrar na liquidez livre.

O botão **+ Novo lançamento** abre ações rápidas para despesa, receita, transferência/aporte/resgate, empréstimo e hora extra. Na despesa, “Como pagou?” controla a seleção de conta ou cartão.

## 7. Checklist de cenários críticos

- [x] Compra no crédito não altera saldo bancário.
- [x] Compra no crédito aumenta passivo e consome limite disponível.
- [x] Pagamento parcial de fatura reduz banco e passivo sem duplicar despesa.
- [x] Duas tentativas concorrentes não pagam acima do saldo da fatura.
- [x] Pagamento de fatura anterior à data-base da conta não desconta o saldo inicial novamente.
- [x] Despesa PIX não altera caixa de investimentos.
- [x] Despesa em conta de investimento é rejeitada.
- [x] Resgate acima do caixa da corretora é rejeitado.
- [x] Aporte e resgate explícitos atualizam banco e corretora em partidas opostas.
- [x] Alteração direta do saldo inicial é rejeitada.
- [x] Empréstimo reduz liquidez sem aumentar despesas; devolução reduz recebível sem virar salário.
- [x] Horas extras ficam fora do saldo até conversão confirmada.
- [x] Provento BRL recebido é liquidado em banco ou caixa da corretora; provento USD não é misturado com BRL.
- [x] Lançamentos de proventos não podem ser apagados sem preservar o histórico contábil.

Os cenários acima passaram no job PostgreSQL 17 do CI, incluindo RLS, concorrência e constraints. TypeScript estrito, lint, testes, build, browser/responsividade/offline/acessibilidade, Edge Runtime e integração local também passaram no run de CI associado ao commit `595b68c38e9c94ec7985e265b8c6bebc58f26cc3`.

## 8. Ativação e limites operacionais

- Esta implementação está na branch `fase-3-backend` e no PR #2, ainda em rascunho.
- A migration `20261125020000_financial_ledger_and_receivables.sql` **não foi aplicada no Supabase remoto**.
- Não houve merge, deploy, promoção para Production ou alteração remota de dados.
- Antes da ativação, revisar a migration e aplicá-la somente com autorização explícita; depois validar os dados reais e as contas iniciais.
- A liquidação de proventos USD e conversão cambial explícita permanecem fora do escopo atual.
