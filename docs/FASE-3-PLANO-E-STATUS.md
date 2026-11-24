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

### Fundação compartilhada e conta
- [x] Helpers HTTP, CORS por origem exata, parser JSON limitado e respostas seguras.
- [x] Autenticação de usuário via Supabase Auth; consultas de dados usam token do próprio usuário e RLS.
- [x] Endpoints de perfil e preferências, com whitelist de atualização.
- [x] Login, cadastro, encerramento de sessão e sincronização de tema no frontend.
- [x] CI dedicado para TypeScript/Deno, Vitest, build, Playwright e integração Supabase local.
- [ ] Execução completa verde no GitHub Actions, incluindo Auth/CORS/RLS local.

### IA e comprovantes
- [x] Endpoint `assistente`, com consentimento obrigatório, fatos enviados pelo cliente, anti-injection e validação de números.
- [x] Endpoint `ler-comprovante`, validação de PDF/imagem até 5 MB, prévia revisável e confirmação humana obrigatória.
- [x] OpenAI Responses API server-side, `store: false`, timeout, limites e schema JSON estrito.
- [x] Reservas atômicas e rate limit por usuário.
- [ ] Tela de consentimento e fluxo de envio de fatos financeiros pelo frontend.
- [ ] Fluxo de envio de comprovante, revisão, confirmação e gravação.
- [ ] Storage privado e vínculo persistente do comprovante à transação.
- [ ] Configurar secrets e limites operacionais no ambiente remoto, somente após autorização.

### Radar
- [x] CRUD autenticado de alertas por usuário.
- [x] Condições acima, abaixo e queda percentual diária.
- [x] RPC atômica: desativar preserva geração; reativar incrementa uma vez; repetição não incrementa.
- [x] Migration `006_radar_alert_generation.sql`, grants restritos, RLS e testes de isolamento.
- [x] Testes de validação, integração entre dois usuários e concorrência da reativação.
- [x] Tela do Radar conectada ao endpoint no frontend.
- [ ] Fonte de cotação pública e gratuita, com fonte/horário, cache e política de dados antigos. Nenhuma API financeira foi escolhida ou chamada.

### Push
- [x] Registro, listagem e remoção de inscrições por usuário autenticado.
- [x] Validação de HTTPS, hosts de push conhecidos e tamanho real das chaves.
- [x] Testes unitários e de isolamento por usuário.
- [ ] Chaves VAPID e worker de envio no backend.
- [ ] Deduplicação de entregas e remoção automática de endpoints 404/410.
- [ ] Permissão e gerenciamento da inscrição no frontend.

### WhatsApp
- [x] Schema de vínculo, tentativas, inbox, transações pendentes e outbox na Fase 2.
- [x] RPCs de rate limit, vínculo, leases/fencing e envio idempotente na Fase 2.
- [ ] Adaptador de provedor e validação HMAC do webhook sobre corpo bruto.
- [ ] Solicitação/entrega de código temporário de vinculação.
- [ ] Worker de inbox, parser de mensagem, confirmação explícita e worker de outbox.
- [ ] Resumo semanal com consentimento e opt-out.
- Nenhum provedor, segredo, número ou envio real foi configurado.

### Frontend e validação
- [x] Autenticação, preferências de tema e CRUD do Radar conectados.
- [ ] CRUD financeiro de contas, cartões, lançamentos e recorrências conectado aos endpoints.
- [ ] Consentimento de IA e fluxo de comprovantes no frontend.
- [ ] Push e WhatsApp no frontend.
- [ ] Auditoria de acessibilidade e testes reais do usuário após a integração dos módulos.

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

O HEAD atual tem novas migrations, Edge Functions e telas de autenticação/Radar. O CI está sendo executado em uma branch com commits frequentes; os runs anteriores foram cancelados pela política de concorrência antes de concluírem todos os jobs. Por isso, não há ainda uma execução completa verde.

- HEAD consultado: `c338441ae21b4bc76ed50c80ae441fdc41daeb71`.
- Execuções mais recentes: [run push #45299936354](https://github.com/theuuswillian/aplicativomobile/actions/runs/45299936354) e [run PR #45299928800](https://github.com/theuuswillian/aplicativomobile/actions/runs/45299928800).
- As execuções aparecem como queued/pending e ainda não disponibilizaram jobs/logs na consulta.
- Runs anteriores foram cancelados ao chegar novos commits; não são considerados aprovados.
- O teste local de integração agora cobre perfil, preferências, Radar e inscrições Push entre dois usuários.
- O teste PostgreSQL inclui a migration 006 e verifica isolamento, grants e reativação concorrente do Radar.

A aprovação exige que uma execução no HEAD final conclua com sucesso todos os jobs: validação frontend, Playwright, Edge Runtime/Deno, integração Supabase local e PostgreSQL/RLS/concorrência. Não relaxar asserts para obter um CI verde.

O status do Vercel é separado do GitHub Actions. Limite diário de deploy não comprova falha ou sucesso dos testes. Nenhum deploy de produção foi solicitado.

## Limites atuais

A Fase 2 continua preservada como base e a PR #1 não será mesclada por esta etapa. Esta branch é derivada da Fase 2; a revisão da Fase 3 será separada. Nenhuma função está implantada no projeto Supabase remoto.
