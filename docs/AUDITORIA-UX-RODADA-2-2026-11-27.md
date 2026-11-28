# Auditoria de UX — Rodada 2 (27/11/2026)

Branch `feat/rodada-2-ux`. Sem deploy de produção e sem migração remota (ver `docs/REGRA_CONTINUIDADE_EVOLUCAO_GRANAVIVA.md`).

## O que não fazia sentido

- **Duas navegações no celular.** Barra inferior com 5 destinos + sidebar escondida: metade das telas (Orçamentos, Metas, Relatórios, Conexões) ficava "a dois toques", e a barra sumia ao rolar, o que deixava a pessoa sem saber onde estava.
- **Barra inferior reservando espaço.** Padding fixo no fim de toda tela e toast flutuando acima de uma barra que às vezes nem estava visível.
- **Categorias como "tela".** Um painel de cadastro dentro de Orçamentos, sem editar nem excluir; para criar uma categoria no meio de um lançamento era preciso abandonar o formulário.
- **Categorias com emoji e cor única.** 35 padrões, todos cinza (#64748b) e com emoji, que renderiza diferente em cada sistema; faltavam itens comuns (Internet separada de Celular, Padaria, Pedágio, Academia, 13º, Férias...).
- **Seletor de categoria como `<select>` longo.** Sem busca, sem criar na hora.
- **"Novo lançamento" levava para outra tela.** O botão `+` abria um modal que só escolhia o tipo e depois rolava para um `<details>` em Lançamentos — dois passos e uma mudança de contexto.
- **Descrição de extrato ilegível.** "UBER *TRIP", "IFD*IFOOD.COM", "99APP" apareciam crus, sem identidade visual.
- **Logos de bancos de fontes mistas.** 31 SVGs de origens e estilos diferentes; cartões de crédito nunca mostravam o emissor.
- **Progresso sem significado.** `<progress>` nativo igual para meta e orçamento: orçamento estourado e meta concluída tinham a mesma cor; nada sobre quanto falta ou quando termina.
- **Percentual repetido.** "34%" na barra e "34% utilizado" logo abaixo.
- **Visão geral sem orçamento.** Era preciso ir até Orçamentos para saber se algum limite estourou.
- **KPIs sem tendência.** Só a variação contra o mês anterior.
- **Legendas decorativas.** Não davam para isolar receitas, despesas ou uma categoria.

## O que mudou

- **Navegação única:** a barra inferior saiu. Abaixo de 1024px a sidebar virou gaveta: botão de menu no cabeçalho de 56px, arrasto a partir da borda esquerda (24px) que segue o dedo e encaixa por distância/velocidade; fecha arrastando para a esquerda, tocando fora, com Esc ou ao escolher um destino. Foco preso, `aria-modal`, rolagem travada, `prefers-reduced-motion`. Desktop mantém a sidebar fixa de 240px.
- **Categorias:** 53 padrões (41 despesas, 12 receitas) com ícone lucide e cor própria. Categorias antigas são mantidas: nomes equivalentes ("Viagem" → Viagens, "Roupas" → Vestuário, "Outras receitas" → Outros) não geram duplicata, e emojis viram ícones.
- **CategoryCombobox** (padrão ARIA combobox) em lançamento, orçamento, recorrência e leitura de comprovante: busca sem acento, "Criar categoria “…”" inline, renomear e excluir na própria lista (exclusão de categoria em uso mostra mensagem amigável em vez do erro de FK).
- **Painel de categorias removido** de Orçamentos, que agora ocupa a largura toda.
- **Novo lançamento no modal:** tipo → formulário completo no mesmo modal (campos, validações e handler idênticos), com "Trocar tipo", foco na descrição e fechamento ao salvar.
- **Logos de estabelecimentos:** 61 marcas reconhecidas por aliases/regex (Uber, Uber Eats, 99, iFood, Netflix, Spotify, Max, YouTube, Apple, Google, Amazon, Shopee, Shell, Carrefour, McDonald's...), com PayPal tratado como intermediário. O logo aparece ao digitar a descrição (e sugere a categoria), nas listas, nos recentes e na prévia de importação; sem marca reconhecida, mostra o ícone da categoria.
- **Logos de bancos:** react-bancos (MIT) como fonte única, 226 instituições no mesmo azulejo; chaves salvas antigas continuam valendo; cartões mostram o logo do emissor.
- **Progresso com significado:** barras animadas com marcas em 25/50/75/100%. Metas vão de índigo a esmeralda e celebram em 100%; orçamentos ficam âmbar acima de 80% e vermelhos acima de 100%. Mostram quanto falta (ou quanto estourou) e a previsão de conclusão quando há contribuição mensal.
- **Visão geral:** card "Orçamentos do mês" ordenado pelo uso, sparklines de 6 meses nos KPIs, legenda do fluxo que liga/desliga séries, fatias da rosca ocultáveis e animação de entrada (desligada com `prefers-reduced-motion`).
- **Textos:** removido o percentual duplicado; status curtos ("Perto do limite", "Limite ultrapassado").

## Fica para depois

- Reordenar categorias e escolher ícone/cor manualmente (hoje o ícone vem do nome).
- Aplicar a categoria sugerida pelo estabelecimento automaticamente na importação CSV/OFX (hoje só o logo aparece na prévia).
- Logos de Vivo, Claro, TIM, GOL, Smart Fit e Mercado Livre: não há vetor em simple-icons/react-bancos e ficaram fora desta rodada.
