// Catálogo local de tickers da B3 usado para autocompletar o cadastro de ativos.
// Não é cotação nem recomendação: só preenche nome e classe do ativo.
import type { InvestmentAssetRow } from "../types/app";

export const INVESTMENT_CATALOG: Record<string, { name: string; assetClass: InvestmentAssetRow["asset_class"] }> = {
  PETR3:{name:"Petrobras",assetClass:"stock"},PETR4:{name:"Petrobras",assetClass:"stock"},VALE3:{name:"Vale",assetClass:"stock"},
  ITUB4:{name:"Itaú Unibanco",assetClass:"stock"},BBDC4:{name:"Bradesco",assetClass:"stock"},BBAS3:{name:"Banco do Brasil",assetClass:"stock"},
  WEGE3:{name:"WEG",assetClass:"stock"},ABEV3:{name:"Ambev",assetClass:"stock"},B3SA3:{name:"B3",assetClass:"stock"},
  RENT3:{name:"Localiza",assetClass:"stock"},MGLU3:{name:"Magazine Luiza",assetClass:"stock"},LREN3:{name:"Lojas Renner",assetClass:"stock"},
  HGLG11:{name:"Pátria Logística",assetClass:"fii"},MXRF11:{name:"Maxi Renda",assetClass:"fii"},KNRI11:{name:"Kinea Renda Imobiliária",assetClass:"fii"},
  XPLG11:{name:"XP Log",assetClass:"fii"},VISC11:{name:"Vinci Shopping Centers",assetClass:"fii"},CPTS11:{name:"Capitânia Securities II",assetClass:"fii"},
  IVVB11:{name:"iShares S&P 500",assetClass:"etf"},BOVA11:{name:"iShares Ibovespa",assetClass:"etf"},SMAL11:{name:"iShares Small Cap",assetClass:"etf"},
  HASH11:{name:"Hashdex Nasdaq Crypto",assetClass:"etf"},
  XPML11:{name:"XP Malls",assetClass:"fii"},BTLG11:{name:"BTG Pactual Logística",assetClass:"fii"},
  HGRU11:{name:"CSHG Renda Urbana",assetClass:"fii"},IRDM11:{name:"Iridium Recebíveis Imobiliários",assetClass:"fii"},
  BCFF11:{name:"BTG Pactual Fundo de Fundos",assetClass:"fii"},RBRR11:{name:"RBR Rendimento High Grade",assetClass:"fii"},
  HGBS11:{name:"Hedge Brasil Shopping",assetClass:"fii"},PRIO3:{name:"PRIO",assetClass:"stock"},
  DIVO11:{name:"Itaú Dividendos",assetClass:"etf"},AAPL34:{name:"Apple (BDR)",assetClass:"bdr"},
  MSFT34:{name:"Microsoft (BDR)",assetClass:"bdr"},AMZO34:{name:"Amazon (BDR)",assetClass:"bdr"},
  GOGL34:{name:"Alphabet (BDR)",assetClass:"bdr"},NVDC34:{name:"NVIDIA (BDR)",assetClass:"bdr"},
  TSLA34:{name:"Tesla (BDR)",assetClass:"bdr"},MELI34:{name:"MercadoLibre (BDR)",assetClass:"bdr"},
  BBSE3:{name:"BB Seguridade",assetClass:"stock"},BPAC11:{name:"BTG Pactual",assetClass:"stock"},SANB11:{name:"Santander Brasil",assetClass:"stock"},
  CMIG4:{name:"Cemig",assetClass:"stock"},CPLE6:{name:"Copel",assetClass:"stock"},EGIE3:{name:"Engie Brasil",assetClass:"stock"},
  EQTL3:{name:"Equatorial Energia",assetClass:"stock"},SUZB3:{name:"Suzano",assetClass:"stock"},KLBN11:{name:"Klabin",assetClass:"stock"},
  VIVT3:{name:"Telefônica Brasil",assetClass:"stock"},TIMS3:{name:"TIM",assetClass:"stock"},TOTS3:{name:"Totvs",assetClass:"stock"},
  RADL3:{name:"Raia Drogasil",assetClass:"stock"},FLRY3:{name:"Fleury",assetClass:"stock"},GGBR4:{name:"Gerdau",assetClass:"stock"},
  CSNA3:{name:"CSN",assetClass:"stock"},CYRE3:{name:"Cyrela",assetClass:"stock"},MULT3:{name:"Multiplan",assetClass:"stock"},
  CCRO3:{name:"CCR",assetClass:"stock"},SBSP3:{name:"Sabesp",assetClass:"stock"},
  KNCR11:{name:"Kinea Rendimentos Imobiliários",assetClass:"fii"},KNIP11:{name:"Kinea Índices de Preços",assetClass:"fii"},
  KNSC11:{name:"Kinea Securities",assetClass:"fii"},VGIR11:{name:"Valora RE III",assetClass:"fii"},VGHF11:{name:"Valora Hedge Fund",assetClass:"fii"},
  GARE11:{name:"Guardian Real Estate",assetClass:"fii"},TRXF11:{name:"TRX Real Estate",assetClass:"fii"},PVBI11:{name:"VBI Prime Properties",assetClass:"fii"},
  RBRF11:{name:"RBR Alpha Fundo de Fundos",assetClass:"fii"},HGRE11:{name:"Pátria Escritórios",assetClass:"fii"},
  HSML11:{name:"Hedge Shopping Parque Dom Pedro",assetClass:"fii"},MALL11:{name:"Malls Brasil Plural",assetClass:"fii"},
  ALZR11:{name:"Alianza Trust Renda Imobiliária",assetClass:"fii"},LVBI11:{name:"VBI Logístico",assetClass:"fii"},
  GGRC11:{name:"GGR Covepi Renda",assetClass:"fii"},RZTR11:{name:"Riza Terrax",assetClass:"fii"},
  JSRE11:{name:"JS Real Estate Multigestão",assetClass:"fii"},RECT11:{name:"REC Renda Imobiliária",assetClass:"fii"}
};
