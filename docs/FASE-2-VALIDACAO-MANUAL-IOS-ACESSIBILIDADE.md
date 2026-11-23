# GranaViva — validação manual da Fase 2

**Status:** pendente de execução em dispositivo real. Os testes automatizados em Chromium e WebKit não substituem esta etapa.

## 1. Safari no iPhone

- [ ] Abra a prévia da branch `fase-2-fundacao` no Safari do iPhone. A prévia é protegida por SSO da Vercel; entre na conta se solicitado.
- [ ] Confirme que a página abre sem rolagem horizontal, cortes de conteúdo ou sobreposição com a área da câmera/indicadores do iOS.
- [ ] Confira o ícone, o título GranaViva e o tema escuro.
- [ ] Alterne para o tema claro e volte ao escuro.

## 2. Instalação e abertura como PWA

- [ ] No Safari, use **Compartilhar → Adicionar à Tela de Início**.
- [ ] Confirme o nome e o ícone exibidos antes de adicionar.
- [ ] Abra o GranaViva pelo novo ícone da tela inicial.
- [ ] Confirme que abre em modo standalone, sem a barra de navegação do Safari.
- [ ] Confira safe areas, barra de status, orientação retrato e paisagem.

## 3. Primeiro uso offline e atualização

- [ ] Abra a aplicação com internet e aguarde o carregamento completo.
- [ ] Feche a aplicação; ative o modo avião.
- [ ] Reabra pelo ícone da tela inicial.
- [ ] Confirme que o shell, o texto, os estilos e as fontes continuam disponíveis offline.
- [ ] Reative a internet e abra novamente.
- [ ] Quando uma nova prévia for publicada, abra o PWA online e confirme que a nova versão passa a ser servida após a atualização do Service Worker.

## 4. Acessibilidade manual

- [ ] Ative o VoiceOver e percorra a tela na ordem de leitura.
- [ ] Confirme que o título principal é anunciado como cabeçalho de nível 1.
- [ ] Confirme que o link da marca tem nome compreensível.
- [ ] Confirme que o controle de tema anuncia a ação correta em cada estado.
- [ ] Verifique contraste e legibilidade nos dois temas.
- [ ] Se houver teclado externo, navegue com Tab/Shift+Tab e ative o controle com Enter/Espaço; confirme o foco visível.

## 5. Registro do teste

Preencha após executar em dispositivo real:

- Modelo do iPhone:
- Versão do iOS:
- Versão do Safari:
- Instalação pela Tela de Início: aprovado / reprovado
- Abertura standalone: aprovado / reprovado
- Primeiro uso offline: aprovado / reprovado
- Atualização do PWA: aprovado / reprovado
- VoiceOver: aprovado / reprovado
- Teclado externo (se disponível): aprovado / reprovado
- Problemas observados e evidências:

**Critério de fechamento:** todos os itens aplicáveis aprovados, problemas corrigidos e revalidados. A Fase 3 continua bloqueada até a confirmação explícita `APROVADO`.
