/**
 * Logos vetoriais individuais, locais e versionados no app.
 * As marcas bancárias foram obtidas do diretório público Open Finance Brasil
 * ou dos sites oficiais, via dataset logos-bancos-br (MIT).
 */
export const BANK_CATALOG = [
  { code: "121", name: "Agibank", logoKey: "agibank.com.br", logoPath: "/banks/agibank.svg" },
  { code: "077", name: "Banco Inter", logoKey: "bancointer.com.br", logoPath: "/banks/banco-inter.svg" },
  { code: "041", name: "Banrisul", logoKey: "banrisul.com.br", logoPath: "/banks/banrisul.svg" },
  { code: "001", name: "Banco do Brasil", logoKey: "bb.com.br", logoPath: "/banks/banco-do-brasil.svg" },
  { code: "", name: "Binance", logoKey: "binance.com", logoPath: "/banks/binance.svg" },
  { code: "318", name: "Banco BMG", logoKey: "bmg.com.br", logoPath: "/banks/bmg.svg" },
  { code: "004", name: "Banco do Nordeste", logoKey: "bnb.gov.br", logoPath: "/banks/banco-do-nordeste.svg" },
  { code: "237", name: "Bradesco", logoKey: "bradesco.com.br", logoPath: "/banks/bradesco.svg" },
  { code: "070", name: "BRB", logoKey: "brb.com.br", logoPath: "/banks/brb.svg" },
  { code: "208", name: "BTG Pactual", logoKey: "btgpactual.com", logoPath: "/banks/btg-pactual.svg" },
  { code: "413", name: "Banco BV", logoKey: "bv.com.br", logoPath: "/banks/bv.svg" },
  { code: "336", name: "C6 Bank", logoKey: "c6bank.com.br", logoPath: "/banks/c6-bank.svg" },
  { code: "104", name: "Caixa Econômica Federal", logoKey: "caixa.gov.br", logoPath: "/banks/caixa.svg" },
  { code: "403", name: "Cora", logoKey: "cora.com.br", logoPath: "/banks/cora.svg" },
  { code: "707", name: "Daycoval", logoKey: "daycoval.com.br", logoPath: "/banks/daycoval.svg" },
  { code: "335", name: "Digio", logoKey: "digio.com.br", logoPath: "/banks/digio.svg" },
  { code: "125", name: "Genial Investimentos", logoKey: "genialinvestimentos.com.br", logoPath: "/banks/genial.svg" },
  { code: "341", name: "Itaú Unibanco", logoKey: "itau.com.br", logoPath: "/banks/itau.svg" },
  { code: "389", name: "Mercantil do Brasil", logoKey: "mercantildobrasil.com.br", logoPath: "/banks/mercantil.svg" },
  { code: "536", name: "Neon", logoKey: "neon.com.br", logoPath: "/banks/neon.svg" },
  { code: "260", name: "Nubank", logoKey: "nubank.com.br", logoPath: "/banks/nubank.svg" },
  { code: "290", name: "PagBank", logoKey: "pagbank.com.br", logoPath: "/banks/pagbank.svg" },
  { code: "380", name: "PicPay", logoKey: "picpay.com", logoPath: "/banks/picpay.svg" },
  { code: "422", name: "Banco Safra", logoKey: "safra.com.br", logoPath: "/banks/safra.svg" },
  { code: "033", name: "Santander", logoKey: "santander.com.br", logoPath: "/banks/santander.svg" },
  { code: "756", name: "Sicoob", logoKey: "sicoob.com.br", logoPath: "/banks/sicoob.svg" },
  { code: "748", name: "Sicredi", logoKey: "sicredi.com.br", logoPath: "/banks/sicredi.svg" },
  { code: "637", name: "Sofisa Direto", logoKey: "sofisa.com.br", logoPath: "/banks/sofisa.svg" },
  { code: "197", name: "Stone", logoKey: "stone.com.br", logoPath: "/banks/stone.svg" },
  { code: "136", name: "Unicred", logoKey: "unicred.com.br", logoPath: "/banks/unicred.svg" },
  { code: "102", name: "XP Investimentos", logoKey: "xpi.com.br", logoPath: "/banks/xp.svg" },
] as const;

export type BankCatalogEntry = (typeof BANK_CATALOG)[number];

