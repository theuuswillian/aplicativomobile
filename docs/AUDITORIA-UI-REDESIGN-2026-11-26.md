# Auditoria de UI antes do redesign — 2026-11-26

**Escopo:** frontend React 19 + Vite + TypeScript (`src/`), estilos (`src/styles/`), testes de UI (`tests/*.test.ts`, `tests/e2e/`).
**Base:** `main` em `52d6079` (“Redesign GranaViva and fix financial workflows”).
**Regras respeitadas:** `docs/REGRA_CONTINUIDADE_EVOLUCAO_GRANAVIVA.md` (menor mudança coerente, sem duplicar funções, sem tocar schema/RLS/Edge Functions, sem merge/deploy) e `docs/ARQUITETURA_TRAVADA.md` §2.3 (tema escuro “All Black” + tema claro, verde como ação principal, foco visível, WCAG AA 4,5:1), §6.4 (lateral no desktop, inferior no mobile, componentes compartilhados) e §7.1 (CSS Design System com tokens, sem Tailwind).

## Estrutura encontrada

- `src/App.tsx` (2.367 linhas): estado global, carregamento Supabase (22 consultas em paralelo), todos os handlers de escrita e o JSX de todas as telas.
- Telas (estado `activeTab`): **Início**, **Gastos** (sub-abas Lançamentos, Contas, Orçamentos, Conexões), **Patrimônio** (renda fixa, metas de rendimentos, carteira, radar, proventos), **Planejamento** (valores a receber/horas extras, metas), **Relatórios**, **Conta** (perfil, tema, privacidade, assistente IA, leitura de comprovante).
- Navegação: dock flutuante inferior com 4 botões em todas as larguras; sem navegação lateral no desktop.
- Painéis extraídos: `features/income-goals/IncomeGoalsPanel.tsx` e `features/receivables/ReceivablesPanel.tsx`.
- Domínio puro e testado: `domain/finance.ts`, `investments.ts`, `recurrence.ts`, `imports.ts`, `income-goals.ts`; utilitários `lib/money.ts`, `lib/date.ts`, `lib/secure-storage.ts`.
- Estilos: `styles/tokens.css` (tema escuro/claro) + `styles/app.css` (folha única, 648 linhas).

## O que está bom (manter)

- Regras financeiras isoladas em funções puras com testes (fatura, limite comprometido, saldo por conta, custo médio, recorrência, importação com deduplicação).
- Valores monetários tratados em centavos/`bigint` e parsing pt-BR robusto (`parseBrlAmount`, `formatBrlInput`).
- Todas as escritas filtram por `user_id`, com reversão em caso de falha (importação de extrato, comprovante com Storage, exclusão de lançamento).
- Fluxos completos e funcionais: autenticação (entrar, criar, recuperar, redefinir senha), contas com logo de banco, cartões, pagamento de fatura, lançamentos (Pix/débito/dinheiro/crédito parcelado/transferência), categorias, orçamentos, recorrências, metas e contribuições (RPC atômica), renda fixa, carteira, proventos com liquidação, radar de preços, WhatsApp, Push, importação CSV/OFX, assistente IA e leitura de comprovante com consentimento explícito, exportação e exclusão de conta.
- Limpeza de estado na troca de usuário e cache local cifrado escopado por usuário.
- Ocultação de saldos, tema claro/escuro sincronizado com o servidor, toast de avisos.
- Base de acessibilidade: rótulos em todos os campos, `:focus-visible`, `prefers-reduced-motion`, testes axe (WCAG 2.2 AA) e de overflow horizontal.
- PWA (manifest, service worker sem cache de APIs financeiras) e fontes Inter locais.

## O que está ruim (corrigir)

- **Monólito:** `App.tsx` mistura tipos, catálogos, formatação, carregamento, handlers e ~600 linhas de JSX com IIFEs; difícil de revisar e de testar visualmente.
- **Cálculos duplicados na UI:** total de receitas/despesas do mês e gastos por categoria são recalculados em 3 lugares (Início, Gastos, Relatórios) com código copiado.
- **Navegação:** dock flutuante cobre conteúdo no desktop (sobrepõe a lista e a legenda do gráfico); sem sidebar em telas largas; Metas/Relatórios/Conexões só acessíveis por atalhos escondidos.
- **Sub-abas de Gastos** cortadas em 390 px (“Conexões” fora da tela, rolagem horizontal escondida).
- **Hierarquia visual:** hero com gradiente verde e sombras pesadas, botões de ação rápida enormes e vazios no desktop, títulos de seção com tamanhos e pesos diferentes por tela.
- **Inconsistência de tokens:** cores hard-coded no CSS e no JSX (`#0b0d0f`, `#eafff2`, paletas de gráfico em hex soltos, `#a78bfa`), raios variados (10/12/14/15/16/18/20/22/24 px), três estilos de botão secundário diferentes (`quiet`, `secondary`, botões próprios da renda fixa).
- **Ícones mistos:** lucide com `strokeWidth` 2/2.2/2.8, mais caracteres unicode (`＋`, `✎`, `⌁`, `◐`, `◎`, `▥`, `›`, `◈`, `✦`) como ícones.
- **Gráficos:** barras em `div` sem tooltip acessível nem eixo, cores vermelho/verde saturadas, sem estado de foco.
- **Estados vazios** são só parágrafos tracejados; não há skeleton durante o carregamento inicial (tela mostra zeros até os dados chegarem).
- **Uso de telas largas:** conteúdo limitado a 1080 px sem aproveitamento de grid; formulários longos em coluna única.
- **CSS morto/conflitante:** regras para `.app-footer`, `.coming-panel`, `.eyebrow` em vários contextos, seletores de “hero” repetidos para três componentes diferentes, cor de fundo do `html` hard-coded.
- **Módulos só usados por testes** (`lib/dates.ts`, `domain/validation.ts`, `domain/accounting.ts`, `types/domain.ts`): não são UI; ficam intactos por serem contrato de domínio documentado.

## Registro de continuidade do redesign

**Branch:** `redesign/fintech-design-system` (PR em rascunho; sem merge e sem deploy/Preview).

- **Reaproveitado sem alteração de regra:** todo o estado, carregamento Supabase, handlers de escrita, RPCs, Edge Functions, cálculos de domínio, `ReceivablesPanel` e `IncomeGoalsPanel`.
- **Extraído do `App.tsx`:** tipos (`types/app.ts`), catálogos (`data/investment-catalog.ts`, `data/default-categories.ts`), mensagens de erro (`lib/errors.ts`), formatação em centavos (`lib/format.ts`), métricas de leitura compartilhadas por Visão Geral, Gastos e Relatórios (`lib/finance-metrics.ts`), tela pública, Visão Geral, Relatórios, renda fixa, alocação da carteira e modal de novo lançamento.
- **Novo design system:** tokens fintech dark em `styles/tokens.css` (tema claro mantido), primitivas em `components/ui`, navegação em `components/layout` (sidebar ≥1024px, barra inferior <1024px, cabeçalho de tela) e gráficos SVG em `components/charts`.
- **Mantido intacto:** schema, migrations, RLS, Edge Functions, service worker (só a versão do cache subiu para `granaviva-shell-v12` para atualizar o shell visual), regras de domínio.
- **Validação local:** `typecheck`, `lint`, `test` (vitest), `build`, `check:policy`, `check:secrets` e Playwright no Chromium (desktop e emulação de iPhone 13). O projeto `webkit-iphone` real não roda neste ambiente e fica para a CI.
- **Pendente:** validação manual no Safari/iOS e decisão sobre Preview, conforme o protocolo da Vercel.
