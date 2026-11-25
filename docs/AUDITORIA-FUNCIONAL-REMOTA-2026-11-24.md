# Auditoria funcional remota — GranaViva — 24/11/2026

## Escopo e limites

Auditoria realizada no Preview da branch `fase-3-backend` e no projeto Supabase Brasil `dvddqexnvllrxogbwmdf` (São Paulo, PostgreSQL 17). Nenhum dado financeiro foi criado, alterado ou removido nesta auditoria. Nenhuma Edge Function foi publicada, nenhum worker foi ativado e nenhuma configuração de produção foi alterada.

## Evidências confirmadas

- Supabase está `ACTIVE_HEALTHY`, PostgreSQL 17.12.
- Histórico remoto contém 14 migrations: 001–011, correção de índice/trigger, checkpoint de workers e índices de cobertura.
- As 39 tabelas públicas listadas estão com RLS habilitado.
- As tabelas internas sem policies permanecem sem privilégios diretos para `anon` e `authenticated`; seu acesso é restrito ao backend/service role. O advisor INFO para essas tabelas é intencional e não deve ser corrigido criando policies genéricas.
- Os 14 índices de cobertura de FKs foram verificados anteriormente como válidos; o advisor deixou de reportar `unindexed_foreign_keys`.
- Bucket `receipt-files` existe, é privado e limita uploads a 5 MiB. Há policies de Storage para insert/select/delete autenticados com validação de usuário e transação.
- CI anterior no commit do Preview foi aprovada: validação frontend, Edge Runtime, integração local Supabase e SQL/PostgreSQL 17. O job condicional de lockfile foi ignorado por não se aplicar à branch.
- A autenticação chegou a emitir uma sessão autenticada no Preview (evidência nos logs remotos), portanto a autenticação básica foi exercitada. Isso não substitui testes completos de cadastro, recuperação de senha e isolamento entre duas contas.

## Bloqueio funcional crítico encontrado

O projeto Supabase remoto não possui Edge Functions publicadas (`list_edge_functions` retornou lista vazia).

Os logs do Preview registraram respostas HTTP 404 / `NOT_FOUND` para chamadas autenticadas aos endpoints:

- `minha-conta`
- `minhas-preferencias`
- `radar-alertas`
- `push-inscricoes`
- `whatsapp-vincular`

O carregamento inicial do frontend agrupa essas chamadas com consultas diretas às tabelas usando `Promise.all` e interrompe o processamento quando uma função retorna erro. Consequentemente, os dados de módulos que poderiam ser lidos diretamente do banco também deixam de ser carregados. O app pode abrir e autenticar, mas isso não significa que o fluxo autenticado esteja funcional.

### Ação necessária

Publicar as Edge Functions da branch somente após autorização específica do responsável e revisão/configuração dos secrets exigidos. Depois da publicação, executar testes remotos controlados de autenticação, perfil, preferências, Radar e Push/WhatsApp. Workers continuam desligados; publicação de funções não autoriza ativá-los.

## Outros pontos

- Advisor de segurança: `auth_leaked_password_protection` em WARN. Recomenda-se habilitar proteção contra senhas comprometidas nas configurações de Auth do Supabase. A configuração não foi alterada nesta auditoria.
- Advisor INFO: 15 tabelas internas com RLS sem policies. Mantido intencionalmente, com grants diretos revogados para usuários finais.
- Advisor de performance: índices não utilizados ainda precisam de observação com tráfego representativo; não remover índices apenas com base em estatísticas de banco recém-criado.
- O Preview testado corresponde ao commit registrado no PR #2 (`49146706f09d43d333615250e4971410a9ad632a`). CI verde não substitui testes remotos nem teste visual/funcional no Safari e PWA.

## Matriz de aceite

| Área | Estado | Evidência / próximo passo |
|---|---|---|
| Saúde do Supabase | Aprovado | Projeto ACTIVE_HEALTHY |
| Migrations | Aprovado | 14 migrations registradas |
| RLS e grants | Parcialmente aprovado | RLS habilitado; isolamento entre duas contas ainda requer teste autenticado controlado |
| Storage de comprovantes | Estrutura aprovada | Bucket privado e policies presentes; upload/download remoto ainda não testado |
| Login | Parcialmente testado | Sessão autenticada observada; fluxo completo ainda precisa de aceite |
| Perfil/preferências | Bloqueado | Edge Functions ausentes; endpoints retornam 404 |
| Radar | Bloqueado | Edge Functions ausentes; sem cotações automáticas por decisão de licença |
| Push | Bloqueado | Funções e VAPID não publicados/configurados |
| WhatsApp | Bloqueado | Funções e credenciais Meta não publicadas/configuradas |
| Recorrências automáticas | Bloqueado | Worker não publicado/ativado |
| Importação CSV/OFX | Não validado remotamente | Exige teste com arquivo sintético e usuário de teste |
| Investimentos/proventos | Não validado remotamente | Exige teste sintético de CRUD e cálculos |
| Safari/PWA/offline | Parcial | Preview abriu; aceite completo em Safari/PWA ainda pendente |

## Próximos passos seguros

1. Obter autorização específica para publicar as Edge Functions no projeto Supabase Brasil, sem ativar workers.
2. Revisar os secrets obrigatórios e identificar integrações que devem permanecer indisponíveis até credenciais externas.
3. Publicar apenas depois da autorização e fazer testes com usuário/dados sintéticos.
4. Corrigir eventuais falhas encontradas, repetir CI e testes remotos.
5. Manter PR #2 em draft e sem merge; manter Vercel Production intocada.
