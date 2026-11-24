# Fase 3 — Backend

**Branch:** `fase-3-backend`  
**Base:** `fase-2-fundacao`  
**Estado:** em execução; nenhum serviço remoto foi alterado.

## Objetivo

Implementar backend e integração gradual da interface do GranaViva conforme `docs/ARQUITETURA_TRAVADA.md`, sem introduzir cobrança, planos comerciais, Pluggy ou dependência de provedor financeiro pago.

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
- [x] Execução completa verde no GitHub Actions para o commit `44b2a24b77e073642a494a4a44567931aee287b8`, incluindo Auth/CORS/RLS local. O commit posterior de consentimento por solicitação ainda precisa de sua própria validação.

### IA e comprovantes
- [x] Endpoint `assistente`, com consentimento obrigatório, fatos enviados pelo cliente, anti-injection e validação de números.
- [x] Endpoint `ler-comprovante`, validação de PDF/imagem até 5 MB, prévia revisável e confirmação humana obrigatória.
- [x] OpenAI Responses API server-side, `store: false`, timeout, limites e schema JSON estrito.
- [x] Reservas atômicas e rate limit por usuário.
- [x] Tela de consentimento individual por solicitação; somente até 20 lançamentos recentes são enviados após confirmação explícita.
- [x] Frontend envia arquivo com consentimento, mostra prévia editável e grava lançamento somente após confirmação explícita.
- [x] Migration `008_whatsapp_and_receipt_storage_safety.sql` cria bucket privado de 5 MB, RLS por usuário e transação, e consentimento WhatsApp desativado por padrão.
- [x] Frontend envia comprovante após confirmação, registra hash SHA-256 e metadados, permite abrir URL assinada curta e remove objeto ao excluir o lançamento.
- [ ] Configurar secrets e limites operacionais no ambiente remoto, somente após autorização.

### Radar
- [x] CRUD autenticado de alertas por usuário.
- [x] Condições acima, abaixo e queda percentual diária.
- [x] Worker `radar-worker` valida frescor de 15 minutos, fonte e classe do ativo, aplica condições, persiste disparos idempotentes por geração e solicita Push.
- [x] Histórico dos últimos disparos disponível no endpoint e na interface.
- [x] RPC atômica: desativar preserva geração; reativar incrementa uma vez; repetição não incrementa.
- [x] Migration `006_radar_alert_generation.sql`, grants restritos, RLS e testes de isolamento.
- [x] Testes de validação, integração entre dois usuários e concorrência da reativação.
- [x] Tela do Radar conectada ao endpoint no frontend.
- [ ] Fonte de cotação pública e gratuita, com fonte/horário, cache e política de dados antigos. A arquitetura travada proíbe dependência de provedor financeiro externo; não integrar APIs pagas ou não aprovadas.

### Push
- [x] Registro, listagem e remoção de inscrições por usuário autenticado.
- [x] Validação de HTTPS, hosts de push conhecidos e tamanho real das chaves.
- [x] Testes unitários e de isolamento por usuário.
- [x] Worker `push-worker` com VAPID ES256, criptografia Web Push `aes128gcm`, segredo interno, preferência global de consentimento e reserva idempotente por entrega.
- [x] Deduplicação de entregas e remoção automática de endpoints 404/410.
- [x] Permissão e gerenciamento da inscrição por dispositivo no frontend e Service Worker para exibir/abrir notificações.
- [ ] Configuração dos secrets VAPID e agendamento/orquestração de chamadas do worker, somente após autorização.

### WhatsApp
- [x] Schema de vínculo, tentativas, inbox, transações pendentes e outbox na Fase 2.
- [x] RPCs de rate limit, vínculo, leases/fencing e envio idempotente na Fase 2.
- [ ] Adaptador de provedor e validação HMAC do webhook sobre corpo bruto.
- [x] Endpoint autenticado de geração de código temporário, hash SHA-256, expiração de 10 minutos e rate limit de 3 códigos por hora.
- [x] UI de vínculo, desvinculação e consentimento explícito do resumo semanal; gerar código não ativa o resumo.
- [x] RPC `whatsapp_pending_confirm` valida vínculo, referências e payload e cria o lançamento uma única vez sob lock transacional.
- [ ] Adaptador de provedor, webhook HMAC, worker de inbox/parser e worker de outbox ainda pendentes.
- [ ] Resumo semanal com consentimento e opt-out no worker.
- Nenhum provedor, segredo, número ou envio real foi configurado.

### Frontend e validação
- [x] Autenticação, preferências de tema e CRUD do Radar conectados.
- [x] Frontend permite criar/listar contas e criar/listar/editar/excluir lançamentos sob RLS.
- [x] Cartões, categorias, recorrências e orçamentos mensais conectados à interface.
- [x] Metas financeiras conectadas: cadastro, progresso e contribuições com histórico; RPC invoker transacional bloqueia a meta, insere o evento e atualiza o acumulado atomicamente.
- [x] Carteira de investimentos conectada: cadastro de ativos, posições iniciais, compras e vendas, cálculo de quantidade, custo médio e resultado realizado a partir do livro de operações.
- [x] Importação CSV/OFX com parser validado, prévia, deduplicação por destino e confirmação humana; lote revertido em caso de falha.
- [x] Registro manual de dividendos, JCP e outros proventos com estados anunciado/previsto/recebido/cancelado.
- [x] Consentimento por uso da IA e prévia editável de comprovante; arquivo persiste em Storage privado somente após confirmação.
- [x] Push no frontend e Service Worker; UI de vínculo WhatsApp, geração de código e consentimento explícito do resumo semanal conectados.
- [ ] Auditoria de acessibilidade e testes reais do usuário após a integração dos módulos.

## Configuração necessária do backend (ainda não aplicada)

O provedor usa a OpenAI Responses API. Antes de habilitar chamadas reais, o ambiente de Edge Functions precisa receber, somente como secrets:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_ASSISTANT_DAILY_LIMIT` e `AI_ASSISTANT_MONTHLY_LIMIT`
- `AI_RECEIPT_DAILY_LIMIT` e `AI_RECEIPT_MONTHLY_LIMIT`
- `AI_RATE_LIMIT_PER_HOUR`
- `SUPABASE_SERVICE_ROLE_KEY` (somente para as RPCs internas de reserva/finalização; nunca usado para consultas de dados do usuário)

Geração local do par VAPID: defina `PUSH_VAPID_SUBJECT` no terminal e execute `npm run generate:vapid`. O script imprime as variáveis públicas e privadas; configure a chave privada e o segredo interno somente como secrets no backend e a chave pública como variável de build `VITE_PUSH_VAPID_PUBLIC_KEY`. Não versione a saída do comando.

Para Radar, configure `RADAR_WORKER_SECRET` (mínimo 32 caracteres) para invocar `radar-worker` server-to-server com JWT de serviço. O worker consome apenas `quote_cache` com timestamp recente e fonte declarada; nenhuma fonte financeira foi conectada.

Para Push, a etapa de envio usa o worker interno `push-worker`. Antes de habilitá-lo, o ambiente precisa receber os secrets `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` (PKCS#8 em base64url), `PUSH_VAPID_SUBJECT` e `PUSH_WORKER_SECRET` (mínimo 32 caracteres), além de `SUPABASE_SERVICE_ROLE_KEY` já descrito acima. O frontend recebe somente a chave pública em `VITE_PUSH_VAPID_PUBLIC_KEY`. A chamada do worker deve ocorrer exclusivamente server-to-server com JWT de serviço e `x-worker-secret`; nenhum agendamento ou envio real foi ativado.
 
Os limites são obrigatórios e uniformes, sem planos ou diferenciação comercial. Não foram inventados valores nem configurados segredos remotos. Os endpoints exigem `consent: true`; o frontend apresenta consentimento individual e o reseta após cada solicitação. Os documentos e fatos enviados são processados externamente pelo provedor configurado; `store: false` evita solicitar armazenamento da resposta pela API, mas não é promessa de retenção zero pelo provedor.

A extração do comprovante é efêmera durante a chamada de IA. Após confirmação humana, o arquivo original é armazenado no bucket privado `receipt-files`, com metadados e SHA-256 em `receipt_files`. Download usa URL assinada de curta duração; exclusão remove o objeto e o lançamento.

## Validação pendente

O commit `bd53ebfc18aedeadf992aeaa5c75de7802291dd4` passou integralmente na execução [PR #45305286705](https://github.com/theuuswillian/aplicativomobile/actions/runs/45305286705). Os commits seguintes ampliaram os módulos; a validação integral do HEAD atual está em andamento:
- `validate`: lint, política arquitetural, verificação de segredos, shell, TypeScript, testes, build, Playwright, responsividade, offline e acessibilidade.
- `edge-runtime`: type-check Deno e testes unitários.
- `sql`: migrations, RLS, grants, isolamento e concorrência no PostgreSQL 17.
- `edge-integration`: Auth local, perfil, preferências, CORS, Radar, Push e isolamento entre dois usuários.

O CI verde não significa que a Fase 3 esteja concluída. Permanecem escolha/configuração de provedor WhatsApp, webhook HMAC e workers WhatsApp, escolha de fonte de cotações compatível com a arquitetura, configuração remota autorizada, agendamento/orquestração de Radar e Push e validação manual no dispositivo.

- HEAD atual consultado: `986e4a0de1a24940d275e2db3c5e1124a058a2e3`; execução GitHub Actions [#45311538306](https://github.com/theuuswillian/aplicativomobile/actions/runs/45311538306) em validação. O commit contém migrations 007/008, metas, carteira, proventos, importação, Storage privado, Push e workers Radar.
- [Branch Fase 3](https://github.com/theuuswillian/aplicativomobile/tree/fase-3-backend).
- [PR #2](https://github.com/theuuswillian/aplicativomobile/pull/2), ainda draft e sem merge.
- O teste local de integração cobre perfil, preferências, CORS, Radar, Push, geração de código WhatsApp e bloqueio de workers sem JWT, além do isolamento entre dois usuários.
- O teste PostgreSQL aplica migrations 001–008 e verifica RLS, grants, isolamento de Storage privado, consentimento WhatsApp, concorrência de metas, confirmação WhatsApp e reativação Radar.

A aprovação final exige CI integral verde no HEAD final, auditoria, configuração remota somente autorizada e validação manual do aplicativo pelo usuário. Não relaxar asserts para obter CI verde.

O status do Vercel é separado do GitHub Actions. Nenhum deploy de produção foi solicitado.

## Limites atuais

A Fase 2 continua preservada como base e a PR #1 não será mesclada por esta etapa. Esta branch é derivada da Fase 2; a revisão da Fase 3 será separada. Nenhuma função está implantada no projeto Supabase remoto.
