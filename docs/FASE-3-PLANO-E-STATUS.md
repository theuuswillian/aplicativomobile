# Fase 3 — Backend

**Branch:** `fase-3-backend`  
**Base:** `fase-2-fundacao`  
**Estado:** implementação e CI automatizado aprovados no commit `1c141f53ad4062aad41a78e09763fe02563aedf2`; integração remota parcial. Supabase Brasil recebeu migrations 001–012 e Vercel recebeu apenas variáveis públicas para Preview da branch `fase-3-backend` e Development. Edge Functions, secrets, workers e produção permanecem sem ativação.

## Objetivo

Implementar backend e integração gradual da interface do GranaViva conforme `docs/ARQUITETURA_TRAVADA.md`, sem introduzir cobrança, planos comerciais ou Pluggy. O aditivo aprovado permite fonte externa somente para cotações públicas de mercado, com licença confirmada, chave no backend e limites gratuitos.

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
- [x] Worker `radar-worker` valida frescor por classe, fonte e classe do ativo, aplica condições, persiste disparos idempotentes por geração e solicita Push.
- [x] Histórico dos últimos disparos disponível no endpoint e na interface.
- [x] RPC atômica: desativar preserva geração; reativar incrementa uma vez; repetição não incrementa.
- [x] Migration `006_radar_alert_generation.sql`, grants restritos, RLS e testes de isolamento.
- [x] Testes de validação, integração entre dois usuários e concorrência da reativação.
- [x] Tela do Radar conectada ao endpoint no frontend.
- [x] Aditivo de arquitetura aprovado para cotações externas, limitado a dados públicos de mercado; dados bancários/pessoais continuam sem agregador externo.
- [x] Adaptador brapi.dev para B3 (ações/FIIs/ETFs/BDRs), parser validado, cache 30 min, limite atômico móvel de 12.000 chamadas em 30 dias, rotação justa, fonte e timestamp persistidos e exibidos.
- [x] Worker de atualização de cotações protegido por JWT + segredo interno e incluído no cron antes da avaliação do Radar; permanece bloqueado por licença ausente.
- [x] Preço de referência manual por ativo, com validação decimal, origem e horário; não altera livro de operações/custo médio e não alimenta o Radar.
- [x] Coluna `price_source` distingue preço manual de fonte automática; preços legados sem origem ficam identificados como desconhecidos.
- [ ] Habilitar cotações automáticas/exibição após licença adequada; `BRAPI_PUBLIC_DISPLAY_APPROVED` permanece falsa/ausente. Preço manual é a alternativa ativa e não aciona o Radar.
- [ ] Feed automático de cripto e renda fixa: não incluído no plano gratuito/licença pública validada; não serão usados feeds pagos sem autorização de custo.

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
- [x] Adaptador Meta Cloud API e validação HMAC do webhook sobre o corpo bruto.
- [x] Endpoint autenticado de geração de código temporário, hash SHA-256, expiração de 10 minutos e rate limit de 3 códigos por hora.
- [x] UI de vínculo, desvinculação e consentimento explícito do resumo semanal; gerar código não ativa o resumo.
- [x] RPC `whatsapp_pending_confirm` valida vínculo, referências e payload e cria o lançamento uma única vez sob lock transacional.
- [x] Adaptador Meta, webhook HMAC, worker de inbox/parser, sender outbox e resumo semanal com consentimento/opt-out implementados.
- [ ] Testar envio/recebimento com credenciais Meta reais e configurar webhook HTTPS.
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
- [ ] Auditoria final de acessibilidade e testes reais do usuário no Safari e no app instalado na Tela de Início do iPhone.

## Configuração necessária do backend (ainda não aplicada)

O provedor usa a OpenAI Responses API. Antes de habilitar chamadas reais, o ambiente de Edge Functions precisa receber, somente como secrets:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_ASSISTANT_DAILY_LIMIT` e `AI_ASSISTANT_MONTHLY_LIMIT`
- `AI_RECEIPT_DAILY_LIMIT` e `AI_RECEIPT_MONTHLY_LIMIT`
- `AI_RATE_LIMIT_PER_HOUR`
- `SUPABASE_SERVICE_ROLE_KEY` (somente para as RPCs internas de reserva/finalização; nunca usado para consultas de dados do usuário)

Geração local do par VAPID: defina `PUSH_VAPID_SUBJECT` no terminal e execute `npm run generate:vapid`. O script imprime as variáveis públicas e privadas; configure a chave privada e o segredo interno somente como secrets no backend e a chave pública como variável de build `VITE_PUSH_VAPID_PUBLIC_KEY`. Não versione a saída do comando.

Para agendar recorrências e Radar, configure no GitHub a variável `WORKERS_ENABLED=true` e os secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RECURRENCE_WORKER_SECRET` e `RADAR_WORKER_SECRET`. O workflow `.github/workflows/scheduled-workers.yml` executa a cada 15 minutos e também aceita execução manual. Para notificações Radar, configure ainda `PUSH_WORKER_SECRET` e as chaves VAPID no Supabase. O worker materializa apenas lançamentos `planned`; não liquida nem altera saldos realizados.

Para Radar, configure `RADAR_WORKER_SECRET` (mínimo 32 caracteres) para invocar `radar-worker` server-to-server com JWT de serviço. O worker consome apenas `quote_cache` com timestamp recente e fonte declarada; nenhuma fonte financeira foi conectada.

Para Push, a etapa de envio usa o worker interno `push-worker`. Antes de habilitá-lo, o ambiente precisa receber os secrets `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` (PKCS#8 em base64url), `PUSH_VAPID_SUBJECT` e `PUSH_WORKER_SECRET` (mínimo 32 caracteres), além de `SUPABASE_SERVICE_ROLE_KEY` já descrito acima. O frontend recebe somente a chave pública em `VITE_PUSH_VAPID_PUBLIC_KEY`. A chamada do worker deve ocorrer exclusivamente server-to-server com JWT de serviço e `x-worker-secret`; nenhum agendamento ou envio real foi ativado.
 
Os limites são obrigatórios e uniformes, sem planos ou diferenciação comercial. Não foram inventados valores nem configurados segredos remotos. Os endpoints exigem `consent: true`; o frontend apresenta consentimento individual e o reseta após cada solicitação. Os documentos e fatos enviados são processados externamente pelo provedor configurado; `store: false` evita solicitar armazenamento da resposta pela API, mas não é promessa de retenção zero pelo provedor.

A extração do comprovante é efêmera durante a chamada de IA. Após confirmação humana, o arquivo original é armazenado no bucket privado `receipt-files`, com metadados e SHA-256 em `receipt_files`. Download usa URL assinada de curta duração; exclusão remove o objeto e o lançamento.

## Validação pendente

O HEAD `462fda114c0a9bc089ce9d76e234d20aea805ad7` passou integralmente na execução [#45375652553](https://github.com/theuuswillian/aplicativomobile/actions/runs/45375652553): `validate`, `edge-runtime`, `sql` e `edge-integration` concluídos com sucesso; `lockfile` foi ignorado por não haver alteração de lockfile. A validação incluiu lint, política arquitetural, verificação de segredos, shell, TypeScript, testes, build, Playwright, responsividade, offline, acessibilidade, PostgreSQL 17 e integração Supabase local.

O CI verde não significa que a Fase 3 esteja concluída. Permanecem credenciais/configuração Meta, secrets remotos, testes reais de integrações externas e validação manual no Safari e no app instalado no iPhone. A fonte automática de cotações segue bloqueada por licença; preço manual está disponível. O workflow `Scheduled workers` já está preparado, mas começa desativado até a variável `WORKERS_ENABLED=true` e os secrets necessários serem configurados no GitHub.

- Última validação integral concluída: HEAD `462fda114c0a9bc089ce9d76e234d20aea805ad7`; GitHub Actions [#45375652553](https://github.com/theuuswillian/aplicativomobile/actions/runs/45375652553) passou em todos os jobs: Edge Runtime/Deno, PostgreSQL 17 com migrations 001–011, integração local Supabase, lint, policy, secrets, TypeScript, testes, build, Playwright, responsividade, offline e acessibilidade.
- [Branch Fase 3](https://github.com/theuuswillian/aplicativomobile/tree/fase-3-backend).
- [PR #2](https://github.com/theuuswillian/aplicativomobile/pull/2), ainda draft e sem merge.
- O teste local de integração cobre perfil, preferências, CORS, Radar, Push, geração de código WhatsApp, bloqueio de workers sem JWT/segredo interno (incluindo quote-feed-worker) e isolamento entre dois usuários.
- O teste PostgreSQL aplica migrations 001–011 e verifica RLS, grants, Storage privado, consentimento WhatsApp, concorrência de metas, confirmação WhatsApp, datas de recorrência, geração concorrente e reativação Radar. A integração local verifica exportação autenticada e bloqueios da exclusão sem confirmação.

A aprovação final exige CI integral verde no HEAD final, auditoria, configuração remota somente autorizada e validação manual do aplicativo pelo usuário. Não relaxar asserts para obter CI verde.

O status do Vercel é separado do GitHub Actions. Nenhum deploy de produção foi solicitado.

## Limites atuais

A Fase 2 continua preservada como base e a PR #1 não será mesclada por esta etapa. Esta branch é derivada da Fase 2; a revisão da Fase 3 será separada. Nenhuma função está implantada no projeto Supabase remoto.


## Integração Meta WhatsApp Cloud API

- Provedor escolhido: Meta WhatsApp Cloud API (decisão aprovada pelo usuário em 23/11/2026).
- `supabase/functions/whatsapp-webhook` implementa GET de verificação `hub.mode`, `hub.verify_token` e `hub.challenge`, além de POST com validação HMAC-SHA256 de `X-Hub-Signature-256` sobre o corpo bruto antes de parsear JSON.
- Webhook limita payload a 1 MiB, filtra identificadores e telefones, persiste mensagens recebidas na inbox com deduplicação por `message_id` e responde 503 quando a persistência falha para permitir retry da Meta.
- `supabase/functions/whatsapp-meta-send` envia texto pela Graph API, registra a outbox por chave idempotente e respeita resultados ambíguos: timeout/rede/5xx ficam `uncertain` sem retry automático; HTTP 429 é `failed_safe`; falhas 4xx ficam `failed`.
- `WHATSAPP_META_VERIFY_TOKEN`, `WHATSAPP_META_APP_SECRET`, `WHATSAPP_META_ACCESS_TOKEN`, `WHATSAPP_META_PHONE_NUMBER_ID`, `WHATSAPP_META_GRAPH_VERSION` e `WHATSAPP_WORKER_SECRET` são secrets/variáveis obrigatórios do Supabase; nenhum valor real deve ser commitado.
- O webhook tem `verify_jwt = false` porque a autenticação de origem é a assinatura HMAC da Meta. O endpoint de envio continua protegido por JWT de serviço e segredo interno.
- Testes automatizados cobrem assinatura HMAC, challenge e extração/validação de mensagens.
- Ainda depende de criar/configurar o app Meta, obter credenciais permanentes, configurar callback HTTPS e assinar o campo `messages`. A inbox possui worker semântico para comandos, vinculação, pendências e resumo semanal; ainda depende de teste com credenciais reais e configuração da conta Meta.


### Atualização — worker Meta Cloud API

- [x] Parser estrito de comandos: `AJUDA`, código de vínculo, `DESPESA`, `RECEITA`, `CONFIRMAR` e `CANCELAR`; mensagens ambíguas não geram lançamento.
- [x] Worker de inbox com reserva atômica, lease/fencing, recuperação de filas com falha/lease expirado e deduplicação por ID de mensagem.
- [x] Vínculo de número por hash SHA-256 do código temporário e telefone Meta.
- [x] Lançamentos recebidos são inseridos somente como pendentes, expiram em 15 minutos e exigem comando de confirmação; a confirmação chama a RPC transacional já existente.
- [x] Conta de destino só é selecionada quando há conta principal ou uma única conta ativa; em caso ambíguo, o worker não escolhe uma conta.
- [x] Cancelamento de pendência por telefone e usuário vinculados.
- [x] Resumo semanal de receitas/despesas realizadas, somente às segundas-feiras, após conferir o opt-in simultâneo em `settings` e `whatsapp_links`; reserva atômica por semana e chave idempotente na outbox.
- [x] Worker incluído no `deno check`, nos testes de parser e no workflow agendado; `verify_jwt = true` no endpoint interno.
- [ ] Validar a execução do worker com Supabase local e credenciais de teste da Meta; nenhum envio real foi feito.
- [ ] Configurar secrets Meta/Supabase/GitHub e webhook HTTPS após o usuário concluir a configuração das contas.
- [ ] Revisar limites/paginação do resumo semanal para escala antes de habilitar para uma base grande.

O workflow agendado requer também o secret GitHub `WHATSAPP_WORKER_SECRET`, diferente dos secrets de recorrência e Radar. No Supabase, o mesmo valor deve existir como Edge Function secret. O worker de WhatsApp usa o mesmo segredo para a chamada interna do endpoint `whatsapp-meta-send`. O cron de 15 minutos processa a inbox; o resumo semanal é tentado às segundas-feiras e a RPC impede repetição da mesma semana.

A fonte de cotações está detalhada no aditivo aprovado abaixo. A ativação permanece bloqueada até confirmação escrita de licença para exibição pública limitada.


### Atualização — fonte externa de cotações aprovada (24/11/2026)

- A autorização do usuário revisou o contrato apenas para dados públicos de mercado; não autoriza cobranças nem conexão de contas bancárias.
- Provedor inicial escolhido: brapi.dev, plano Gratuito, ações/FIIs/ETFs/BDRs em BRL, uma chamada por ticker, atraso de aproximadamente 30 minutos.
- Migration `010_market_data_provider.sql`: contador diário privado com limite agregado móvel de 30 dias e reserva atômica exclusiva da service role; teto interno de 12.000 chamadas em qualquer janela móvel de 30 dias.
- Edge Function `quote-feed-worker`: no máximo quatro tickers por execução a cada 15 minutos, cache de 30 minutos, cursor rotativo, timeout, limite de resposta, validação de ticker/moeda/preço/horário e persistência em `quote_cache`/preço de referência dos ativos.
- Radar tolera até 45 minutos para cotações B3 atrasadas; cripto mantém janela própria de 15 minutos. Disparos e notificações guardam/exibem fonte e horário da observação.
- A API key é somente `BRAPI_API_KEY` no Supabase. O worker exige `QUOTE_WORKER_SECRET` e `BRAPI_PUBLIC_DISPLAY_APPROVED=true`.
- **Bloqueio jurídico deliberado:** termos brapi proíbem redistribuição; FAQ admite aplicativos, mas ressalva licenças adicionais para redistribuição. Não habilitar o flag até obter confirmação escrita para exibição limitada no GranaViva gratuito.
- Cripto permanece sem feed automático: endpoint brapi exige Startup/Pro; CoinPaprika Free é pessoal e a licença de redistribuição exige Enterprise; CoinGecko Demo não concede direitos comerciais. Nenhuma despesa foi autorizada.
- Nenhuma migration foi aplicada no Supabase remoto, nenhum secret foi configurado e nenhum deploy foi realizado.


### Decisão aprovada — caminho de cotações sem custo adicional

- Manter o adaptador Brapi e o worker já implementados, mas sem ativar feed público: a flag de licença continua ausente/desligada.
- Não contratar B3/UP2DATA nem plano pago de dados nesta etapa; nenhuma despesa foi autorizada.
- Não usar widgets TradingView como fonte do Radar ou para atualizar preços de carteira. Eventual uso visual deverá ser avaliado separadamente quanto aos termos.
- Implementar como próximo passo um campo de preço de referência manual por ativo, com origem “informado pelo usuário” e data/hora explícitas. Essa funcionalidade ainda não está concluída no frontend; hoje a tela apenas exibe preço recebido pelo feed e informa indisponibilidade quando não há cotação.
- O preço manual não deve alimentar o Radar automático nem alterar operações, custo médio, saldos ou patrimônio realizado. A UI deve diferenciá-lo visualmente de uma cotação de mercado.
- Manter ações/FIIs/ETFs/BDRs preparados para fonte licenciada no futuro; cripto e renda fixa continuam sem feed automático.

### Secrets e variáveis adicionais — cotação B3

Somente depois de obter confirmação escrita da brapi.dev para exibição limitada no GranaViva:
- Supabase Edge Function secrets: `BRAPI_API_KEY`, `QUOTE_WORKER_SECRET` e `BRAPI_PUBLIC_DISPLAY_APPROVED=true`.
- GitHub Actions secret: `QUOTE_WORKER_SECRET` (mesmo valor do Supabase, diferente de todos os outros secrets de workers).
- GitHub Actions repository variable: `BRAPI_PUBLIC_DISPLAY_APPROVED=true`.
- A API key da brapi nunca vai ao GitHub Actions, frontend ou repositório.
- Para manter a integração desligada, não configure o flag acima. O cron continua processando recorrências, Radar com cache existente e WhatsApp.

O plano Gratuito divulgado pela brapi tem 15.000 chamadas/mês e um ticker por chamada. O worker aplica teto próprio de 12.000 em qualquer janela móvel de 30 dias, no máximo quatro consultas por execução a cada 15 minutos, cache de 30 minutos e cursor rotativo. O plano Gratuito não habilita o endpoint de cripto documentado; cripto permanece sem feed.

A migration 010 ainda está apenas na branch; precisa ser aplicada ao Supabase remoto somente após autorização específica e validação do ambiente.

## Preparação para ativação remota

- Guia operacional de configuração e aceite: [CONFIGURACAO-REMOTA-FASE-3.md](./CONFIGURACAO-REMOTA-FASE-3.md).
- O código foi revisado para não marcar preço manual antigo como cotação de mercado desatualizada; o aviso de atraso de 45 minutos aplica-se somente à fonte automática Brapi.
- Preview Vercel atualizado para o commit `911fe20ec6ca73fbae60a240572ac30baffb8761`: [abrir Preview](https://granaviva-p6s8ubj1c-grana6.vercel.app). É uma implantação Preview, não produção; o acesso web automatizado não confirmou o funcionamento com backend, pois não há projeto Supabase acessível pela conexão atual.
- A conexão Supabase consultada mostra a organização, mas nenhum projeto disponível. Antes de qualquer migration/deploy remoto, é necessário selecionar/vincular o projeto correto ou conceder acesso à conexão. Não criar projeto nem assumir custo sem confirmação.
- CI para o commit de código `911fe20ec6ca73fbae60a240572ac30baffb8761`: [#45377392284](https://github.com/theuuswillian/aplicativomobile/actions/runs/45377392284); Edge Runtime passou, enquanto validação, SQL e integração local estavam em execução na última consulta. O commit seguinte atualiza somente documentação.


## Atualização de execução — 24/11/2026

- [x] Migrations 001–011 aplicadas no projeto Supabase Brasil `dvddqexnvllrxogbwmdf`, região São Paulo (`sa-east-1`).
- [x] Migration 012 (`20261124113232_remove_duplicate_recurrence_index_and_lock_rls_trigger.sql`) aplicada e verificada. Removeu o índice duplicado e revogou execução direta de `rls_auto_enable()` para os papéis de API, preservando o event trigger automático.
- [x] Auditoria pós-correção: 0 tabelas públicas sem RLS; bucket `receipt-files` privado; alertas de execução da função e índice duplicado corrigidos.
- [x] CI integral aprovado no commit `1c141f53ad4062aad41a78e09763fe02563aedf2`: `validate`, `sql`, `edge-runtime` e `edge-integration` passaram. Execuções: [#45385601229](https://github.com/theuuswillian/aplicativomobile/actions/runs/45385601229) e [#45385611245](https://github.com/theuuswillian/aplicativomobile/actions/runs/45385611245).
- [x] Vercel `granaviva`: variáveis públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` cadastradas para Preview somente na branch `fase-3-backend` e para Development. Nenhuma variável foi criada para Production.
- [ ] Preview correspondente ao commit validado ainda não encontrado. Há um Preview anterior READY, mas associado a commit antigo; não tratá-lo como validação do HEAD atual. A tentativa anterior de build encontrou limite de deploy do Vercel.
- [ ] Implantar Edge Functions no Supabase após revisão e autorização específica.
- [ ] Configurar secrets de backend e Meta/OpenAI/VAPID diretamente nos painéis, após definição e geração segura dos valores.
- [ ] Executar testes de aceite remoto e testes manuais no Safari e app instalado do iPhone.
- [ ] Manter `WORKERS_ENABLED` ausente/falso e cotações Brapi desativadas até concluir aceite e licença.

O CI verde valida o código e as migrações em ambiente local; não comprova chamadas reais de Edge Functions, integrações Meta/OpenAI/Push, Preview atual ou experiência no iPhone. PR #2 permanece draft e sem merge; produção permanece intacta.


## Bloqueio final de implantação — 24/11/2026

- [x] As duas execuções de CI após a atualização da documentação terminaram com sucesso: [#45386408380](https://github.com/theuuswillian/aplicativomobile/actions/runs/45386408380) e [#45386401152](https://github.com/theuuswillian/aplicativomobile/actions/runs/45386401152). Jobs `validate`, `sql`, `edge-runtime` e `edge-integration` passaram; `lockfile` foi ignorado por não haver alteração relevante.
- [ ] Novo Preview Vercel pendente: a tentativa de criar deployment para o HEAD `589c544b4a8697e4c402f972eb3267ab2eb366db` retornou HTTP 402 `api-deployments-free-per-day`, com `retryAfter=86400` (24 horas). Não mudar plano ou habilitar cobrança automaticamente.
- [ ] O Preview READY atual `dpl_EN9mGpbFyre3jzwr3fyMeWosEcMa` aponta para commit anterior `b35ef5e5adab48c9f3b085118ccd4d43fd1daf55`; não é evidência de build do HEAD atual.
- [ ] Supabase Edge Functions: nenhuma implantada no projeto brasileiro. O deploy deve ocorrer após conferir os secrets obrigatórios; não publicar endpoints que dependam de credenciais ausentes.
- [ ] Secrets e integrações que dependem de contas/credenciais do proprietário: chave OpenAI, credenciais Meta WhatsApp, chaves VAPID e segredos internos distintos para workers. Configurar diretamente nos painéis oficiais; nunca enviar no chat.
- [ ] Aceite final no Safari e no app instalado (PWA) depende do Preview atualizado e das credenciais acima. Workers e Brapi continuam desligados.


## URL canônica aprovada e CI — 24/11/2026

- URL provisória oficial aprovada: `https://granaviva-rust.vercel.app`, domínio Vercel já vinculado e verificado no projeto `granaviva`.
- `granaviva.vercel.app` não pode ser usado: a Vercel informou que já está atribuído a outro projeto.
- Valor exato para configurar no Supabase Edge Function Secrets: `APP_ORIGIN=https://granaviva-rust.vercel.app`. A gravação remota ainda está pendente porque a conexão disponível não oferece ferramenta para cadastrar Edge Function Secrets; o valor foi registrado no guia operacional.
- CI no HEAD `493c367d309bed14e506011d1e66148d1cb27034`, execução [#45386967728](https://github.com/theuuswillian/aplicativomobile/actions/runs/45386967728): `validate`, `sql`, `edge-runtime` e `edge-integration` passaram; `lockfile` foi ignorado normalmente.
- Nenhuma Edge Function foi publicada, nenhum worker foi habilitado e produção permanece intocada.


## Revisão técnica complementar — 24/11/2026

- [x] CI integral no HEAD documental `59210ecd4020811e6216e7545a1dcf7b7481799d`: execuções [#45387789542](https://github.com/theuuswillian/aplicativomobile/actions/runs/45387789542) (PR) e [#45387783934](https://github.com/theuuswillian/aplicativomobile/actions/runs/45387783934) (push) concluídas com sucesso. Em ambas passaram `validate`, `sql`, `edge-runtime` e `edge-integration`; `lockfile` foi ignorado conforme condição do workflow.
- [x] Revisão do workflow agendado: permanece opt-in por `WORKERS_ENABLED`; execução manual também exige seleção explícita `run_workers=true`. Nenhuma execução foi disparada.
- [x] Revisão de configuração: `APP_ORIGIN` continua pendente de cadastro manual no Supabase; o domínio oficial provisório permanece `https://granaviva-rust.vercel.app`.
- [x] Confirmação de estado: PR #2 permanece draft e aberta; nenhuma Edge Function foi implantada; nenhum worker, feed Brapi ou ambiente Production foi ativado.
- [ ] Limitações de escala a resolver antes de ampliar operação: `radar-worker` consulta no máximo 1.000 alertas por execução; o resumo semanal WhatsApp consulta no máximo 500 vínculos por execução. Planejar paginação/batches e testes de carga antes de habilitar para uma base maior.
- [ ] A tentativa de Preview atualizado continua bloqueada pelo limite temporário de deployments da Vercel; o CI verde não substitui o teste manual no Safari/PWA.

**Nota de atualização:** este registro é o mais recente e prevalece sobre referências históricas anteriores deste documento que indiquem migrations 001–011 apenas na branch ou CI ainda em andamento. O projeto Supabase Brasil já recebeu migrations 001–012, conforme verificação remota registrada acima.



## Correção de paginação dos workers — 24/11/2026

- [x] `radar-worker` deixou de depender do limite único de 1.000 alertas. Agora percorre páginas de 200 registros com cursor keyset (`created_at,id`), preservando a ordenação e a chave idempotente de disparo por alerta/geração.
- [x] Resumo semanal WhatsApp deixou de consultar um conjunto fixo de até 500 vínculos. Agora seleciona até 10 vínculos ainda não reservados para a semana atual (`last_summary_week`), ordenados por usuário; cada execução continua do próximo lote após a RPC atômica de reserva.
- [x] Vínculos sem consentimento efetivo nas preferências são marcados como tratados para a semana pela mesma RPC, evitando que ocupem repetidamente as primeiras posições e impeçam o avanço dos lotes.
- [ ] A paginação do Radar percorre os lotes dentro de uma única invocação. Antes de habilitar workers em produção, ainda é necessário testar volume elevado e duração máxima; se a execução exceder o limite da Edge Function, a próxima evolução será persistir o cursor entre invocações.
- [ ] A cadência de 15 minutos do workflow significa até 10 resumos semanais por execução agendada; validar backlog e capacidade com dados sintéticos antes de ativar `WORKERS_ENABLED`.
- [ ] CI do código atualizado está em execução; não considerar aprovado até todos os jobs do HEAD final terminarem com sucesso.
- Nenhuma migration nova foi criada/aplicada, nenhuma Edge Function publicada, nenhum worker ativado e nenhum ambiente Production alterado.

## Confiabilidade dos workers — checkpoint e retry seguro (24/11/2026)

- [x] Nova migration 20261124195000_worker_checkpoint_and_whatsapp_summary_jobs.sql: checkpoint durável do Radar, lease com fencing token, estado isolado por varredura/símbolo e fila persistente de resumos semanais.
- [x] radar-worker processa uma página limitada por invocação e grava o cursor apenas após concluir a página. Se a execução cair antes do checkpoint, a próxima invocação retoma do cursor anterior após expirar o lease.
- [x] Se o Radar já gravou radar_fires mas a notificação falhou ou a execução caiu, a retomada tenta novamente a entrega com a mesma delivery_key; o push-worker é responsável pela idempotência de entrega.
- [x] Resumos WhatsApp persistem telefone e texto antes do envio; a outbox Meta usa a mesma chave idempotente em cada tentativa. failed_safe/busy podem ser tentados novamente; uncertain não é reenviado automaticamente; falhas definitivas são encerradas.
- [x] Jobs de resumo usam lease e fencing; o consentimento é verificado novamente imediatamente antes do envio. last_summary_week só avança após estado terminal ou opt-out.
- [x] Migração recupera da outbox os resumos antigos marcados failed_safe, preservando texto, telefone e chave idempotente.
- [x] Testes de concorrência SQL adicionados para lease exclusivo, cursor retomável, rejeição de fencing token antigo e retry/finalização de resumo semanal.
- [ ] A migration é somente código versionado na branch; ainda não foi aplicada ao Supabase remoto.
- [ ] CI dos novos arquivos deve concluir integralmente no HEAD final antes de considerar a correção validada.
- [ ] Fazer teste de carga/tempo real em ambiente local ou Preview; manter workers desativados até aceite.
- Nenhuma Edge Function foi publicada, nenhum worker foi ativado e nenhum ambiente Production foi alterado.
- [x] A camada Push também passou a registrar o resultado por assinatura. Somente HTTP 429 é retry seguro; timeout/resultado ambíguo vira estado uncertain e não é reenviado automaticamente. A chave por dispositivo impede repetir notificações já confirmadas.
- [x] O Radar mantém o checkpoint na página enquanto houver retry seguro de push pendente; quando todos os dispositivos forem confirmados, removidos ou ficarem em estado ambíguo terminal, a página pode avançar.
- [x] Teste SQL adicional cobre retry de HTTP 429 e idempotência após entrega confirmada por assinatura.
- [x] Chaves de push antigas, sem resultado individual por assinatura, são migradas para estado uncertain; isso evita duplicar notificações já possivelmente entregues durante a transição.


## Atualização de execução — migration 013 e drenagem do Radar (24/11/2026)

- [x] Migration `worker_checkpoint_and_whatsapp_summary_jobs` aplicada ao Supabase Brasil (`dvddqexnvllrxogbwmdf`); o histórico remoto confirma 13 migrations.
- [x] Estruturas de checkpoint Radar, jobs de resumo WhatsApp e tentativas Push verificadas no banco. As três tabelas têm RLS; acesso direto de `anon`/`authenticated` revogado; as oito RPCs novas estão restritas a `service_role`.
- [x] `APP_ORIGIN=https://granaviva-rust.vercel.app` cadastrado no Supabase conforme confirmação do operador. O conector não permite ler o valor dos secrets, portanto essa confirmação não é uma verificação por leitura.
- [x] Auditoria Supabase de saúde: sem findings. Permanecem avisos informativos de tabelas backend-only com RLS sem políticas e avisos de índices/FKs para avaliação com carga real.
- [x] Revisão identificou que o worker Radar processa uma página de 20 alertas por invocação, mas o workflow não consumia `has_more`.
- [x] Workflow `Scheduled workers` atualizado para percorrer até três páginas do Radar por execução, interromper se detectar lease ocupado ou ausência de próxima página e usar timeout de 130 segundos por chamada. O limite do job foi ampliado para 10 minutos. A execução continua opt-in e não foi disparada.
- [ ] CI do novo workflow e dos documentos atualizados precisa concluir no HEAD final antes de considerar esta alteração validada.
- [x] Processamento WhatsApp limitado a até duas mensagens recebidas e dois resumos por invocação; o cron permite até 130 segundos para essa chamada. A fila de resumos evita reenfileirar usuários com job existente e ordena jobs pendentes pelo mais antigo para reduzir starvation.
- [ ] Edge Functions ainda não publicadas; secrets restantes de backend/OpenAI/Meta/VAPID ainda precisam ser configurados e validados nos painéis oficiais.
- [ ] Teste remoto real e aceite Safari/PWA dependem de publicação controlada, credenciais e Preview atualizado.
- Nenhum worker foi ativado, nenhum endpoint foi publicado, nenhuma Brapi foi ativada e nenhuma alteração foi feita em Vercel Production.

**Esta atualização prevalece sobre notas históricas acima que digam que a migration 013 ainda não foi aplicada, que `APP_ORIGIN` está pendente ou que o Radar não possui checkpoint persistente.**


## Ajuste de duração e justiça da fila WhatsApp — 24/11/2026

- [x] `whatsapp-worker` limita cada execução a duas mensagens recebidas e dois resumos semanais, com no máximo quatro chamadas externas sequenciais e timeout interno de 25 segundos por envio.
- [x] A seleção de novos resumos exclui usuários que já possuem job para a semana; jobs pendentes são processados por `updated_at` mais antigo primeiro, evitando que os mesmos primeiros usuários bloqueiem a entrada de outros na fila.
- [x] O workflow permite até 130 segundos para a chamada WhatsApp, sem retries automáticos de POST que poderiam ocorrer após resultado ambíguo.
- [ ] CI do HEAD final precisa validar os ajustes de worker e workflow antes de qualquer publicação.
- Workers continuam desativados; nenhuma Edge Function foi publicada.

## Retry seguro de respostas WhatsApp — 24/11/2026

- [x] Corrigido o worker de inbox: respostas recusadas com HTTP 429 (failed_safe) e reservas ainda ocupadas (busy) retornam à fila para nova tentativa com a mesma chave idempotente.
- [x] Estados sent, failed e uncertain encerram a mensagem recebida; uncertain permanece terminal para evitar duplicação quando o provedor pode ter aceitado o envio.
- [x] Política isolada em supabase/functions/_shared/whatsapp-delivery.ts e coberta por testes Vitest em tests/whatsapp-delivery.test.ts.
- [ ] CI do HEAD atualizado ainda precisa concluir integralmente; o status Vercel atual reporta bloqueio de quota de Preview e não substitui os jobs do GitHub Actions.
- Nenhuma Edge Function publicada, nenhum envio real feito, workers desligados e Production intacta.


## Evolução visual do GranaViva — 25/11/2026

### Primeira etapa — Dashboard, privacidade e base visual
- [x] Refinada a camada visual premium Obsidian/Bento em src/styles/visual-refresh.css, preservando o CSS próprio e os tokens existentes.
- [x] Dashboard reorganizado visualmente em Bento cards para desktop e layout responsivo em telas menores.
- [x] Refinados cards de saldo, indicadores, fluxo mensal, últimos lançamentos, formulários, painéis e navegação inferior.
- [x] Modal existente de novo lançamento recebeu acabamento glassmorphism, hierarquia visual e estados de interação; seus destinos funcionais existentes foram preservados.
- [x] Adicionado controle de privacidade visual no saldo livre do Dashboard: o usuário pode desfocar os principais valores do resumo sem alterar os dados ou cálculos.
- [x] Mantidos tema claro/escuro, foco visível e respeito a prefers-reduced-motion.
- [x] Nenhuma dependência visual nova foi adicionada; a implementação reutiliza React, Lucide e CSS já presentes.
- [x] Nenhuma migration, alteração de dados, configuração remota, Edge Function, worker ou integração foi executada.

### Commits
- ad188492f20eb1e4dd5ae52b6d205581312de4f0 — style: refine GranaViva premium dashboard and modal
- 66f329ff5369547fdf137a512d271d6221f40497 — feat: add private balance visibility control
- 42ff92b1644b7c943b9e4234a587bf5009f8325e — style: add privacy control to dashboard balances

### Validação e limites
- A branch continua fase-3-backend; PR #2 permanece aberta, draft e sem merge.
- A CI do HEAD 42ff92b1644b7c943b9e4234a587bf5009f8325e ainda não está confirmada. A consulta disponível de workflows retorna apenas execuções associadas a eventos de pull request e não apresentou uma execução para este HEAD; o status agregado também não apresentou checks. Portanto, não declarar lint, build ou testes aprovados para estes commits.
- Não houve deployment Preview nem Production. A Production permanece intacta.
- A validação visual real em Safari e no PWA instalado no iPhone continua pendente.
- Próximas etapas da evolução: aprofundar a apresentação dos cartões/faturas; revisar a carteira, alocação e proventos; refinar A Receber, horas extras, relatórios e acessibilidade; executar CI integral no HEAD consolidado antes de considerar Preview.

### Segunda etapa — Cartões e Faturas (25/11/2026)
- [x] Reorganizada a lista de cartões em painéis responsivos, destacando limite total, valor utilizado, limite disponível, instituição e datas de fechamento/vencimento.
- [x] Histórico de pagamentos de fatura recebeu agrupamento visual individual, com valor, data e conta de origem mais fáceis de identificar.
- [x] Ações existentes de arquivar cartão, registrar pagamento e excluir pagamento foram preservadas.
- [x] Nenhuma regra de cálculo de limite, fechamento, vencimento, pagamento parcial, ledger ou contabilização foi alterada.
- [x] Alterações limitadas a src/App.tsx e src/styles/visual-refresh.css; nenhuma dependência ou migration adicionada.
- Commits: 6986975c4e3debb26dddb0e1075db137526c54b5 (markup) e 67aadee276c5f661c4a5382338721c9b5be9304e (estilos).
- [ ] CI para o HEAD 67aadee276c5f661c4a5382338721c9b5be9304e ainda não foi confirmada pelas consultas disponíveis. A última CI integral confirmada permanece verde no commit eaecf201833edbe43eb30f6ba7cc6e81685fd1dc; ela não valida automaticamente estas mudanças visuais.
- [ ] Teste visual manual em Safari e PWA instalado permanece pendente.
- Nenhum deployment, merge, alteração no Supabase remoto ou mudança em Production.

### Terceira etapa — Investimentos, A Receber, Relatórios e experiência responsiva (25/11/2026)
- [x] Refinada a hierarquia visual da alocação da carteira, separando os grupos por moeda e destacando legenda e valores sem somar BRL e USD.
- [x] Melhorada a leitura do calendário de proventos e do histórico de eventos, preservando os rótulos de valores manuais e estados anunciados/previstos/recebidos.
- [x] A área A Receber e Extras recebeu painéis de resumo para empréstimos em aberto e previsão de horas extras, além de organização responsiva dos formulários e históricos.
- [x] Relatório mensal recebeu cartões de métricas e lista de despesas por categoria com adaptação para telas estreitas.
- [x] Refinados estados de foco visível e navegação inferior responsiva, preservando prefers-reduced-motion.
- [x] Alterações desta etapa somente em src/styles/visual-refresh.css; nenhuma regra financeira, RPC, migration, dependência ou dado foi alterado.
- Commit de estilo: 2fb0109c8a561182992848a9d31bcbd48c878e42.
- [ ] CI integral para o HEAD consolidado ainda precisa concluir. A execução 45600122585 já passou em SQL, Edge Runtime e Edge Integration; o job validate estava executando os testes Playwright de navegador, responsividade, offline e acessibilidade na última consulta. Essa execução foi iniciada antes do commit de estilo 2fb0109 e não valida esse commit.
- [ ] Validação manual real em Safari e no PWA instalado no iPhone continua pendente; precisa de Preview atualizado e teste no dispositivo do operador. A automação Chromium/WebKit não substitui o aceite visual no iPhone.
- Nenhum Preview/Production, merge, alteração no Supabase remoto ou ativação de workers foi executado.


## Refinamento visual mobile — 25/11/2026
- [x] A referência visual enviada pelo usuário foi adotada como direção principal para a interface: estética financeira premium escura, superfícies em camadas, verde como acento, cartões compactos e navegação inferior em dock.
- [x] Primeira camada de refinamento aplicada em `src/styles/visual-refresh.css`: cabeçalho, saudação, indicador do Radar, cartões do resumo, ação principal, painéis, tema claro e navegação de cinco áreas.
- [x] Reserva de espaço inferior ampliada para impedir que a navegação fixa cubra o conteúdo durante a rolagem; regras comuns para Safari e PWA, preservando safe areas.
- [x] Alteração somente de apresentação; nenhuma lógica financeira, dado, migration, configuração remota ou dependência foi alterada.
- [x] CI integral no HEAD `af4e6011d00f0f65525929452aeb9c2668eba6ef`: [run 45602861171](https://github.com/theuuswillian/aplicativomobile/actions/runs/45602861171) — validate (lint, políticas, segredos, TypeScript, testes, build, browser/WebKit, responsividade, offline e acessibilidade), SQL/PostgreSQL 17, Edge Runtime e integração local concluídos com sucesso; lockfile ignorado conforme esperado.
- [x] Preview criado após CI verde para o commit de código `af4e6011d00f0f65525929452aeb9c2668eba6ef`, estado `READY`: https://granaviva-3tk5z27rz-grana6.vercel.app (deployment `dpl_42Eus7iNYzACuy8EKXk9ENrkzhGi`).
- [ ] A referência também contém detalhes de conteúdo (metas e resumo mensal) que ainda precisam ser comparados com os módulos e dados reais existentes; não foram criados gráficos ou valores fictícios.
- Vercel Production intacta; PR #2 continua aberta, em draft e sem merge.


## Reforma visual integrada das áreas — 25/11/2026
- [x] Capturas reais do Safari analisadas: em Cartões e Conta/Relatórios havia divergência de largura entre cabeçalho e painéis; resumo da área e formulários apresentavam densidade/tipografia pequenas; dock fixo interferia visualmente com a área inferior junto à barra do Safari.
- [x] Corrigida a restrição artificial de largura do `.app-frame` (limite de 560px) e padronizada largura/box sizing para cabeçalho, dashboard, painéis e ações, com limite responsivo único de 920px.
- [x] Padronizados os painéis de todas as áreas, cabeçalhos, texto explicativo, chips de navegação interna, cartões-resumo, campos e botões de formulário, listas e métricas de relatórios.
- [x] Formulários em telas estreitas passam a uma coluna para evitar campos comprimidos; resumo da área passa a duas colunas com o cartão ímpar ocupando a linha.
- [x] Dock inferior reposicionado no Safari para não ficar colado à barra do navegador; aumentada a reserva de rolagem e mantida regra separada para PWA standalone.
- [x] CI integral no commit de código `df182b4fa841eb7455f451237e840f3a7ef0b466`: [run 45604987206](https://github.com/theuuswillian/aplicativomobile/actions/runs/45604987206) — validate (lint, políticas, segredos, TypeScript, testes, build, Chromium/WebKit, responsividade, offline e acessibilidade), SQL/PostgreSQL 17, Edge Runtime e integração local concluídos com sucesso; job lockfile ignorado conforme filtro esperado.
- [x] Preview consolidado criado após CI verde, estado `READY`, commit exato: https://granaviva-lq4ln39mk-grana6.vercel.app (deployment `dpl_AsEaQCTK2RGLxkGsXJyhSC35GnZP`).
- [ ] Aceite visual manual no Safari e no PWA ainda pendente; solicitar novas capturas das telas Início, Cartões e Conta/Relatórios após o usuário abrir o novo Preview.
- Nenhuma lógica, cálculo, dado, migration, tabela, RLS, RPC, integração, segredo ou configuração remota foi alterada nesta etapa. PR #2 continua aberta/draft/sem merge; Vercel Production permanece intacta.


## Reforma visual Obsidian — lote mobile-first (25/11/2026)
- [x] Consolidada a paleta neutra Obsidian: fundo `#090A0B`, superfícies `#141619`, bordas `#23262B`, verde `#22C55E`, coral `#EF4444`, azul `#3B82F6`, âmbar `#F59E0B` e texto secundário `#9CA3AF`.
- [x] Reforçado o cabeçalho minimalista existente (marca + notificações), sem controles de tema ou saída no topo.
- [x] Mantida a navegação principal de quatro abas já existente no código: Início, Gastos, Patrimônio e Conta; Metas e Relatórios continuam como telas secundárias.
- [x] Reforçada a área útil inferior das páginas e o posicionamento da navegação fixa com safe-area para Safari iOS e PWA.
- [x] Recolhidos em drawers expansíveis os formulários de cadastro de contas, cartões e pagamento de fatura; os formulários continuam usando os mesmos handlers, validações e integrações Supabase.
- [x] Preservados dados, cálculos financeiros, moedas separadas, endpoints e schema remoto.
- Commits do lote: `1e93bb281810abb1fe07ac70f8fdedf437ce7df9`, `9459e9e10c9cd2eb89a64fc27bd72d8163760cb0`, `42f8844b24bb7552a5fd8814098e0696b3798c4e`.
- [ ] CI do HEAD final ainda precisa ser confirmado; não declarar validação automatizada concluída até obter o resultado.
- [ ] Preview novo não solicitado: histórico da PR registra bloqueio de quota Vercel HTTP 402. O Preview antigo não deve ser tratado como validação deste lote.
- [ ] Verificação visual manual em Safari e PWA no iPhone permanece pendente.
- [ ] Próxima etapa: reorganizar visualmente os resumos de Gastos e Patrimônio e completar menus secundários de Conta, Metas e Relatórios sem remover funcionalidades existentes.


## Continuação da reorganização das telas — 25/11/2026
- [x] Ações de criação do Radar, ativos, operações e proventos passaram para painéis expansíveis, preservando os formulários e handlers existentes.
- [x] Cadastro de categorias, definição de orçamento, recorrências e novo lançamento passaram para painéis expansíveis na área Gastos.
- [x] Refinados visualmente os painéis secundários, listas, legendas de alocação e menu da Conta para reduzir densidade e melhorar hierarquia.
- [x] Conferida a estrutura JSX por inspeção do arquivo atualizado: 12 aberturas e 12 fechamentos de `details`; cada um dos oito novos painéis possui identificador textual único.
- [x] Nenhuma alteração em lógica de cálculo, RPC, schema Supabase, dados, credenciais ou dependências.
- Commits: `734378aa4ff1f84e0fcb9b57471cf0890ffd9918` (App) e `82badcc7281f03de391a71370312f1b018873a9f` (CSS).
- [ ] CI para o HEAD `82badcc7281f03de391a71370312f1b018873a9f` ainda não apareceu na consulta de execuções associadas ao commit; não declarar lint, testes ou build como aprovados.
- [ ] Preview atualizado permanece pendente por bloqueio de quota Vercel HTTP 402 registrado anteriormente; não reutilizar Preview antigo como se validasse este HEAD.
- [ ] Teste visual manual no Safari/PWA continua pendente.
- [ ] Próxima etapa: revisar a hierarquia das telas secundárias (Metas, Relatórios, Conta) e criar navegação interna acionável para Conexões, Personalização, Segurança e Dados, sem esconder recursos nem mudar suas permissões.
- PR #2 segue aberta/draft/sem merge; Production e Supabase remoto permanecem intocados.


## Metas, relatórios e atalhos da Conta — 25/11/2026
- [x] Cadastro de metas e registro de contribuições recolhidos em painéis expansíveis, mantendo handlers e validações existentes.
- [x] Relatório mensal passou a exibir participação por categoria com barras proporcionais calculadas a partir das despesas realizadas carregadas; não foram adicionados valores fictícios, variações estimadas ou períodos sem dados.
- [x] Menu da Conta agora oferece atalhos para Conexões (área de Gastos, onde ficam WhatsApp/notificações), Personalização (tema existente), Metas e Planejamento e Relatórios.
- [x] Revisão estrutural do App: 14 elementos `details` abertos e 14 fechados; 18 formulários abertos e 18 fechados no arquivo. Conferidos os vínculos dos novos painéis e a preservação do filtro de lançamentos realizados do relatório.
- [x] Nenhuma alteração de schema, RPC, lógica financeira, dados remotos, credenciais ou dependências.
- Commits desta etapa: `2e3263c62fe3edfa027266e944111f7c12706baf` (metas/relatório), `89109dbfd3e677b1224ef632122b7b207f82edfd` (atalhos Conta), `f58f091cc69d87284856ca8650fa14d77a8973ce` (CSS).
- [ ] Consulta de execuções CI para o HEAD `f58f091cc69d87284856ca8650fa14d77a8973ce` retornou lista vazia; lint, typecheck, testes e build ainda não estão confirmados.
- [ ] Preview novo não criado; há bloqueio de quota Vercel HTTP 402 registrado anteriormente. Teste visual Safari/PWA ainda pendente.
- [ ] PIN/Face ID, telas próprias de Segurança e configurações detalhadas de assinatura não existem no fluxo atual inspecionado; não foram simulados nem adicionados como controles falsos.
- PR #2 permanece aberta/draft/sem merge; Production e Supabase remoto não foram alterados.


## Dashboard, Gastos e Patrimônio — refinamento mobile-first — 25/11/2026
- [x] Dashboard recebeu gráfico de linha/área SVG calculado a partir do fluxo líquido realizado dos últimos seis meses; não apresenta rentabilidade ou variação inventada.
- [x] Adicionado resumo mensal de receitas, despesas e saldo usando apenas lançamentos com situação realizada no mês corrente.
- [x] Gastos recebeu gráfico de rosca por categoria, calculado com despesas realizadas do mês e categorias cadastradas pelo usuário; estado vazio explica quando não há movimento.
- [x] Patrimônio prioriza a carteira e a distribuição dos investimentos antes do Radar de preços; preservadas as referências manuais e a separação BRL/USD.
- [x] Aplicada paleta Obsidian neutra nos tokens e superfícies, cartões de resumo, ações rápidas, listas e dock inferior; header minimalista existente preservado.
- [x] Inspeção estrutural: 14 elementos `details` abertos/fechados e 18 formulários abertos/fechados; quatro abas principais; ordem Carteira > Radar > Proventos confirmada.
- [x] Nenhuma mudança em lógica contábil, RPC, schema, dados remotos, integrações, credenciais ou dependências.
- Commits: `ba296362d67a42a9493bbe291cf8a1452b0f64f7` (resumos e donut), `49ccc68621d99269a8ec0fc1db6ab8d7760971a6` (tokens), `423b1740b83566ca52203a6bb7b50956f52715a4` (CSS), `4142008d53fc261b51b7e753006adde89b02dde7` (ordem do patrimônio), `1e34c9048ba1241dc7c9bf5750eafec6ded51361` (gráfico do hero), `cc22c69fa7f5a8bf900e0681f700e40013b7f9e4` (acabamento CSS).
- [ ] CI da branch iniciou como execução `45611112041` (run #1399), estado `pending`; aguardar conclusão antes de considerar validado.
- [ ] Preview não criado nesta etapa; permanece registrado bloqueio de quota Vercel HTTP 402. Não reutilizar URL antiga como se validasse este HEAD.
- [ ] Aceite visual manual no Safari/PWA ainda pendente; esta etapa não foi vista no iPhone.
- PR #2 segue aberta/draft/sem merge; Production e Supabase remoto permanecem intocados.


### Observação de CI após o lote visual
- A execução `45611112041` iniciou no commit de código `cc22c69fa7f5a8bf900e0681f700e40013b7f9e4`, mas foi cancelada após novo commit na mesma branch: lint, políticas, segredos, TypeScript e testes unitários haviam concluído com sucesso; build, browser, SQL e integração local foram cancelados/interrompidos antes da conclusão. Não considerar a CI verde.
- A atualização documental seguinte gerou um novo commit `93f588a4b8b51229d776ac36dc2df42496c7899b`; a execução associada ao push ainda não está exposta pela consulta de runs PR disponível. Confirmar o resultado no painel Actions antes de aceitar o lote.


## Atualização após integração das PRs #6–#8 — 25/11/2026

- [x] PR #6 — viewport/Safari/PWA — mesclada em `fase-2-fundacao`.
- [x] PR #7 — metas de rendimentos — mesclada em `fase-2-fundacao`.
- [x] PR #8 — cadastro de contas e logos bancários locais — mesclada em `fase-2-fundacao`, commit `123fe754db88124e976816fc09ae3dc560a9f9dc`.
- [x] PR #9 foi fechada como duplicata após a PR #8 original ficar mergeable e ser mesclada; não contém mudanças pendentes.
- [x] Preview Vercel do commit `123fe754db88124e976816fc09ae3dc560a9f9dc` concluído com estado `READY`: `https://granaviva-ri31u83iw-grana6.vercel.app`.
- [ ] CI integral no commit de merge consolidado ainda precisa ser confirmado; CI verde dos heads das PRs não substitui o teste combinado pós-merge.
- [ ] PR #1 segue draft e não mergeable contra `main`: divergência de 199 commits à frente e 1 atrás; o commit exclusivo de `main` adiciona/atualiza `scripts/test-edge-local.ts`. Resolver a integração histórica sem force-push e sem apagar testes.
- [ ] Teste manual do Preview no Safari e no PWA do iPhone permanece como aceite final.
