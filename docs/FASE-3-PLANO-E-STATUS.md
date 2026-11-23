# Fase 3 — Backend

**Branch:** `fase-3-backend`  
**Base:** `fase-2-fundacao`  
**Estado:** em execução; nenhum serviço remoto foi alterado.

## Objetivo

Implementar o backend do GranaViva conforme `docs/ARQUITETURA_TRAVADA.md`, sem conectar a interface financeira nesta fase e sem introduzir cobrança, planos comerciais, Pluggy ou dependência de provedor financeiro pago.

## Ordem de execução

1. **Base HTTP e identidade**
   - CORS por origem explicitamente configurada.
   - Autenticação de cada requisição pelo token Supabase.
   - Cliente Supabase com token do usuário, respeitando RLS.
   - Respostas e erros padronizados, sem expor exceções ou segredos.
2. **Conta e perfil**
   - Leitura e atualização de dados próprios.
   - Exportação/exclusão somente após definir e testar o fluxo completo de Storage e cascatas.
3. **Assistente e leitura de comprovantes**
   - Provedor configurado exclusivamente por segredo de backend.
   - Schemas estritos, validação de resposta, prompt injection tratado como dado e revisão humana.
   - Reservas/finalização atômicas de fair use; nenhuma mutação financeira automática.
4. **Cotações e Radar**
   - Adaptadores isolados, fonte e timestamp obrigatórios, cache claramente identificado.
   - Alertas idempotentes por geração; nunca rotular preço antigo como atual.
5. **Push**
   - Inscrições por dispositivo, VAPID no servidor, remoção de endpoints inválidos e deduplicação.
6. **WhatsApp**
   - Vinculação, webhook HMAC sobre corpo bruto, inbox com lease/fencing e outbox at-most-once.
   - Lançamentos sempre pendentes até confirmação explícita; resultado ambíguo de envio nunca é repetido automaticamente.

## Critérios de aceite

- Cada função autentica o usuário ou valida criptograficamente o webhook antes de processar dados.
- Dados pessoais sempre são escopados pelo usuário; RLS continua sendo a segunda barreira.
- Segredos somente em Supabase Secrets; nenhum segredo em `VITE_*`, código ou logs.
- Validação de entrada e saída, limites de tamanho, erros sanitizados e timeout explícito.
- Operações com concorrência, quotas, alertas e mensagens usam as RPCs idempotentes da Fase 2.
- Testes unitários, testes de integração e testes de segurança para cada fluxo implementado.
- Nenhuma migration remota, configuração remota, deploy de produção ou envio real a provedor sem autorização específica.

## Registro de execução

### Fundação compartilhada
- [x] Criada branch isolada `fase-3-backend` a partir de `fase-2-fundacao`.
- [x] Helpers HTTP, CORS, autenticação e cliente Supabase por usuário.
- [x] Endpoint autenticado de perfil e preferências via POST JSON, conforme o contrato das Edge Functions.
- [x] Validação estrita de campos e leitura JSON limitada em streaming.
- [x] Content-Type exige media type `application/json` exato; base64 acima do limite é rejeitado antes da validação da assinatura.
- [x] Testes unitários dos validadores e parser HTTP.
- [x] Testes nativos Deno para validadores, parser HTTP e cabeçalhos de segurança.
- [x] Job dedicado no CI para `deno check` das Edge Functions e `deno test` dos helpers.
- [x] Harness de integração local com dois usuários, Auth, endpoints, CORS e isolamento RLS; executa somente Supabase local.
- [x] Job CI separado instala Supabase CLI v2 e executa a integração local sem credenciais remotas.
- [ ] Execução verde dos jobs Deno e Supabase local no GitHub Actions.

### IA, Radar, push e WhatsApp
- [x] Endpoint `assistente`: recebe pergunta, fatos calculados no cliente e até três pares recentes; não consulta nem altera dados financeiros.
- [x] Endpoint `ler-comprovante`: valida PDF/imagem até 5 MB, extrai uma prévia estrita e exige confirmação humana; não grava transação nem persiste o arquivo.
- [x] Provedor OpenAI Responses API configurado exclusivamente por segredo de backend, com `store: false`, timeout e limite de resposta.
- [x] Validação de schema, categorias e finais de cartões existentes do próprio usuário, valor até R$ 10 milhões, datas, parcelas, anti-injection e números da resposta do assistente.
- [x] Consentimento explícito obrigatório antes de enviar fatos ou comprovantes ao provedor.
- [x] Reservas atômicas de uso justo e rate limit por usuário; assistente usa o bucket técnico `phrase` existente, comprovantes usam `receipt`; falhas e respostas inválidas liberam a reserva.
- [ ] Configurar segredos e limites técnicos no ambiente local/deploy, após aprovação do usuário.
- [ ] Testes automatizados Deno/Vitest e integração Supabase local verdes no CI.
- [x] Validação isolada de base64, MIME declarado versus assinatura real e limite de 5 MB para arquivos aceitos.
- [x] Endpoint de IA para leitura de comprovantes, validação da resposta e revisão humana.
- [ ] Cotações e Radar.
- [ ] Push.
- [ ] WhatsApp completo.

## Configuração necessária do backend (ainda não aplicada)

O provedor usa a OpenAI Responses API. Antes de habilitar chamadas reais, o ambiente de Edge Functions precisa receber, somente como secrets:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_ASSISTANT_DAILY_LIMIT` e `AI_ASSISTANT_MONTHLY_LIMIT`
- `AI_RECEIPT_DAILY_LIMIT` e `AI_RECEIPT_MONTHLY_LIMIT`
- `AI_RATE_LIMIT_PER_HOUR`
- `SUPABASE_SERVICE_ROLE_KEY` (somente para as RPCs internas de reserva/finalização; nunca usado para consultas de dados do usuário)

Os limites são obrigatórios e uniformes, sem planos ou diferenciação comercial. Não foram inventados valores nem configurados segredos remotos. O endpoint exige `consent: true`; o frontend ainda precisará apresentar consentimento claro antes de enviar fatos financeiros ou comprovantes ao provedor. Os documentos e fatos enviados são processados externamente pelo provedor configurado; `store: false` evita solicitar armazenamento da resposta pela API, mas não é promessa de retenção zero pelo provedor.

A leitura do comprovante é atualmente efêmera: o arquivo é enviado para extração e não fica armazenado no Storage nem gera registro `receipt_files`. A persistência/anexo ao lançamento será implementada em etapa própria após o fluxo de confirmação e Storage privado.

## Validação pendente

Os jobs `edge-runtime` e `edge-integration` foram adicionados ao GitHub Actions. A execução `45161146983` (SHA `bf438047...`) detectou falhas de lint e dois testes Deno; as causas foram corrigidas depois desse SHA (tipagem Supabase sem `any`, limpeza de controles, base64 sem regex de backtracking, permissão de ambiente nos testes e contagem de frases sem confundir separadores de milhar). A execução não valida os commits posteriores. A execução dos jobs para o HEAD atual ainda não foi confirmada. O status Vercel retornado pelo GitHub é um limite de builds da conta e não comprova falha ou sucesso do código. Não marcar a validação Deno como aprovada até obter o resultado do job.

## Limites atuais

A Fase 2 continua preservada como base e a PR #1 não será mesclada por esta etapa. Esta branch é derivada da Fase 2; a revisão da Fase 3 será separada. Nenhuma função está implantada no projeto Supabase remoto.
