# Configuração remota — Fase 3 do GranaViva

Este guia é um checklist operacional. **Não coloque valores de secrets neste arquivo, em commits, issues ou conversas.** Configure-os diretamente nos painéis oficiais. Não habilite workers até concluir as etapas de banco, funções e testes.

## 1. Estado e pré-requisitos

- [x] Projeto selecionado: `Aplicativo Mobile`, ref `dvddqexnvllrxogbwmdf`, região São Paulo (`sa-east-1`), PostgreSQL 17. Não criar outro projeto.
- [x] URL pública canônica provisória aprovada: `https://granaviva-rust.vercel.app` (domínio gratuito Vercel já vinculado e verificado no projeto `granaviva`; ainda não é domínio próprio).
- [ ] Confirmar acesso administrativo ao repositório GitHub e ao projeto Vercel.
- [ ] Manter `WORKERS_ENABLED` ausente/falso durante a configuração.
- [ ] Manter `BRAPI_PUBLIC_DISPLAY_APPROVED` ausente/falso: cotação automática continua bloqueada por licença.
- [ ] Não usar um projeto Supabase de produção como ambiente de testes locais.

## 2. Supabase — banco e funções

Depois de confirmar o projeto correto:

1. Conferir o project ref, URL e chaves publicáveis no painel Supabase.
2. Revisar o estado atual das migrations antes de aplicar qualquer DDL.
3. Conferir migrations `001` a `013` em ordem. No projeto brasileiro, as 12 já estão aplicadas e registradas; não reaplicar manualmente.
4. Confirmar RLS, grants, bucket privado `receipt-files` e políticas de Storage.
5. Em **Integrations → Data API**, confirmar que `public` está incluído nos schemas expostos. Projetos novos não expõem automaticamente tabelas novas à Data API por padrão; a inclusão do schema não substitui grants mínimos nem RLS.
6. Implantar as Edge Functions desta branch após revisão e confirmação do projeto de destino.
7. Configurar `APP_ORIGIN=https://granaviva-rust.vercel.app` com a origem HTTPS exata do frontend. Não usar curingas.
8. Configurar os secrets listados abaixo diretamente no Supabase.

### Secrets gerais

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — exclusivamente no backend; nunca em Vite, navegador, GitHub logs ou chat.
- `APP_ORIGIN` — origem HTTPS exata do frontend.

### IA (OpenAI)

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_ASSISTANT_DAILY_LIMIT`
- `AI_ASSISTANT_MONTHLY_LIMIT`
- `AI_RECEIPT_DAILY_LIMIT`
- `AI_RECEIPT_MONTHLY_LIMIT`
- `AI_RATE_LIMIT_PER_HOUR`

Os limites precisam ser inteiros positivos; diário máximo 10.000, mensal máximo 100.000, hora máximo 100.000, e mensal não pode ser menor que diário. Definir limites conservadores compatíveis com orçamento e política de uso antes de ativar a chave. O projeto não deve prometer custo zero de chamadas externas.

### Push (VAPID)

1. Gerar localmente com `PUSH_VAPID_SUBJECT` definido e `npm run generate:vapid`.
2. Guardar a chave privada fora do repositório.
3. Configurar no Supabase:
   - `PUSH_VAPID_PUBLIC_KEY`
   - `PUSH_VAPID_PRIVATE_KEY` (PKCS#8 base64url)
   - `PUSH_VAPID_SUBJECT`
   - `PUSH_WORKER_SECRET` (mínimo 32 caracteres, único)
4. Configurar no frontend/Vercel apenas `VITE_PUSH_VAPID_PUBLIC_KEY`.

### WhatsApp — Meta Cloud API

Configurar no Supabase:
- `WHATSAPP_META_VERIFY_TOKEN`
- `WHATSAPP_META_APP_SECRET`
- `WHATSAPP_META_ACCESS_TOKEN`
- `WHATSAPP_META_PHONE_NUMBER_ID`
- `WHATSAPP_META_GRAPH_VERSION` (formato `vN.N`)
- `WHATSAPP_WORKER_SECRET` (mínimo 32 caracteres, único)

No painel Meta, configurar o webhook HTTPS para `/functions/v1/whatsapp-webhook`, usar o verify token configurado e assinar eventos de mensagens. Validar GET challenge e assinatura HMAC do POST antes de testar envio. Nunca colar access token ou App Secret em conversas.

### Workers internos

Configurar secrets exclusivos:
- `RECURRENCE_WORKER_SECRET`
- `RADAR_WORKER_SECRET`
- `WHATSAPP_WORKER_SECRET`
- `PUSH_WORKER_SECRET`

Cada segredo deve ter pelo menos 32 caracteres, ser diferente dos demais e ter o mesmo valor correspondente no Supabase e no GitHub Actions quando aplicável.

### Cotações B3

Não configurar nem ativar agora:
- `BRAPI_API_KEY`
- `QUOTE_WORKER_SECRET`
- `BRAPI_PUBLIC_DISPLAY_APPROVED=true`

A integração técnica existe, mas o uso público continua bloqueado até licença escrita adequada. Preços manuais são apenas referências e não acionam o Radar.

## 3. GitHub Actions

Em Settings → Secrets and variables → Actions, configurar depois de validar o projeto Supabase:

### Repository secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RECURRENCE_WORKER_SECRET`
- `RADAR_WORKER_SECRET`
- `WHATSAPP_WORKER_SECRET`

O secret de Push é usado pelo backend e não é necessário ao cron atual. Não cadastrar chave OpenAI, Meta ou Brapi no GitHub Actions.

### Repository variables

- Manter `WORKERS_ENABLED` ausente ou `false` até os testes remotos serem aprovados.
- Manter `BRAPI_PUBLIC_DISPLAY_APPROVED` ausente ou `false`.

O workflow `Scheduled workers` executa recorrências, Radar e processamento WhatsApp a cada 15 minutos quando habilitado. A ativação deve ocorrer somente após confirmar migrations, secrets, Edge Functions e testes controlados.

## 4. Vercel — frontend

Configurar para os ambientes adequados:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_PUSH_VAPID_PUBLIC_KEY`

Nunca adicionar `SUPABASE_SERVICE_ROLE_KEY`, tokens Meta/OpenAI, chaves privadas VAPID ou secrets de workers em variáveis `VITE_*`.

As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` já estão cadastradas no projeto Vercel `granaviva` para Preview da branch `fase-3-backend` e Development. Production permanece sem essas variáveis. O Preview do commit validado ainda precisa ser gerado e testado; a última tentativa encontrou limite temporário de builds. Não promover para produção sem aprovação específica.

## 5. Testes de aceite remoto

- [ ] Signup/login/logout e isolamento entre dois usuários.
- [ ] Perfil e preferências com RLS.
- [ ] Criar/editar/excluir lançamentos e conferir valores realizados versus planejados.
- [ ] Recorrências geram apenas itens planejados e sem duplicação.
- [ ] Investimentos: preço manual, origem, horário e ausência de efeito no Radar.
- [ ] Radar não dispara com cache ausente, vencido, origem inválida ou classe incompatível.
- [ ] Push: permissão, inscrição, envio controlado e remoção de endpoint inválido.
- [ ] Comprovante: consentimento, prévia editável, confirmação humana e Storage privado.
- [ ] WhatsApp: challenge, HMAC, deduplicação, lançamento pendente, confirmação explícita e opt-in de resumo.
- [ ] IA: consentimento, limites e falhas sem persistir dados financeiros no provedor além do fluxo documentado.
- [ ] Safari no iPhone e app instalado na Tela de Início: layout, navegação, offline, tema e atualizações.

## 6. Critérios para habilitar operação

Somente habilitar `WORKERS_ENABLED=true` depois que:
- migrations 001–013 estiverem aplicadas e verificadas no projeto certo;
- todas as Edge Functions estiverem implantadas;
- secrets e origem CORS estiverem validados;
- testes remotos controlados tiverem passado;
- consentimentos e limites estiverem configurados.

Cotações automáticas permanecem desativadas independentemente do cron até autorização de licença. Não fazer merge, deploy de produção, compra de plano ou ativação de worker como parte deste checklist sem aprovação específica.


## Estado já realizado em 24/11/2026

- Supabase Brasil: migrations 001–013 aplicadas; RLS habilitado em todas as tabelas públicas e bucket de comprovantes privado.
- GitHub Actions: CI integral verde no commit `1c141f53ad4062aad41a78e09763fe02563aedf2`.
- Vercel: variáveis públicas de URL e publishable key do Supabase Brasil cadastradas para Preview da branch `fase-3-backend` e Development. Nenhuma variável de produção ou secret foi adicionado.
- Ainda não implantadas: Edge Functions; ainda não configurados: secrets de backend, OpenAI, Meta, VAPID e workers.
- `WORKERS_ENABLED` permanece ausente/falso; Brapi permanece desligada por decisão de licença.


## URL canônica aprovada — 24/11/2026

- URL provisória oficial escolhida: `https://granaviva-rust.vercel.app`.
- O endereço foi confirmado como domínio de projeto verificado no Vercel `granaviva`. O nome mais curto `granaviva.vercel.app` já pertence a outro projeto e não pode ser vinculado.
- `APP_ORIGIN=https://granaviva-rust.vercel.app` foi cadastrado no Supabase Brasil pelo operador e confirmado por ele nesta sessão. O valor não é recuperável por leitura do conector; não foi possível validar o conteúdo do secret por consulta.
- Não publicar funções, ativar workers nem alterar produção nesta etapa.


## Atualização de estado remoto — 24/11/2026 (após migration 013)

- [x] Migration 013 `worker_checkpoint_and_whatsapp_summary_jobs` aplicada ao Supabase Brasil (`dvddqexnvllrxogbwmdf`) e confirmada em `list_migrations`.
- [x] Tabelas `radar_worker_state`, `whatsapp_weekly_summary_jobs` e `push_delivery_attempts` criadas com RLS habilitada; grants diretos para `anon` e `authenticated` revogados; RPCs de worker executáveis somente por `service_role`.
- [x] `APP_ORIGIN` foi cadastrado pelo operador com a origem canônica aprovada. A confirmação é operacional; o valor do secret não pode ser lido pelo conector.
- [x] Auditoria de saúde sem alertas.
- [ ] Edge Functions continuam sem publicação; workers continuam desligados.
- [ ] Secrets restantes de serviço, OpenAI, Meta e VAPID precisam ser configurados/confirmados nos painéis oficiais antes do deploy. Nunca compartilhar os valores no repositório ou chat.
- [ ] Testes remotos dependem da publicação controlada das funções e de credenciais; CI local verde não equivale a teste remoto.
