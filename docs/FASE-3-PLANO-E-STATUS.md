# Fase 3 — Backend

**Branch:** `fase-3-backend`  
**Base:** `fase-2-fundacao`  
**Estado:** em execução; nenhum serviço remoto foi alterado.

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

O commit `bd53ebfc18aedeadf992aeaa5c75de7802291dd4` passou integralmente na execução [PR #45305286705](https://github.com/theuuswillian/aplicativomobile/actions/runs/45305286705). Os commits seguintes ampliaram os módulos; a validação integral do HEAD atual está em andamento:
- `validate`: lint, política arquitetural, verificação de segredos, shell, TypeScript, testes, build, Playwright, responsividade, offline e acessibilidade.
- `edge-runtime`: type-check Deno e testes unitários.
- `sql`: migrations, RLS, grants, isolamento e concorrência no PostgreSQL 17.
- `edge-integration`: Auth local, perfil, preferências, CORS, Radar, Push e isolamento entre dois usuários.

O CI verde não significa que a Fase 3 esteja concluída. Permanecem credenciais/configuração Meta, secrets remotos, testes reais de integrações externas e validação manual no Safari e no app instalado no iPhone. A fonte automática de cotações segue bloqueada por licença; preço manual está disponível. O workflow `Scheduled workers` já está preparado, mas começa desativado até a variável `WORKERS_ENABLED=true` e os secrets necessários serem configurados no GitHub.

- Última validação integral concluída: HEAD `824bd9d059555a667b91002d987d2c8e673f45c7`; GitHub Actions [#45366029779](https://github.com/theuuswillian/aplicativomobile/actions/runs/45366029779) passou em todos os jobs: Edge Runtime/Deno, PostgreSQL 17 com migrations 001–010, integração local Supabase, lint, policy, secrets, TypeScript, testes, build, Playwright, responsividade, offline e acessibilidade.
- [Branch Fase 3](https://github.com/theuuswillian/aplicativomobile/tree/fase-3-backend).
- [PR #2](https://github.com/theuuswillian/aplicativomobile/pull/2), ainda draft e sem merge.
- O teste local de integração cobre perfil, preferências, CORS, Radar, Push, geração de código WhatsApp, bloqueio de workers sem JWT/segredo interno (incluindo quote-feed-worker) e isolamento entre dois usuários.
- O teste PostgreSQL aplica migrations 001–010 e verifica RLS, grants, Storage privado, consentimento WhatsApp, concorrência de metas, confirmação WhatsApp, datas de recorrência, geração concorrente e reativação Radar. A integração local verifica exportação autenticada e bloqueios da exclusão sem confirmação.

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
