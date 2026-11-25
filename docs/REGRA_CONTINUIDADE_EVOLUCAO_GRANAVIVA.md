# Regra de continuidade e evolução do GranaViva

**Status:** regra permanente de trabalho do projeto  
**Aplicação:** toda nova tarefa, sessão ou conversa relacionada ao GranaViva

## Princípio central

Antes de propor ou implementar uma mudança, entender como o GranaViva funciona no estado atual e comparar esse funcionamento com o resultado desejado. A solução deve aproveitar o que já existe e integrar a melhoria com a menor alteração coerente possível, preservando a arquitetura, os dados, os fluxos e a experiência já estabelecidos.

O objetivo é evoluir o produto continuamente, sem reconstruções desnecessárias, funções duplicadas ou desorganização entre conversas.

## Revisão obrigatória no início de cada nova conversa

1. **Recuperar a continuidade:** consultar este documento, o plano/status da Fase 3, a arquitetura vigente, a PR ativa, a branch, os commits recentes e as pendências registradas.
2. **Conferir o estado real:** inspecionar o código e os arquivos relevantes no HEAD atual; quando a tarefa envolver backend, conferir também migrations aplicadas, schema remoto, RLS, RPCs e integrações pertinentes. Não assumir que o estado descrito em conversas antigas continua atualizado.
3. **Entender o pedido:** resumir o comportamento atual, a necessidade do usuário e o comportamento pretendido. Se houver ambiguidade que altere significativamente a solução, fazer uma pergunta objetiva antes de mudar.
4. **Pesquisar antes de criar:** localizar telas, componentes, hooks, serviços, tabelas, funções, RPCs, tipos e testes já existentes que possam ser reutilizados ou estendidos.
5. **Fazer análise de impacto:** identificar dependências e efeitos colaterais nas áreas relacionadas, como navegação, contas, lançamentos, cartões, faturas, investimentos, recebíveis, horas extras, proventos, relatórios, autenticação, segurança, responsividade, Safari e PWA.
6. **Escolher a menor solução sustentável:** preferir extensão compatível, reutilização e migração aditiva. Não duplicar funcionalidades, substituir módulos inteiros ou mudar contratos/estrutura sem justificativa técnica demonstrável.
7. **Explicar o plano antes de mudanças relevantes:** informar o que será reutilizado, o que será alterado, o que ficará intacto e como será testado. Para mudanças pequenas e inequívocas, seguir diretamente mantendo essa análise.
8. **Implementar em etapas coesas:** limitar o escopo ao pedido, preservar compatibilidade e evitar alterações não relacionadas.
9. **Validar regressões:** executar os testes adequados ao escopo e confirmar que os fluxos existentes continuam funcionando. Não declarar testes, deploys ou validações que não foram realmente executados.
10. **Atualizar o registro de continuidade:** anotar arquivos/áreas alterados, migrations e estado remoto, testes e resultados, commit/PR, riscos, pendências e próximo passo.

## Regras de preservação

- O código, o schema remoto e o comportamento efetivamente observados prevalecem sobre descrições antigas.
- Não criar uma segunda versão de uma função sem antes verificar a existente.
- Não remover, renomear ou reinterpretar dados e tabelas existentes sem mapeamento, plano de compatibilidade e validação.
- Preferir migrations aditivas, seguras e idempotentes; nunca presumir que uma migration local está aplicada remotamente.
- Preservar isolamento por usuário, RLS, validação no backend, idempotência e proteção de segredos.
- Manter contas de investimento separadas da liquidez livre; não misturar moedas nem inventar conversão cambial.
- Preços manuais devem permanecer identificados como referências, nunca como cotações automáticas.
- Integrações externas, workers, cron, Edge Functions, credenciais, custos, deploys e Production permanecem sujeitos às decisões e autorizações já registradas. Não ativar nem publicar por conveniência.
- Não fazer merge nem promover para Production sem autorização explícita.
- Economizar deployments: agrupar alterações coerentes, validar primeiro por CI e só solicitar Preview quando houver motivo e disponibilidade.
- Se a solução exigir mudança arquitetural maior, apresentar motivo, alternativas e impacto antes de executá-la.


## Protocolo obrigatório de economia da Vercel

A Vercel deve ser usada de forma planejada. Deploys desnecessários consomem a quota do projeto e podem bloquear uma validação realmente importante.

1. **Não fazer deploy por alteração pequena:** commits, ajustes de texto, documentação, refatorações internas e correções isoladas não justificam automaticamente um novo deployment.
2. **Agrupar mudanças:** reunir alterações coerentes em um lote de trabalho e evitar gerar vários Previews para a mesma etapa.
3. **Validar antes na CI:** executar os checks aplicáveis no GitHub Actions (lint, tipos, testes unitários, build, testes de browser, SQL e integrações, conforme o escopo). Só considerar Preview depois de a CI relevante estar verde.
4. **Usar Preview com propósito:** criar um Preview consolidado quando ele for necessário para validar comportamento real de interface, integração ou ambiente que a CI não cobre. Registrar o motivo antes de solicitar.
5. **Checar disponibilidade e histórico:** antes de solicitar Preview, conferir deployments recentes, quota/limites conhecidos e se já existe um Preview adequado para o mesmo HEAD. Não criar outro se um deployment existente atender à validação.
6. **Respeitar bloqueios:** se a Vercel retornar limite de quota (por exemplo, HTTP 402) ou bloqueio/permissão (por exemplo, HTTP 403), interromper novas tentativas equivalentes. Registrar o erro e aguardar a janela de recuperação ou uma mudança real de condição; não insistir, não contornar limites e não disparar deploy alternativo sem necessidade.
7. **Separar Preview de Production:** Preview serve para validação. Nunca promover, publicar ou fazer deploy em Production sem autorização explícita do usuário.
8. **Não sacrificar qualidade:** economizar deployments não significa pular CI, testes ou revisão. Se não houver Preview disponível, informar exatamente o que foi validado pela CI e o que continua pendente de validação em ambiente real.
9. **Registrar cada decisão:** ao encerrar a etapa, anotar se houve deployment, qual ambiente/HEAD foi validado, o resultado ou o bloqueio, e se ficou alguma validação manual pendente.

**Regra padrão:** primeiro desenvolver e agrupar; depois validar pela CI; só então, se houver necessidade real e disponibilidade, gerar um único Preview consolidado. Production permanece intocada sem autorização expressa.

## Modelo de análise para cada melhoria

Antes de implementar, responder internamente e registrar quando relevante:

| Pergunta | O que verificar |
|---|---|
| O que já existe? | Tela, fluxo, componente, tabela, função e testes atuais |
| O que o usuário quer? | Resultado funcional e problema que deseja resolver |
| O que pode ser reaproveitado? | Código, dados, contratos e componentes existentes |
| O que precisa mudar? | Menor conjunto de arquivos, tabelas e fluxos |
| O que pode ser afetado? | Regressões, dados, segurança, UX e compatibilidade |
| Como validar? | Testes automatizados, SQL, browser e teste manual necessário |
| O que fica pendente? | Dependências, credenciais, validações ou decisões futuras |

## Checklist de encerramento e passagem para outra conversa

Ao concluir uma etapa, atualizar o registro do projeto com:

- Estado real da branch, commit e PR.
- Alterações realizadas e arquivos afetados.
- Migrations criadas/aplicadas e verificações do banco.
- Testes executados e seus resultados exatos.
- Deploys realizados ou bloqueios encontrados.
- Itens deliberadamente não alterados.
- Riscos conhecidos e decisões que precisam ser preservadas.
- Próxima tarefa recomendada, sem tratá-la como autorização automática.

Na conversa seguinte, começar pela revisão deste documento e pela conferência do estado atual do repositório e dos serviços. Não retomar pela memória da conversa isoladamente nem pedir ao usuário que repita decisões já registradas e ainda válidas.

## Regra de comunicação com o usuário

Explicar de forma simples como a melhoria vai funcionar dentro do GranaViva atual. Distinguir claramente:
- o que já existia;
- o que será reaproveitado;
- o que será acrescentado ou corrigido;
- o que não será modificado;
- o que foi efetivamente testado;
- o que ainda depende de ação ou autorização.

Nunca afirmar que algo está pronto, aplicado, testado ou publicado sem confirmação verificável.
