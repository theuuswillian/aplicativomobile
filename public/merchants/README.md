# Logos de estabelecimentos

Azulejos quadrados usados para identificar o estabelecimento de um lançamento (lista de lançamentos,
lançamentos recentes, prévia de importação e formulário de novo lançamento).

## Fonte e licença

- **simple-icons** — https://github.com/simple-icons/simple-icons — ícones sob **CC0 1.0** (domínio público).
  `npm run sync:logos` (`scripts/sync-brand-logos.mjs`) transforma cada ícone em um azulejo 100×100 no **mesmo estilo
  dos bancos (react-bancos)**: fundo na cor oficial da marca, marca branca (ou escura em fundos claros) centralizada
  com margem uniforme. Metadados em `scripts/brand-sources/merchants.json`.
  Marcas: Uber, Uber Eats, Shopee, Netflix, Spotify, Max (HBO Max), YouTube, Apple, Google, Airbnb, Booking.com,
  Shell, McDonald's, Burger King, Starbucks, Steam, PlayStation, KFC, PayPal, Twitch, Deezer, Crunchyroll,
  Paramount+, Duolingo, Dropbox, Notion, Zoom, AliExpress, IKEA, Nike, adidas, Zara, Uniqlo, trivago, Expedia,
  GitHub, Epic Games, Discord e Anthropic.
- Marcas brasileiras que já existem em **react-bancos** (MIT) usam o azulejo de `public/banks/`: 99 (99Pay), iFood,
  Rappi, Amazon, Amazon Prime, Carrefour, Atacadão, Decolar, LATAM, Azul, Americanas, Magalu, Casas Bahia, KaBuM!,
  Samsung, Havan, Renner, C&A, Riachuelo, Pernambucanas e Marisa.
- O reconhecimento por descrição (aliases e expressões regulares) fica em `src/data/merchant-catalog.ts`.
  Quando nenhum estabelecimento é reconhecido, o app mostra o ícone da categoria.

## Aviso de marcas

As marcas e logotipos pertencem aos respectivos titulares. A licença CC0/MIT cobre os arquivos, não os direitos
de marca (as diretrizes de cada marca continuam valendo). O uso é apenas identificativo e não indica parceria,
patrocínio ou endosso.
