# ARQUITETURA TRAVADA — GranaViva

**Versão:** 1.0  
**Fase:** 1 — auditoria e constituição da arquitetura  
**Base de análise:** `grana-viva-rebuild-grana-viva-next.zip` (222 entradas)  
**Status:** contrato proposto para aprovação; nenhuma aplicação foi implementada nesta fase.

---

## 1. Objetivo e regras de governo

O GranaViva será um aplicativo de gestão financeira pessoal, investimentos e automações, integralmente gratuito para todas as contas cadastradas.

Este documento é o contrato funcional e técnico para as próximas fases. A implementação deverá:

1. liberar as mesmas funcionalidades para todos os usuários autenticados;
2. não criar cobrança, níveis comerciais, tela de venda, bloqueio de recursos por categoria de usuário ou dependência de provedor financeiro externo;
3. preservar a semântica financeira observada no legado, corrigindo apenas inconsistências documentadas e cobertas por testes;
4. manter segredos exclusivamente no backend;
5. aplicar RLS a todas as tabelas e validar isolamento entre usuários;
6. executar operações concorrentes e webhooks com idempotência;
7. não tratar estimativas como valores realizados;
8. não adicionar funcionalidades fora deste contrato sem autorização explícita.

### 1.1 Regra de gratuidade e uso justo

- Todos os módulos, automações e recursos de IA estarão disponíveis a qualquer usuário cadastrado.
- Não haverá diferenciação de recursos por plano ou estado comercial.
- O controle de uso da IA será operacional, uniforme e não comercial: limites técnicos por minuto/hora, cotas diárias e mensais por tipo de operação, proteção contra concorrência e bloqueio temporário em caso de abuso.
- Os limites exatos serão configuráveis no servidor e definidos na Fase 2, após estimativa de custo e testes de carga. Não serão copiados limites comerciais históricos.
- Atingir uma cota nunca converterá a conta em modalidade paga nem esconderá módulos. A interface informará quando a janela de uso será renovada.
- Operações sem IA, consulta de dados próprios e recursos financeiros convencionais não serão limitados por cotas de IA.

---

## 2. Auditoria do material legado

### 2.1 Fontes examinadas

Foram inventariados os 222 itens do arquivo compactado. A análise funcional e técnica utilizou:

- `MONITORAMENTO.md`;
- documentação de auditoria, plano de evolução, arquitetura/segurança, decisões e runbook operacional;
- `design-system.css` e `visual-reference.css`;
- fontes das Edge Functions de IA, conta, cotações, radar, notificações e WhatsApp;
- migrations SQL e fixtures/assertions de segurança, cotas, fila e outbox;
- código monolítico legado exclusivamente como fonte de regras e estruturas de dados, sem reaproveitamento do arquivo;
- `manifest.webmanifest`, fontes locais, ícones, imagens e diretório de logos.

Os arquivos históricos ligados a recursos retirados e o código monolítico não fazem parte da nova implementação. O documento não depende de copiá-los.

### 2.2 Inventário visual

O ZIP contém:

- 32 imagens de instituições financeiras e corretoras;
- 3 arquivos locais de fonte Inter (`400`, `600`, `700`);
- 4 ícones PWA (apple touch, 192, 512 e maskable 512);
- 13 imagens da landing page e demonstrações de funcionalidades;
- manifesto PWA;
- duas folhas de estilo de referência.

Os 32 logos serão preservados como arquivos de imagem, com nomes internos neutros no novo repositório. As fontes e imagens serão copiadas para `public/` na Fase 2, sem dependência de CDN para esses ativos.

### 2.3 Direção visual consolidada

A referência visual mais recente é o tema **All Black**:

- fundo principal próximo de `#07090B`;
- superfícies grafite próximas de `#111316` e `#0B0D10`;
- texto principal claro e texto secundário com contraste suficiente;
- verde como cor principal de ação, sem excesso de cores de destaque;
- cartões discretos, bordas sutis, hierarquia tipográfica adulta;
- layout mobile-first, com atenção especial a telas pequenas e áreas seguras de dispositivos;
- tema claro também disponível;
- foco visível, teclado funcional, rótulos acessíveis e contraste mínimo WCAG AA de 4,5:1 para texto normal.

Os valores acima são referências visuais, não substituem a verificação matemática de contraste de cada combinação de tokens.

---

## 3. Regras de negócio consolidadas

### 3.1 Contas e instituições

- O usuário pode cadastrar várias contas, cada uma com nome, instituição, código, tipo, saldo inicial, data de referência e indicação de conta principal ou arquivada.
- A conta pode usar um dos 32 logos locais.
- O saldo atual é derivado do saldo inicial e dos lançamentos efetivos vinculados à conta.
- Transferências entre contas movimentam os saldos de origem e destino, mas não são receita nem despesa consolidada.
- Contas arquivadas permanecem no histórico e não podem ser selecionadas por padrão em novos lançamentos.
- Não se deve inferir saldo inicial a partir de lançamentos sem uma regra de conciliação explícita.

### 3.2 Lançamentos

Tipos de lançamento: `receita`, `despesa` e `transferencia`.

Campos de domínio identificados no legado: identificador, data, valor, tipo, descrição, categoria, subcategoria, observações, tags, estado, conta, cartão, origem/destino de transferência, forma, anexos, valor quitado, data de quitação, parcelas, agrupador, vínculo com operação de investimento e metadados de importação.

Regras:

- Valores monetários serão armazenados em centavos inteiros (`bigint`) ou `numeric(14,2)`; o frontend nunca fará aritmética financeira com ponto flutuante sem normalização.
- Valores são armazenados como magnitude positiva; o tipo define o sentido financeiro.
- Estados suportados: `pago`, `previsto` e `cancelado`. Na ausência de estado em dados antigos, o comportamento equivalente é `pago`.
- Lançamentos cancelados não afetam saldos, faturas, orçamento ou relatórios.
- Lançamentos previstos aparecem em projeções, mas não entram em totais realizados.
- Receitas e despesas afetam o fluxo do período conforme a data e o estado; transferências não aumentam receitas/despesas.
- Estornos e ajustes devem manter vínculo com o lançamento original quando aplicável, sem apagar o histórico.
- A edição de valor, data ou conta deve recalcular os agregados derivados.
- Datas de negócio usam `America/Sao_Paulo`; timestamps técnicos são UTC.
- Categorias iniciais de despesa: Moradia, Alimentação, Transporte, Lazer, Saúde, Educação e Outros, além das categorias adicionais legadas.
- Categorias iniciais de receita: Salário, Horas extras, Freelance, Vendas, Reembolso, Aluguel recebido, Presentes recebidos, Aposentadoria, Dividendos, Bônus/Promoções, Rendimentos e Outros.
- O usuário pode criar e personalizar categorias; a IA só pode escolher categorias existentes para aquele usuário.

### 3.3 Recorrências e contas fixas

- Frequências observadas: diária, semanal, quinzenal, mensal, anual e intervalo configurável.
- A regra recorrente mantém valor, tipo, categoria, dia/frequência, início, fim, forma e conta/cartão opcional.
- A geração de ocorrências deve ser idempotente por regra e período.
- Uma ocorrência gerada pode ser prevista ou confirmada; projeção e realizado permanecem separados.
- Cobranças identificadas como recorrentes não são automaticamente confirmadas sem a regra de negócio apropriada.
- O usuário pode pausar, editar ou encerrar uma recorrência sem apagar ocorrências históricas.

### 3.4 Cartões, faturas e parcelas

- Um cartão possui nome, instituição, final do cartão, limite, dia de fechamento, dia de vencimento, bandeira, aparência e parâmetros opcionais de juros/multa.
- Compras no cartão são vinculadas ao cartão e ao ciclo de fatura correspondente.
- A fatura pode estar aberta, fechada, parcialmente quitada, vencida, quitada ou cancelada.
- Saldo pendente da fatura é o total devido menos valores quitados, limitado a zero.
- O saldo livre deve descontar o saldo pendente de todas as faturas abertas, fechadas, vencidas ou parciais. Faturas quitadas/canceladas e parcelas futuras ainda não cobradas não entram nesse desconto.
- A quitação de fatura não pode contar novamente as compras como despesa: a compra é a despesa; a quitação da fatura é liquidação de passivo.
- Parcelas futuras devem ser distribuídas nos ciclos corretos e não podem ser somadas à fatura atual antes da cobrança.
- Compras parceladas guardam valor total, quantidade de parcelas, número da parcela, grupo de parcelas e datas de cada ocorrência.
- Importações de extrato podem reconhecer parcelas pela descrição, mas devem apresentar revisão e evitar duplicar parcelas já registradas.
- Casos de múltiplas faturas antigas, quitações parciais, atraso, quitação excedente e parcelas futuras precisam de testes de regressão.

### 3.5 Orçamentos e metas

- Orçamentos são mensais e organizados por categoria; o usuário define limites e acompanha gasto realizado e previsto separadamente.
- O sistema deve sinalizar marcos de 80% e 100% do limite, sem duplicar notificações.
- Preferências permitem desligar alertas por categoria (faturas, contas fixas, previstos e orçamentos) e escolher antecedência de aviso entre os valores suportados pelo legado.
- Alertas diários cobrem faturas vencendo/atrasadas, contas fixas, lançamentos previstos e devoluções de empréstimos a receber; versões discretas omitem valores, nomes e categorias na tela bloqueada.
- O lembrete “dia de guardar” ocorre a partir do dia mensal configurado (1 a 28), uma vez por meta/mês, somente enquanto o aporte realizado no mês estiver abaixo do aporte planejado e a meta não tiver sido atingida.
- Metas possuem nome, valor-alvo, valor atual, aporte mensal, prazo e premissas opcionais de rendimento.
- A evolução da meta usa aportes efetivamente registrados; projeções devem ser identificadas como estimativas.
- Uma alocação de ativo entre metas não pode ultrapassar 100% do ativo.
- A meta mensal de renda passiva é independente das metas financeiras comuns e usa proventos efetivamente recebidos no cálculo de progresso.
- Projeções de capital e aporte linear precisam exibir premissas e não podem prometer rentabilidade.

### 3.6 Patrimônio, bens, dívidas e empréstimos a receber

- O patrimônio líquido consolida saldos de contas, posições de investimento e bens, subtraindo passivos e dívidas.
- Bens suportados no legado: imóvel, veículo e outros.
- Passivos suportados: empréstimo, financiamento, dívida e outros, com saldo, parcela, juros e quantidade de parcelas restantes.
- O histórico mensal registra fotografias de ativos e passivos, sem substituir os dados transacionais.
- Empréstimos a receber guardam pessoa, telefone opcional, previsão, observações e modo de devolução.
- Movimentações ligadas a empréstimos são rastreadas por lançamentos vinculados; transferências entre pessoas não são automaticamente despesas.
- Perdão de dívida segue a escolha explícita do usuário: baixa patrimonial ou despesa, sem misturar os dois comportamentos.
- Correções retroativas não podem alterar silenciosamente o saldo de uma conta.

### 3.7 Investimentos

Classes suportadas: ações, FIIs, ETFs, BDRs, renda fixa e criptoativos.

- A carteira mantém ativos, ticker/identificador, nome, classe, quantidade, preço de referência e dados de proventos.
- O livro de operações é a fonte de verdade para posições e custo: posição inicial, compra, venda e provento; eventos adicionais devem ser modelados explicitamente quando aplicáveis.
- Operações são ordenadas pela data efetiva, não pela ordem de cadastro.
- Preço médio, quantidade, custo total, patrimônio e retorno precisam ser reproduzíveis a partir do histórico.
- Vendas parciais reduzem quantidade e custo proporcionalmente segundo a metodologia aprovada nos testes.
- Proventos anteriores à entrada na posição não podem ser atribuídos à posição atual.
- Quando existe histórico de operações, a quantidade efetivamente detida na data do provento é obrigatória; quantidade zero significa provento atribuível zero.
- Posições manuais sem histórico podem usar a quantidade atual como compatibilidade, identificada como tal.
- Renda fixa separa valores realizados de estimativas baseadas em indexadores.
- Proventos anunciados, previstos e recebidos devem permanecer estados distintos.
- Cotação sempre exibe preço, fonte e horário/data de referência; preço antigo é fallback identificado, não cotação atual.
- Não serão incluídas recomendações automáticas de compra/venda.

### 3.8 Radar de preços e notificações

- O usuário acompanha ativos mesmo sem possuí-los.
- Tipos de alerta observados: preço acima de um alvo, preço abaixo de um alvo e queda percentual no dia.
- Cada alerta possui identificador e geração; reativar incrementa a geração.
- Um alerta dispara uma vez por geração. O evento é persistido para sincronizar o estado entre dispositivos.
- O Radar suporta ativos da B3 e criptoativos.
- As notificações podem ser discretas, sem ticker ou valor na tela bloqueada.
- O usuário pode desligar alertas sem perder a configuração do Radar.
- Push utiliza inscrição por dispositivo, chave pública/privada VAPID no servidor e remoção de endpoints inválidos (404/410).
- O log de notificações impede envio repetido da mesma chave.
- Nenhuma cota comercial ou quantidade por plano será aplicada ao Radar.

### 3.9 Importação de CSV e OFX

- A importação ocorre localmente com prévia antes da gravação.
- O usuário escolhe conta/cartão de destino, mapeia colunas, classifica e revisa.
- FITID é a chave preferencial de idempotência quando presente.
- Sem identificador bancário, a chave considera destino, data, valor e descrição normalizada.
- Dois lançamentos distintos com mesmo valor e dia não devem ser descartados automaticamente.
- FITID duplicado dentro do mesmo arquivo deve ser sinalizado para revisão.
- Histórico mantém até 50 lotes com formato, data, destino e contagens de importados, vinculados, recebidos e ignorados.
- Desfazer lote remove somente registros novos que ainda correspondam ao snapshot pós-importação; registros editados depois são preservados.
- Conciliação de saldo inicial/final é opcional; divergência deve ser exibida e reconhecida antes da confirmação.
- O mapeamento manual de colunas não grava dados até a confirmação final.

### 3.10 Inteligência artificial

#### Lançamento por frase

- Interpreta texto em português brasileiro, inclusive erros de digitação/ditado e datas relativas.
- Extrai um lançamento de receita ou despesa, valor em reais, data, descrição, categoria existente, forma, parcelas e recorrência.
- Pergunta, cumprimento ou texto sem valor não vira lançamento.
- A confiança é retornada para apoiar revisão; não substitui confirmação humana.
- Valor total de compra parcelada é extraído como total da compra.

#### Leitura de comprovante

- Aceita foto, PDF e comprovantes/recibos; valida tamanho real, MIME e identidade dos bytes antes de enviar à IA.
- Limite de arquivo observado no legado: 5 MB.
- Extrai o lançamento principal, incluindo valor total, data, tipo, descrição, categoria, forma, parcelas e cartão quando reconhecido.
- A tela de revisão permite corrigir dados antes de gravar.
- Extratos e faturas são um modo distinto: extrai até 1.500 linhas, preserva a descrição, sinaliza entradas/saídas, reconhece recorrências prováveis e identifica se o documento é fatura.
- Não extrai saldos, limites, totais de resumo, juros futuros ou parcelas futuras ainda não cobradas.
- A importação de extrato é uma prévia revisável; não grava automaticamente as linhas retornadas.

#### Assistente contextual

- O frontend calcula fatos financeiros localmente a partir dos dados do usuário e envia apenas pergunta, fatos necessários e até três pares recentes de conversa.
- A IA redige a resposta; não cria, altera ou exclui dados.
- A resposta deve usar somente números presentes nos fatos ou na pergunta.
- Se faltarem dados, deve dizer isso claramente e marcar `suficiente=false`.
- Máximo de três frases curtas, em português brasileiro, sem promessas de rendimento ou recomendação de ativo específico.
- Se a resposta contiver número não presente nos fatos/pergunta, é descartada e o frontend apresenta os fatos calculados.

#### Validação e segurança de IA

- Nenhuma resposta de IA é confiável por padrão.
- Validar objeto JSON, campos obrigatórios, tipos, enums, categorias permitidas, valores finitos e positivos, datas reais e janela temporal, descrição sanitizada e número de parcelas.
- Limites observados como baseline de segurança: valor máximo R$ 10.000.000, descrição até 80 caracteres, parcelas entre 1 e 48, data de até cinco anos para trás e até 366 dias à frente; a política final poderá ser ajustada por teste e aprovação.
- Entrada do usuário é tratada como dado, nunca como instrução de sistema; remover delimitadores perigosos e limitar tamanho.
- Segredos e respostas brutas do provedor não podem ser registrados nos logs.
- Falha de IA não pode criar lançamento parcial nem consumir cota se a operação não for concluída com sucesso.
- O contador mensal é separado por tipo de operação (frase, comprovante, extrato e WhatsApp); o incremento é atômico e só ocorre após resposta válida/sucesso. Limites diários e rate limits por hora são proteções técnicas adicionais, também uniformes.

### 3.11 WhatsApp

#### Vinculação

- O usuário autenticado solicita código temporário de seis dígitos.
- Código vale 15 minutos e é associado a um único usuário.
- Um telefone só pode estar vinculado a uma conta e uma conta só pode ter um telefone vinculado.
- Limite observado: 10 tentativas por telefone em janela de 15 minutos; bloqueio temporário após exceder.
- O código é consumido atomicamente no vínculo.
- A tela mostra número mascarado, estado do vínculo e preferência de resumo semanal.
- Desvincular remove vínculo e lançamentos pendentes, preservando o histórico financeiro já confirmado.

#### Webhook de entrada

- Validar autenticidade HMAC do provedor antes de processar o corpo.
- Responder à verificação GET conforme protocolo do provedor.
- Deduplicar pelo identificador estável da mensagem.
- Persistir mensagem recebida antes do processamento, com status, tentativas, lease e erro sanitizado.
- Lease de referência do legado: 180 segundos; aceitar intervalo configurável de 30 a 900 segundos.
- Fila recuperável retoma mensagens com lease expirado; limite de tentativas observado: 8.
- Mensagem esgotada permanece preservada para análise, sem loop infinito de respostas temporárias.
- Texto, imagem, áudio, PDF e CSV são validados por tipo e tamanho.
- A IA pode classificar a mensagem como lançamento, pergunta ou conversa.
- Perguntas consultam os próprios dados do usuário; consultas não são lançamentos.
- Lançamentos ficam pendentes e exigem confirmação explícita no WhatsApp antes de gravar.
- Gravação dos lançamentos, consumo de uso justo e remoção do pendente ocorrem em uma única transação.
- Confirmações repetidas não podem criar lançamentos duplicados.

#### Outbox de saída

- Toda mensagem de saída passa por outbox persistente com chave idempotente, destinatário, payload, status, tentativas, lease e identificador do provedor.
- Lease de referência: 90 segundos; timeout HTTP de referência: 15 segundos.
- Estados: `enviando`, `enviada`, `falhou_segura`, `falhou` e `incerta`.
- HTTP 429 é falha segura e pode ser tentada novamente.
- HTTP 5xx, timeout, crash ou lease expirado são resultados ambíguos; marcar `incerta` e não reenviar automaticamente.
- Reutilizar uma chave com destinatário ou payload divergente é rejeitado.
- Registros incertos exigem reconciliação com o provedor antes de qualquer reenvio manual.
- A semântica é at-most-once em resultado ambíguo; não prometer exactly-once.

#### Resumo semanal

- Envio automático na segunda-feira às 08:00, horário de Brasília.
- Preferência individual pode ser ligada/desligada.
- Reserva da semana ocorre antes do envio para impedir duplicidade.
- Conteúdo considera receitas, despesas, saldo, vencimentos e compromissos do período, sem revelar dados sensíveis em notificações discretas.
- O processamento em lotes é recuperável e idempotente.

### 3.12 Conta, privacidade e LGPD

- Perfil contém dados mínimos de identificação e preferências.
- Exportação entrega dados estruturados do usuário, metadados da conta e inventário dos comprovantes.
- Segredos criptografados não são exportados em texto aberto.
- Exclusão exige confirmação explícita e remove arquivos do Storage, linhas associadas e identidade de autenticação.
- O identificador do usuário é sempre extraído do token validado no servidor; nunca confiar em `user_id` enviado no corpo.
- Operações de exportação/exclusão possuem rate limit técnico.
- Falhas parciais informam o que foi concluído e permitem reconciliação segura; não mascarar exclusão incompleta como sucesso.

---

## 4. Modelo de dados canônico

### 4.1 Convenções

- Todas as tabelas de usuário têm `user_id uuid not null references auth.users(id) on delete cascade`, salvo tabelas globais de cache e tabelas internas com chave natural.
- Todas as tabelas têm `created_at` e `updated_at` quando fizer sentido.
- PKs são UUID, exceto chaves idempotentes naturais (mensagens, outbox, tickers e buckets).
- Valores monetários: `numeric(14,2)` no banco; conversão para centavos inteiros nos cálculos do domínio.
- Datas de negócio: `date`; eventos técnicos: `timestamptz`.
- JSONB fica restrito a payloads externos, metadados não relacionais e configurações; entidades financeiras centrais terão colunas tipadas.
- Todas as tabelas ativam RLS. Tabelas internas sem acesso direto do cliente também revogam grants de `anon` e `authenticated`.
- Toda função `SECURITY DEFINER` usa `search_path = pg_catalog, public`, valida parâmetros e tem EXECUTE revogado de papéis públicos, liberado somente a `service_role` quando necessário.

### 4.2 Tabelas por domínio

#### Identidade e preferências

**`profiles`**
- `id uuid PK references auth.users(id) on delete cascade`
- `display_name text`, `avatar_url text`, `locale text default 'pt-BR'`
- `timezone text default 'America/Sao_Paulo'`
- `created_at`, `updated_at`

**`settings`**
- `user_id uuid PK`
- `theme text`, `accent text`, `currency text default 'BRL'`
- `whatsapp_weekly_summary boolean default true`
- `push_enabled boolean default false`
- `quiet_notifications boolean default true`
- `financial_preferences jsonb` para preferências não relacionais e compatibilidade controlada.

#### Núcleo financeiro

**`accounts`**
- `id uuid PK`, `user_id uuid FK`
- `name text`, `institution_name text`, `institution_code text`
- `institution_logo_key text`, `account_type text`
- `opening_balance numeric(14,2)`, `opening_balance_date date`
- `is_primary boolean`, `is_archived boolean`, `archived_at timestamptz`
- `created_at`, `updated_at`

**`cards`**
- `id uuid PK`, `user_id uuid FK`
- `account_id uuid FK nullable`
- `name text`, `institution_name text`, `last_four char(4)`
- `brand text`, `credit_limit numeric(14,2)`
- `closing_day smallint`, `due_day smallint`
- `interest_rate numeric(7,4)`, `late_fee_rate numeric(7,4)`, `monthly_interest_rate numeric(7,4)`
- `is_archived boolean`, `created_at`, `updated_at`

**`categories`**
- `id uuid PK`, `user_id uuid FK`
- `name text`, `kind text check in ('income','expense')`
- `color text`, `icon text`, `is_default boolean`
- `created_at`, `updated_at`
- Unique `(user_id, kind, normalized_name)`.

**`transactions`**
- `id uuid PK`, `user_id uuid FK`
- `kind text check in ('income','expense','transfer')`
- `status text check in ('paid','planned','cancelled')`
- `amount numeric(14,2)`, `transaction_date date`, `description text`
- `category_id uuid FK nullable`, `subcategory text`, `notes text`, `tags text[]`
- `account_id uuid FK nullable`, `card_id uuid FK nullable`
- `transfer_from_account_id uuid FK nullable`, `transfer_to_account_id uuid FK nullable`
- `payment_method text`, `settled_amount numeric(14,2)`, `settled_at date`
- `installment_group_id uuid nullable`, `installment_number smallint`, `installment_count smallint`
- `recurrence_id uuid nullable`, `import_batch_id uuid nullable`
- `investment_operation_id uuid nullable`
- `source text`, `external_reference text nullable`
- `created_at`, `updated_at`
- Índices por `(user_id, transaction_date)`, `(user_id, status)`, conta/cartão e grupos de parcelas.
- CHECKs garantem valor positivo, tipo coerente e origem/destino diferentes em transferência.

**`recurrence_rules`**
- `id uuid PK`, `user_id uuid FK`
- `name text`, `kind text`, `amount numeric(14,2)`, `category_id uuid FK`
- `frequency text`, `interval_count integer`, `weekday smallint`, `month_day smallint`, `month_of_year smallint`
- `starts_on date`, `ends_on date nullable`, `next_occurrence_on date`
- `account_id uuid nullable`, `card_id uuid nullable`, `payment_method text`
- `is_active boolean`, `created_at`, `updated_at`
- Unique idempotente por regra e data de ocorrência em `transactions`.

**`budgets`**
- `id uuid PK`, `user_id uuid FK`, `category_id uuid FK`
- `year smallint`, `month smallint`, `limit_amount numeric(14,2)`
- `created_at`, `updated_at`
- Unique `(user_id, category_id, year, month)`.

**`goals`**
- `id uuid PK`, `user_id uuid FK`
- `name text`, `target_amount numeric(14,2)`, `current_amount numeric(14,2)`
- `monthly_contribution numeric(14,2)`, `target_month date`
- `yield_assumption numeric(8,4) nullable`, `use_index_assumption boolean`
- `created_at`, `updated_at`

**`goal_contributions`**
- `id uuid PK`, `user_id uuid FK`, `goal_id uuid FK`
- `transaction_id uuid nullable`, `amount numeric(14,2)`, `contribution_date date`
- `source text`, `created_at`

**`tangible_assets`**
- `id uuid PK`, `user_id uuid FK`
- `name text`, `asset_type text`, `current_value numeric(14,2)`
- `created_at`, `updated_at`

**`liabilities`**
- `id uuid PK`, `user_id uuid FK`
- `name text`, `liability_type text`, `outstanding_amount numeric(14,2)`
- `installment_amount numeric(14,2)`, `interest_rate numeric(8,4)`, `installments_remaining integer`
- `created_at`, `updated_at`

**`net_worth_snapshots`**
- `id uuid PK`, `user_id uuid FK`, `reference_month date`
- `assets_total numeric(14,2)`, `liabilities_total numeric(14,2)`, `net_worth numeric(14,2)`
- `details jsonb`, `created_at`
- Unique `(user_id, reference_month)`.

**`receivables`**
- `id uuid PK`, `user_id uuid FK`
- `person_name text`, `phone text nullable`, `expected_date date nullable`
- `notes text`, `repayment_mode text`, `created_at`, `updated_at`.

#### Importação e arquivos

**`import_batches`**
- `id uuid PK`, `user_id uuid FK`
- `format text check in ('CSV','OFX')`, `destination_type text`, `destination_id uuid`
- `file_name text`, `imported_count integer`, `linked_count integer`, `ignored_count integer`
- `status text`, `undone_at timestamptz`, `created_at`.

**`import_items`**
- `id uuid PK`, `user_id uuid FK`, `batch_id uuid FK`, `transaction_id uuid nullable`
- `dedupe_key text`, `source_reference text nullable`, `snapshot jsonb`
- `result text`, `created_at`
- Unique `(user_id, destination_type, destination_id, dedupe_key)`.

**`receipt_files`**
- `id uuid PK`, `user_id uuid FK`, `transaction_id uuid FK`
- `storage_path text`, `mime_type text`, `byte_size bigint`, `sha256 text`
- `created_at`
- Storage privado com caminho iniciado pelo UUID do usuário.

#### Investimentos e radar

**`investment_assets`**
- `id uuid PK`, `user_id uuid FK`
- `symbol text`, `name text`, `asset_class text check in ('stock','fii','etf','bdr','fixed_income','crypto')`
- `currency text default 'BRL'`, `quantity numeric(24,8)`, `average_cost numeric(18,8)`
- `current_price numeric(18,8) nullable`, `price_as_of timestamptz nullable`
- `metadata jsonb`, `created_at`, `updated_at`
- Unique `(user_id, asset_class, symbol)`.

**`investment_operations`**
- `id uuid PK`, `user_id uuid FK`, `asset_id uuid FK`
- `operation_type text check in ('opening','buy','sell','income','bonus','split','amortization')`
- `operation_date date`, `quantity numeric(24,8)`, `unit_price numeric(18,8)`
- `gross_amount numeric(14,2)`, `fees numeric(14,2)`, `net_amount numeric(14,2)`
- `transaction_id uuid nullable`, `account_id uuid nullable`, `created_at`
- Índice `(user_id, asset_id, operation_date, created_at)`.

**`income_events`**
- `id uuid PK`, `user_id uuid FK`, `asset_id uuid FK`
- `event_type text`, `reference_date date`, `payment_date date nullable`
- `announced_amount numeric(14,2)`, `received_amount numeric(14,2)`, `status text`
- `created_at`, `updated_at`.

**`quote_cache`**
- `symbol text PK`, `payload jsonb`, `saved_at timestamptz`
- Acesso exclusivo de backend.

**`radar_alerts`**
- `id uuid PK`, `user_id uuid FK`, `asset_class text`, `symbol text`, `provider_asset_id text nullable`
- `condition_type text check in ('above','below','daily_drop')`
- `threshold numeric(18,8)`, `generation integer`, `created_at`, `is_enabled boolean`
- Índice por usuário e símbolo.

**`radar_fires`**
- `user_id uuid FK`, `alert_key text`, `fired_at timestamptz`, `observed_price numeric(18,8)`
- PK `(user_id, alert_key)`.

**`push_subscriptions`**
- `id uuid PK`, `user_id uuid FK`, `endpoint text unique`
- `p256dh text`, `auth_key text`, `user_agent text`, `created_at`, `updated_at`.

**`push_deliveries`**
- `user_id uuid FK`, `delivery_key text`, `created_at`
- PK `(user_id, delivery_key)`.

#### Uso justo, limites técnicos e observabilidade

**`ai_usage`**
- `user_id uuid FK`, `usage_date date`, `usage_kind text`, `count integer`
- PK `(user_id, usage_date, usage_kind)`.
- Incremento mensal atômico com lock transacional por usuário/tipo/mês.

**`rate_limit_buckets`**
- `user_id uuid FK`, `key text`, `window_start bigint`, `count integer`
- PK `(user_id, key, window_start)`.

**`function_errors`**
- `id bigint identity PK`, `occurred_at timestamptz`, `function_name text`
- `stage text`, `error_code text nullable`, `sanitized_message text`.
- Sem acesso direto do cliente; retenção operacional definida por job.

#### WhatsApp

**`whatsapp_links`**
- `user_id uuid PK`, `phone text unique`, `created_at timestamptz`
- `weekly_summary_enabled boolean`, `last_summary_week date nullable`.

**`whatsapp_link_codes`**
- `code text PK`, `user_id uuid FK`, `expires_at timestamptz`, `created_at`.

**`whatsapp_link_attempts`**
- `phone text PK`, `window_started_at timestamptz`, `attempts smallint`
- `blocked_until timestamptz nullable`, `updated_at timestamptz`.

**`whatsapp_pending_transactions`**
- `id text PK`, `user_id uuid FK`, `phone text`
- `payload jsonb`, `source_message_id text`, `status text`, `created_at`, `expires_at`.

**`whatsapp_inbox`**
- `message_id text PK`, `status text`, `lease_token uuid nullable`
- `lease_until timestamptz nullable`, `attempts integer`, `last_error text nullable`
- `created_at`, `completed_at timestamptz nullable`.

**`whatsapp_outbox`**
- `idempotency_key text PK`, `phone text`, `payload jsonb`, `status text`
- `lease_token uuid nullable`, `lease_until timestamptz nullable`
- `attempts integer`, `provider_message_id text nullable`, `last_error text nullable`
- `created_at`, `updated_at`.

### 4.3 Relacionamentos principais

- `auth.users 1:1 profiles`, `settings`.
- `auth.users 1:N accounts`, `cards`, `categories`, `transactions`, `recurrence_rules`, `budgets`, `goals`, `tangible_assets`, `liabilities`, `net_worth_snapshots`, `receivables`, `investment_assets`, `investment_operations`, `income_events`, `radar_alerts`, `push_subscriptions`.
- `accounts 1:N transactions`; `cards 1:N transactions`.
- `categories 1:N transactions` e `categories 1:N budgets`.
- `recurrence_rules 1:N transactions`.
- `goals 1:N goal_contributions`; `transactions 0..1:N goal_contributions`.
- `investment_assets 1:N investment_operations` e `investment_assets 1:N income_events`.
- `transactions 1:N receipt_files`; um lançamento pode ter múltiplos comprovantes.
- `import_batches 1:N import_items`; `import_items` pode referenciar uma transação.
- `radar_alerts 1:N radar_fires` por geração/chave.
- WhatsApp: `auth.users 1:0..1 whatsapp_links`; `whatsapp_links 1:N whatsapp_pending_transactions`.
- Inbox e outbox usam chaves idempotentes independentes e não dependem de acesso do cliente.

### 4.4 Observação de fidelidade e normalização

O legado persiste parte do domínio em coleções JSONB (`tx`, `fiis`, `metas`, `cartoes`, `bancos`) e uma configuração agregada em `settings.data`. O modelo acima preserva os conceitos e campos de negócio identificados, mas os normaliza em tabelas relacionais para tipagem, integridade referencial, consultas e RLS.

Antes da Fase 2, os campos opcionais e regras de compatibilidade ainda não confirmados deverão ser confrontados com todos os fluxos de edição/importação do legado. Nenhum dado real será migrado nesta reconstrução sem um plano separado e aprovado.

---

## 5. Edge Functions e contratos

Todas as funções abaixo usam `POST` JSON, exceto o webhook WhatsApp que também atende `GET` para verificação. As funções autenticadas validam o Bearer token no servidor e derivam o usuário do token; funções agendadas validam segredo de cron em comparação de tempo constante. Respostas de erro usam `{ erro: string, codigo?: string }`.

### 5.1 `assistente`

**Entrada**
```json
{
  "pergunta": "texto de até 300 caracteres",
  "fatos": {},
  "historico": [{"p": "pergunta anterior", "r": "resposta anterior"}]
}
```
`fatos` até 12.000 caracteres serializados; histórico limitado aos três pares mais recentes.

**Saída**
```json
{"resposta":"texto curto","suficiente":true}
```
Sem escrita financeira. Resposta numérica conferida contra fatos e pergunta. Uso justo e rate limit são contabilizados no servidor.

### 5.2 `ler-comprovante`

**Entrada**
```json
{
  "imagem": "base64",
  "mime": "image/jpeg | image/png | image/webp | application/pdf | text/csv",
  "texto": "descrição opcional",
  "modo": "lancamento | extrato",
  "extrato": false,
  "hoje": "AAAA-MM-DD",
  "categorias": ["Alimentação"],
  "cartoes": ["Cartão principal"]
}
```
O modo de lançamento aceita texto ou arquivo. O modo extrato exige arquivo. Validar bytes reais, tipo e limite de 5 MB.

**Saída — lançamento**
```json
{
  "valor": 89.9,
  "data": "AAAA-MM-DD",
  "tipo": "despesa",
  "descricao": "mercado",
  "categoria": "Alimentação",
  "forma": "cartao",
  "parcelas": 1,
  "confianca": 0.98,
  "cartao": "Cartão principal"
}
```

**Saída — extrato**
```json
{
  "cartao": false,
  "linhas": [
    {"data":"AAAA-MM-DD","desc":"descrição original","valor":-89.9,"provavel_fixo":false}
  ]
}
```
O backend não persiste lançamentos nessa chamada. O cliente exibe revisão e confirmação.

### 5.3 `cotacoes`

**Entrada**
```json
{"tickers":["PETR4","ITUB4"]}
```
Até 40 tickers com formato validado.

**Saída**
```json
{
  "q": {
    "PETR4": {
      "p": 37.5,
      "ant": 37.1,
      "var": 0.4,
      "varPct": 1.078,
      "t": "timestamp ISO",
      "nome": "Nome do ativo",
      "div": null,
      "cache": false,
      "salvoEm": null
    }
  },
  "em": "timestamp ISO"
}
```
Consultar provedor externo, usar cache em memória e persistente, fallback para última cotação conhecida com marcação explícita de cache. Limite técnico por usuário/hora.

### 5.4 `radar-precos`

**Entrada autenticada — cotações**
```json
{"cotar":[{"t":"PETR4","k":"acao","cg":""}]}
```

**Entrada autenticada — catálogo**
```json
{"lista":true}
```

**Entrada de cron**
```json
{"so":"b3","dry":false}
```
ou
```json
{"so":"cripto","dry":false}
```

**Saída**
- Cotação: `{ "q": {}, "em": "timestamp ISO" }`.
- Catálogo: `{ "t": ["PETR4"] }`.
- Cron: `{ "so": "b3", "hoje": "AAAA-MM-DD", "usuarios": 0, "disparos": 0, "enviados": 0 }`.

O cron percorre alertas ativos, calcula condições, grava disparos idempotentes e envia push. `dry=true` simula sem persistir nem enviar.

### 5.5 `alertas-push`

**Entrada autenticada**
```json
{"teste":true}
```

**Entrada de cron**
```json
{"dry":false,"hoje":"AAAA-MM-DD"}
```
Modos operacionais internos: resumo diário, alertas de preço e saúde do serviço. A chamada de cron usa segredo próprio. A função consulta lançamentos, cartões, contas, metas, investimentos, preferências e inscrições de push; a arquitetura nova substitui qualquer dependência de estado comercial por elegibilidade universal.

**Saída**
- Teste: `{ "enviados": 1 }`.
- Cron: `{ "hoje": "AAAA-MM-DD", "usuarios": 10, "enviados": 8 }`.
- Simulação: `{ "hoje": "AAAA-MM-DD", "dry": true, "usuarios": 10, "simulado": [] }`.

### 5.6 `whatsapp-vincular`

**Entrada**
```json
{"acao":"status"}
```
```json
{"acao":"codigo"}
```
```json
{"acao":"resumo","ligar":true}
```
```json
{"acao":"desvincular"}
```

**Saídas**
- Status: `{ "ativo": true, "vinculado": true, "telefone": "+55 •••••-1234", "desde": "timestamp", "resumoSemanal": true }`.
- Código: `{ "codigo": "123456", "numero": "número oficial", "expiraMin": 15 }`.
- Resumo: `{ "ok": true, "resumoSemanal": true }`.
- Desvincular: `{ "ok": true }`.

Toda ação exige usuário autenticado. Código de vínculo é temporário, de uso único e protegido por rate limit.

### 5.7 `whatsapp-webhook`

**GET**
- Recebe os parâmetros de verificação do provedor e devolve o challenge somente quando o token confere.

**POST externo**
- Valida HMAC sobre o corpo bruto.
- Extrai mensagens do envelope do provedor.
- Reserva cada ID na inbox; repetidas são ignoradas, mensagens em processamento não são executadas em paralelo e mensagens recuperáveis podem ser retomadas.
- Processa texto/mídia, perguntas, lançamentos pendentes e confirmações.
- Responde 503 apenas quando necessário para solicitar nova tentativa controlada.

**POST interno de cron**
- Query `acao=resumo-semanal`, autenticada por `x-cron-secret`.
- Executa envio semanal em lotes e retorna resumo de processamento.

### 5.8 `minha-conta`

**Entrada**
```json
{"acao":"exportar"}
```
```json
{"acao":"excluir","confirmacao":"EXCLUIR"}
```

**Saída — exportação**
```json
{
  "app":"GranaViva",
  "formato":"exportacao-lgpd-1",
  "geradoEm":"timestamp ISO",
  "conta":{},
  "tabelas":{},
  "comprovantes":{"arquivos":[]}
}
```

**Saída — exclusão**
```json
{"ok":true,"apagado":{}}
```
O ID é sempre derivado do token. A exportação pagina todas as tabelas do usuário. A exclusão remove arquivos privados, registros e usuário de autenticação, com retorno explícito em caso de falha parcial.

### 5.9 Helpers compartilhados (não são endpoints)

- `ia-lancamento.ts`: interpretação de frase e estrutura tipada do lançamento.
- `ia-whatsapp.ts`: classificação de mensagem, múltiplos lançamentos, pergunta ou conversa; leitura opcional de mídia.
- `valida-ia.ts`: sanitização de entrada, validação de schema, enums, datas, valores, parcelas e confiança.
- `cota-fair-use.ts`: consumo atômico de cotas uniformes por usuário/tipo/período.
- `wa-idem.ts`: reserva, lease e finalização idempotente da inbox.
- `wa-outbox.ts`: reserva/finalização da outbox e classificação de resultados ambíguos.
- `resumo-semanal.ts`: cálculo e envio do resumo semanal.
- `arquivo.ts`: validação de MIME, bytes mágicos e tamanho.
- `push.ts`: envio de Web Push.
- `seguro.ts`: comparação segura de segredos e validação criptográfica.
- `erros.ts`: registro de erro sanitizado, sem dados financeiros ou segredos.

---

## 6. Mapa de telas e fluxos do frontend

### 6.1 Área pública

1. **Landing page**
   - Proposta de valor, funcionalidades, demonstrações visuais, segurança e CTA de cadastro/login.
   - Sem tabela comercial, sem comparação de níveis e sem página de preços.
   - Leve, responsiva, com imagens WebP locais.

### 6.2 Autenticação

2. **Login**
   - E-mail/senha e provedores OAuth habilitados no Supabase.
   - Estados de carregamento, erro, sessão expirada e recuperação.
3. **Cadastro**
   - Validação de e-mail/senha, confirmação e criação do perfil.
4. **Recuperação de senha**
   - Solicitação, link seguro e redefinição.

### 6.3 Aplicativo autenticado

5. **Onboarding**
   - Boas-vindas, moeda/fuso, primeira conta, seleção de instituição/logo, saldo inicial e opção de vincular WhatsApp.
   - Configuração rápida; todos os passos podem ser pulados e retomados.
6. **Dashboard**
   - Saldo total, saldo livre, receitas/despesas, fluxo mensal, contas, faturas, vencimentos, orçamentos, metas, patrimônio, renda passiva e atalhos.
   - Filtro de período e ocultação de valores.
7. **Lançamentos**
   - Extrato, filtros, busca, categorias, detalhes, edição, exclusão lógica/cancelamento, lançamento manual e lançamento por frase.
8. **Comprovantes**
   - Upload/câmera, leitura por IA, prévia, correção, confirmação e anexos vinculados ao lançamento.
9. **Contas**
   - Lista, cadastro/edição, logo, saldo inicial, arquivamento e movimentações.
10. **Cartões**
    - Lista de cartões, limite, fechamento, vencimento, fatura atual, histórico, parcelas e quitações.
11. **Orçamentos**
    - Limite por categoria, progresso, alertas de 80%/100% e histórico mensal.
12. **Metas**
    - Criar/editar metas, aportes, progresso, prazo e projeções.
13. **Investimentos**
    - Carteira por classe, ativos, operações, preço médio, patrimônio, proventos, renda fixa e cripto.
14. **Radar**
    - Busca de ativos, criação/edição/reativação de alertas e histórico de disparos.
15. **Assistente**
    - Conversa contextual, fatos calculados localmente, histórico curto, resposta validada e fallback determinístico.
16. **WhatsApp**
    - Status, geração de código, instruções de vinculação, número mascarado, desvincular e preferência do resumo semanal.
17. **Relatórios**
    - Comparações por período, categorias, fluxo realizado versus previsto, evolução patrimonial e renda passiva.
18. **Minha conta**
    - Perfil, preferências, dispositivos push, exportação e exclusão da conta.

### 6.4 Navegação e padrões globais

- Desktop: navegação lateral com agrupamento por domínio.
- Mobile: navegação inferior para áreas principais e acesso às demais pelo menu.
- Componentes de UI compartilhados: botão, campo, seletor, modal, drawer, card, tabela/lista, gráfico, toast, skeleton, empty state, confirmação e feedback de erro.
- Todos os formulários têm estados de validação, salvamento, sucesso e falha.
- A troca de usuário limpa estado em memória, caches, consultas e arquivos temporários da sessão anterior.
- Cache local é sempre escopado pelo ID autenticado; nunca compartilhado entre contas.

---

## 7. Arquitetura técnica

### 7.1 Frontend

- React 19, TypeScript estrito, Vite.
- CSS Design System com tokens e utilitários; Tailwind somente se a implementação comprovar ganho sem duplicar o sistema visual existente.
- PWA com manifest, service worker, ícones locais e estratégia de atualização segura.
- Supabase client usa apenas URL e chave pública.
- Tipos gerados/sincronizados a partir do schema SQL.
- Domínio financeiro em funções puras independentes da interface.
- Estado de servidor e estado local separados; evitar duplicar fonte de verdade.
- Formatação `pt-BR`, moeda BRL e datas em `America/Sao_Paulo`.
- Armazenamento local de dados financeiros fail-closed: AES-GCM via Web Crypto e chave não exportável em IndexedDB; se criptografia/armazenamento seguro falhar, não gravar novos dados financeiros em texto puro.

### 7.2 Backend

- Supabase PostgreSQL, Auth, Storage, RLS e Edge Functions em Deno.
- Acesso privilegiado somente no backend.
- Nenhuma variável `VITE_*` contém segredo.
- Todas as chamadas autenticadas validam token no servidor.
- Webhooks externos validam autenticidade criptográfica sobre o corpo bruto.
- Funções privilegiadas usam `SECURITY DEFINER` somente quando necessário, `search_path` fixo e grants mínimos.
- Cache global de cotação é somente backend; dados pessoais são sempre escopados por usuário.

### 7.3 Migrations

Exatamente cinco migrations consolidadas, limpas e reproduzíveis:

1. `001_perfis_e_seguranca_base.sql`
   - perfis, configurações, categorias, políticas de segurança, funções auxiliares e grants.
2. `002_financeiro_core.sql`
   - contas, cartões, lançamentos, recorrências, orçamentos, metas, patrimônio, importação, anexos e relacionamentos.
3. `003_investimentos_e_radar.sql`
   - ativos, operações, eventos de renda, cache de cotações, Radar, disparos e push.
4. `004_ia_fair_use_e_rate_limit.sql`
   - uso diário/mensal, buckets de rate limit, funções atômicas e log de erros.
5. `005_whatsapp_fila_e_outbox.sql`
   - vínculo, códigos, tentativas, pendentes, inbox, outbox, RPCs de lease e idempotência.

Cada migration deverá:
- funcionar em banco vazio;
- criar constraints, índices e RLS;
- revogar acesso público em tabelas internas;
- ser validada por testes SQL;
- evitar patches sucessivos e dependência de estado manual;
- declarar funções com `search_path` travado;
- não conter recursos fora deste contrato.

### 7.4 Estrutura de repositório

```text
grana-viva/
├── ARQUITETURA_TRAVADA.md
├── package.json
├── public/
│   ├── fonts/
│   ├── icons/
│   ├── logos/
│   ├── img/
│   └── manifest.webmanifest
├── src/
│   ├── components/ui/
│   ├── lib/
│   ├── types/
│   ├── features/
│   │   ├── landing/
│   │   ├── auth/
│   │   ├── onboarding/
│   │   ├── dashboard/
│   │   ├── lancamentos/
│   │   ├── comprovantes/
│   │   ├── contas/
│   │   ├── cartoes/
│   │   ├── orcamentos-metas/
│   │   ├── investimentos/
│   │   ├── radar/
│   │   ├── assistente/
│   │   ├── whatsapp/
│   │   ├── relatorios/
│   │   └── conta/
│   └── App.tsx
├── supabase/
│   ├── migrations/
│   └── functions/
│       ├── _shared/
│       ├── assistente/
│       ├── ler-comprovante/
│       ├── cotacoes/
│       ├── radar-precos/
│       ├── alertas-push/
│       ├── whatsapp-vincular/
│       ├── whatsapp-webhook/
│       └── minha-conta/
├── tests/
└── .github/workflows/ci.yml
```

---

## 8. Segurança, privacidade e confiabilidade

### 8.1 RLS e autorização

- RLS habilitada em 100% das tabelas.
- Tabelas de usuário usam `auth.uid() = user_id` para SELECT/INSERT/UPDATE/DELETE.
- Tabelas internas de fila, uso justo, logs e cache não recebem grants de `anon` ou `authenticated`.
- Tabelas globais de cotação só são acessadas por `service_role`.
- Policies não substituem validação de autorização nas Edge Functions.
- Views e RPCs também serão revisadas para evitar bypass de RLS.

### 8.2 Funções privilegiadas

- `SECURITY DEFINER` apenas para transações atômicas necessárias.
- `search_path = pg_catalog, public`.
- Qualquer entrada é validada antes de SQL dinâmico ou mutação.
- EXECUTE revogado de `public`, `anon` e `authenticated`; concedido apenas ao papel necessário.
- Testes confirmam owner, grants e search_path.

### 8.3 Logs e segredos

- Sanitizar e limitar mensagens de erro.
- Remover e-mails, UUIDs, tokens, JWTs, telefones, conteúdo de comprovantes e dados financeiros.
- Não logar prompt completo, corpo de webhook ou resposta bruta de IA.
- Falha ao registrar log não pode derrubar a operação original.
- Secrets ficam no Supabase Secrets/Vault; nunca em código, frontend, artefato ou documentação.

### 8.4 Idempotência e concorrência

- Webhooks de entrada reservam ID antes do processamento.
- Lease usa token de fencing; worker antigo não finaliza trabalho reservado por worker novo.
- Gravação de lançamento WhatsApp, consumo da cota e baixa do pendente são atômicos.
- Outbox rejeita chave com destinatário/payload divergente.
- Resultado ambíguo de envio nunca é repetido automaticamente.
- Alertas e resumos usam chaves únicas por evento/período.

### 8.5 LGPD

- Exportação e exclusão sempre usam identidade derivada do token.
- Storage privado, caminhos por usuário e validação de propriedade.
- Retenção mínima de logs e eventos técnicos.
- Exclusão em cascata para dados pessoais, com remoção explícita de arquivos.
- Não exportar chaves criptográficas nem segredos.

---

## 9. Testes obrigatórios e critérios de aceite

### 9.1 Testes unitários

- Valores em centavos, arredondamento e formatação BRL.
- Saldos, transferências, estornos e lançamentos previstos/cancelados.
- Ciclos de fatura, fechamento, vencimento, quitações parciais e parcelas futuras.
- Recorrência em virada de mês/ano e anos bissextos.
- Importação CSV/OFX, FITID, hash, duplicidade e desfazer lote.
- Preço médio, venda parcial, proventos por quantidade histórica e posição manual.
- Metas, orçamento e agregações mensais.
- Sanitização e validação de IA, datas, enums, limites e prompt injection.
- Cálculo de radar e idempotência de alertas.

### 9.2 Testes SQL e integração

- RLS com dois usuários, `anon`, `authenticated` e `service_role`.
- Tentativa de leitura/escrita cruzada entre usuários.
- Grants e `search_path` de funções privilegiadas.
- Concorrência de cotas diárias/mensais.
- Inbox: repetição, lease ativo, lease expirado, fencing e limite de tentativas.
- Outbox: payload divergente, destinatário divergente, 429 seguro, 5xx ambíguo e lease expirado.
- Confirmação WhatsApp repetida sem duplicar lançamento.
- Exportação e exclusão com arquivos no Storage.

### 9.3 Testes de frontend e PWA

- Fluxos de cadastro, login, logout, troca de usuário e recuperação de sessão.
- Teclado, foco, leitores de tela, contraste WCAG AA e telas pequenas.
- PWA instalável, atualização de service worker e abertura offline.
- Safari iOS e navegadores Chromium.
- Estados de rede lenta, timeout, erro e sessão expirada.

### 9.4 CI

O workflow deve executar:
1. instalação reproduzível;
2. lint;
3. typecheck;
4. build;
5. testes unitários;
6. testes de integração/SQL;
7. validação de migrations;
8. verificação automatizada da lista negra;
9. verificação de ausência de segredos e de arquivos monolíticos.

---

## 10. Riscos, lacunas e decisões pendentes

1. **Schema-base histórico:** as migrations do ZIP não criam originalmente todas as tabelas centrais; algumas estruturas foram confirmadas por auditorias e pelo código do frontend. O schema canônico desta arquitetura é uma normalização deliberada, não uma transcrição literal do catálogo remoto.
2. **Fórmulas financeiras do frontend:** a auditoria do legado identifica cálculos de saldo, fatura, parcelas, patrimônio e renda passiva, mas a cobertura unitária isolada era incompleta. Antes de alterar resultados, a Fase 2 deverá extrair fórmulas e criar casos de regressão.
3. **Cotações:** as fontes externas do legado podem falhar ou atrasar. O produto deve indicar horário e origem, manter último valor conhecido como cache e nunca apresentá-lo como cotação ao vivo.
4. **IA:** modelos e disponibilidade podem mudar. Os prompts e schemas serão versionados; resposta inválida não altera dados.
5. **WhatsApp:** o runbook legado documenta limites de lease, tentativas e semântica at-most-once. A implementação nova deverá preservar esses contratos e testar timeouts reais da plataforma.
6. **Resumo semanal:** a referência histórica é segunda-feira às 08:00 de Brasília; o cron UTC correspondente deve ser calculado e validado para horário de verão/regra de fuso, sem hardcode de deslocamento.
7. **Storage e exclusão:** confirmar políticas e tamanho máximo de comprovantes antes de publicar.
8. **OAuth e autenticação:** provedores e parâmetros serão definidos por configuração do Supabase, sem colocar secrets no cliente.
9. **Fair Use:** valores finais de cotas ainda não foram determinados; devem ser configuráveis e uniformes para todos, após medição de custo.

---

## 11. Portões de aprovação

A execução será interrompida ao final de cada fase.

- **Fase 1 — Arquitetura:** auditoria do legado e este documento. Aguarda aprovação explícita.
- **Fase 2 — Fundação:** scaffold React/Vite, design system, ativos, tipos, migrations e testes-base. Aguarda aprovação.
- **Fase 3 — Backend:** Edge Functions, regras de domínio, IA, Radar, push e WhatsApp. Aguarda aprovação.
- **Fase 4 — Frontend funcional:** autenticação, onboarding, dashboard e todos os módulos. Aguarda aprovação.
- **Fase 5 — Qualidade e entrega:** testes completos, PWA, acessibilidade, CI, documentação operacional e revisão final. Aguarda aprovação.

**Regra:** não iniciar a fase seguinte sem a resposta literal `APROVADO` do usuário.

---

## 12. Checklist da Fase 1

- [x] ZIP localizado e inventariado (222 entradas).
- [x] Documentação técnica e funcional principal examinada.
- [x] Design system e referências visuais examinados.
- [x] Fontes das funções de IA, conta, cotação, Radar, push e WhatsApp examinadas.
- [x] Migrations SQL e estruturas de segurança, uso justo, inbox e outbox examinadas.
- [x] 32 logos, fontes, ícones e imagens contabilizados.
- [x] Regras de negócio consolidadas neste contrato.
- [x] Modelo de dados canônico e relacionamentos definidos.
- [x] Contratos das oito Edge Functions documentados.
- [x] Mapa de telas e fluxos definido.
- [x] Lista de testes e critérios de aceite definida.
- [x] Nenhum código de aplicação foi criado nesta fase.
- [ ] Aprovação do usuário.

**Fim da Fase 1. A próxima fase só começa após `APROVADO`.**