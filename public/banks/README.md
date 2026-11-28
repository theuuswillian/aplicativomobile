# Logos de bancos, fintechs, carteiras e cartões

Os SVGs desta pasta são servidos localmente (sem requisição a terceiros) e usados no seletor de instituição,
na lista de contas, nos cartões de crédito e em alguns estabelecimentos de varejo/benefícios.

## Fonte e licença

- **react-bancos** v0.11.0 — https://github.com/henriquezolini/react-bancos — licença **MIT** © Henrique Zolini.
  Todos os ícones seguem o mesmo azulejo quadrado (fundo na cor da marca, logo oficial centralizado, margem uniforme).
  Os arquivos são copiados de `node_modules/react-bancos/icons/` por `npm run sync:logos`
  (`scripts/sync-brand-logos.mjs`), que também gera `src/data/bank-logos.generated.ts` (nome, código COMPE e cor).
  O pacote não é importado em tempo de execução, para não aumentar o bundle do PWA.
- **Genial Investimentos** (ausente em react-bancos): logo de **rzmt/logos-bancos-br** — https://github.com/rzmt/logos-bancos-br — licença **MIT**,
  embrulhado no mesmo azulejo pelo script.
- Excluídos de propósito: o ícone genérico "outros" e instituições vetadas pela política do projeto (`scripts/check-policy.mjs`).

## Aviso de marcas

As marcas, nomes e logotipos pertencem às respectivas instituições. A licença MIT cobre os arquivos e o código,
não concede direitos sobre as marcas. O uso no GranaViva é exclusivamente identificativo, para que a pessoa
reconheça a instituição vinculada à própria conta; não indica parceria, patrocínio ou endosso.
