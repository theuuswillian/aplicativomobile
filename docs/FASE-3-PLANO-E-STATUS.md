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
- [x] Endpoint autenticado de leitura/atualização de perfil.
- [x] Endpoint autenticado de leitura/atualização parcial de preferências.
- [x] Validação estrita de campos e leitura JSON limitada em streaming.
- [x] Testes unitários dos validadores e parser HTTP.
- [ ] Testes de integração com Supabase local e validação Deno.

### IA, Radar, push e WhatsApp
- [ ] Assistente contextual e validação de IA.
- [x] Validação isolada de base64, MIME declarado versus assinatura real e limite de 5 MB para arquivos aceitos.
- [ ] Endpoint de IA para leitura de comprovantes, validação da resposta e revisão humana.
- [ ] Cotações e Radar.
- [ ] Push.
- [ ] WhatsApp completo.

## Limites atuais

A Fase 2 continua preservada como base e a PR #1 não será mesclada por esta etapa. Esta branch é derivada da Fase 2; a revisão da Fase 3 será separada. Nenhuma função está implantada no projeto Supabase remoto.
