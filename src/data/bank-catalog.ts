import type { CSSProperties } from "react";
export const BANK_LOGO_SPRITE = "data:image/webp;base64,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";
export const BANK_CATALOG = [
  {
    "code": "121",
    "name": "Agibank",
    "logoKey": "agibank.com.br",
    "logoIndex": 0
  },
  {
    "code": "077",
    "name": "Banco Inter",
    "logoKey": "bancointer.com.br",
    "logoIndex": 1
  },
  {
    "code": "041",
    "name": "Banrisul",
    "logoKey": "banrisul.com.br",
    "logoIndex": 2
  },
  {
    "code": "001",
    "name": "Banco do Brasil",
    "logoKey": "bb.com.br",
    "logoIndex": 3
  },
  {
    "code": "",
    "name": "Binance",
    "logoKey": "binance.com",
    "logoIndex": 4
  },
  {
    "code": "318",
    "name": "Banco BMG",
    "logoKey": "bmg.com.br",
    "logoIndex": 5
  },
  {
    "code": "004",
    "name": "Banco do Nordeste",
    "logoKey": "bnb.gov.br",
    "logoIndex": 6
  },
  {
    "code": "237",
    "name": "Bradesco",
    "logoKey": "bradesco.com.br",
    "logoIndex": 7
  },
  {
    "code": "070",
    "name": "BRB",
    "logoKey": "brb.com.br",
    "logoIndex": 8
  },
  {
    "code": "208",
    "name": "BTG Pactual",
    "logoKey": "btgpactual.com",
    "logoIndex": 9
  },
  {
    "code": "655",
    "name": "Banco BV",
    "logoKey": "bv.com.br",
    "logoIndex": 10
  },
  {
    "code": "336",
    "name": "C6 Bank",
    "logoKey": "c6bank.com.br",
    "logoIndex": 11
  },
  {
    "code": "104",
    "name": "Caixa Econômica Federal",
    "logoKey": "caixa.gov.br",
    "logoIndex": 12
  },
  {
    "code": "403",
    "name": "Cora",
    "logoKey": "cora.com.br",
    "logoIndex": 13
  },
  {
    "code": "707",
    "name": "Daycoval",
    "logoKey": "daycoval.com.br",
    "logoIndex": 14
  },
  {
    "code": "335",
    "name": "Digio",
    "logoKey": "digio.com.br",
    "logoIndex": 15
  },
  {
    "code": "271",
    "name": "Genial Investimentos",
    "logoKey": "genialinvestimentos.com.br",
    "logoIndex": 16
  },
  {
    "code": "341",
    "name": "Itaú Unibanco",
    "logoKey": "itau.com.br",
    "logoIndex": 17
  },
  {
    "code": "323",
    "name": "Mercado Pago",
    "logoKey": "mercadopago.com.br",
    "logoIndex": 18
  },
  {
    "code": "389",
    "name": "Mercantil do Brasil",
    "logoKey": "mercantildobrasil.com.br",
    "logoIndex": 19
  },
  {
    "code": "735",
    "name": "Neon",
    "logoKey": "neon.com.br",
    "logoIndex": 20
  },
  {
    "code": "260",
    "name": "Nubank",
    "logoKey": "nubank.com.br",
    "logoIndex": 21
  },
  {
    "code": "290",
    "name": "PagBank",
    "logoKey": "pagbank.com.br",
    "logoIndex": 22
  },
  {
    "code": "380",
    "name": "PicPay",
    "logoKey": "picpay.com",
    "logoIndex": 23
  },
  {
    "code": "422",
    "name": "Banco Safra",
    "logoKey": "safra.com.br",
    "logoIndex": 24
  },
  {
    "code": "033",
    "name": "Santander",
    "logoKey": "santander.com.br",
    "logoIndex": 25
  },
  {
    "code": "756",
    "name": "Sicoob",
    "logoKey": "sicoob.com.br",
    "logoIndex": 26
  },
  {
    "code": "748",
    "name": "Sicredi",
    "logoKey": "sicredi.com.br",
    "logoIndex": 27
  },
  {
    "code": "637",
    "name": "Sofisa Direto",
    "logoKey": "sofisa.com.br",
    "logoIndex": 28
  },
  {
    "code": "197",
    "name": "Stone",
    "logoKey": "stone.com.br",
    "logoIndex": 29
  },
  {
    "code": "136",
    "name": "Unicred",
    "logoKey": "unicred.com.br",
    "logoIndex": 30
  },
  {
    "code": "102",
    "name": "XP Investimentos",
    "logoKey": "xpi.com.br",
    "logoIndex": 31
  }
] as const;
export type BankCatalogEntry = (typeof BANK_CATALOG)[number];
export function bankLogoStyle(index: number): CSSProperties {
  return { backgroundImage: `url(${BANK_LOGO_SPRITE})`, backgroundSize: "144px 144px", backgroundPosition: `-${(index % 6) * 24}px -${Math.floor(index / 6) * 24}px`, backgroundRepeat: "no-repeat" };
}
