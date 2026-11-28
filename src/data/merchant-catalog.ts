/**
 * Estabelecimentos reconhecidos na descrição de lançamentos e importações (CSV/OFX).
 * Logos: simple-icons (CC0) em public/merchants/ e, para marcas brasileiras de varejo/benefícios,
 * os azulejos de react-bancos (MIT) em public/banks/. Todos no mesmo estilo quadrado.
 * As marcas pertencem aos respectivos titulares; uso apenas identificativo.
 * A ordem importa: entradas mais específicas (Uber Eats) vêm antes das genéricas (Uber),
 * e intermediários (PayPal) ficam por último para não esconder o estabelecimento real.
 */
export type MerchantEntry = {
  id: string;
  name: string;
  logoPath: string;
  /** Cor de fundo do azulejo (usada em placeholders). */
  color: string;
  patterns: RegExp[];
  /** Nome da categoria padrão sugerida para esse estabelecimento. */
  categoryHint?: string;
};

const si = (id: string) => `/merchants/${id}.svg`;
const rb = (slug: string) => `/banks/${slug}.svg`;

export const MERCHANT_CATALOG: MerchantEntry[] = [
  { id: "ubereats", name: "Uber Eats", logoPath: si("ubereats"), color: "#06c167", patterns: [/\bUBER\s*\*?\s*EATS\b/, /\bUBEREATS\b/], categoryHint: "Delivery" },
  { id: "uber", name: "Uber", logoPath: si("uber"), color: "#000000", patterns: [/\bUBER\b/, /\bUBR\s*\*/, /\bUBER\s*\*/], categoryHint: "Apps de transporte" },
  { id: "99", name: "99", logoPath: rb("99pay"), color: "#fedf00", patterns: [/\b99\s*(APP|POP|TAXI|TAXIS|TECNOLOGIA|PAY|FOOD|MOTO)\b/, /\b99\s*\*/, /^99$/, /\b99APP\b/], categoryHint: "Apps de transporte" },
  { id: "ifood", name: "iFood", logoPath: rb("ifood"), color: "#ea1d2c", patterns: [/\bIFOOD\b/, /\bIFD\s*\*/, /^IFD\b/, /\bIFOOD\.COM\b/], categoryHint: "Delivery" },
  { id: "rappi", name: "Rappi", logoPath: rb("rappicard"), color: "#ffffff", patterns: [/\bRAPPI\b/], categoryHint: "Delivery" },
  { id: "youtube", name: "YouTube", logoPath: si("youtube"), color: "#ff0000", patterns: [/\bYOUTUBE\b/, /\bYOUTUBEPREMIUM\b/, /GOOGLE\s*\*?\s*YOUTUBE/], categoryHint: "Streaming" },
  { id: "netflix", name: "Netflix", logoPath: si("netflix"), color: "#e50914", patterns: [/\bNETFLIX\b/], categoryHint: "Streaming" },
  { id: "spotify", name: "Spotify", logoPath: si("spotify"), color: "#1ed760", patterns: [/\bSPOTIFY\b/], categoryHint: "Streaming" },
  { id: "max", name: "Max", logoPath: si("hbomax"), color: "#000000", patterns: [/\bHBO\s*MAX\b/, /\bHBOMAX\b/, /\bMAX\.COM\b/, /^MAX$/, /\bHBO\b/], categoryHint: "Streaming" },
  { id: "paramountplus", name: "Paramount+", logoPath: si("paramountplus"), color: "#0064ff", patterns: [/\bPARAMOUNT\b/], categoryHint: "Streaming" },
  { id: "crunchyroll", name: "Crunchyroll", logoPath: si("crunchyroll"), color: "#ff5e00", patterns: [/\bCRUNCHYROLL\b/], categoryHint: "Streaming" },
  { id: "deezer", name: "Deezer", logoPath: si("deezer"), color: "#a238ff", patterns: [/\bDEEZER\b/], categoryHint: "Streaming" },
  { id: "twitch", name: "Twitch", logoPath: si("twitch"), color: "#9146ff", patterns: [/\bTWITCH\b/], categoryHint: "Streaming" },
  { id: "amazonprime", name: "Amazon Prime", logoPath: rb("amazonprime"), color: "#0779ff", patterns: [/\bAMAZON\s*PRIME\b/, /\bPRIME\s*VIDEO\b/, /\bAMZN\s*PRIME\b/, /\bPRIMEVIDEO\b/], categoryHint: "Streaming" },
  { id: "amazon", name: "Amazon", logoPath: rb("amazon"), color: "#ffffff", patterns: [/\bAMAZON\b/, /\bAMZN\b/, /\bAMAZON\.COM/] },
  { id: "apple", name: "Apple", logoPath: si("apple"), color: "#000000", patterns: [/\bAPPLE\.COM/, /\bAPPLE\b/, /\bITUNES\b/, /\bICLOUD\b/], categoryHint: "Assinaturas" },
  { id: "google", name: "Google", logoPath: si("google"), color: "#4285f4", patterns: [/\bGOOGLE\b/, /\bGOOGLE\s*\*/], categoryHint: "Assinaturas" },
  { id: "anthropic", name: "Anthropic (Claude)", logoPath: si("anthropic"), color: "#191919", patterns: [/\bANTHROPIC\b/, /\bCLAUDE\.AI\b/], categoryHint: "Assinaturas" },
  { id: "github", name: "GitHub", logoPath: si("github"), color: "#181717", patterns: [/\bGITHUB\b/], categoryHint: "Assinaturas" },
  { id: "notion", name: "Notion", logoPath: si("notion"), color: "#000000", patterns: [/\bNOTION\b/], categoryHint: "Assinaturas" },
  { id: "dropbox", name: "Dropbox", logoPath: si("dropbox"), color: "#0061ff", patterns: [/\bDROPBOX\b/], categoryHint: "Assinaturas" },
  { id: "zoom", name: "Zoom", logoPath: si("zoom"), color: "#0b5cff", patterns: [/\bZOOM\.US\b/, /\bZOOM\s*VIDEO\b/], categoryHint: "Assinaturas" },
  { id: "discord", name: "Discord", logoPath: si("discord"), color: "#5865f2", patterns: [/\bDISCORD\b/], categoryHint: "Assinaturas" },
  { id: "duolingo", name: "Duolingo", logoPath: si("duolingo"), color: "#58cc02", patterns: [/\bDUOLINGO\b/], categoryHint: "Cursos" },
  { id: "steam", name: "Steam", logoPath: si("steam"), color: "#000000", patterns: [/\bSTEAM\b/, /\bSTEAMPOWERED\b/, /\bVALVE\b/], categoryHint: "Lazer" },
  { id: "playstation", name: "PlayStation", logoPath: si("playstation"), color: "#0070d1", patterns: [/\bPLAYSTATION\b/, /\bPSN\b/, /\bSONY\s*INTERACTIVE\b/], categoryHint: "Lazer" },
  { id: "epicgames", name: "Epic Games", logoPath: si("epicgames"), color: "#313131", patterns: [/\bEPIC\s*GAMES\b/], categoryHint: "Lazer" },
  { id: "airbnb", name: "Airbnb", logoPath: si("airbnb"), color: "#ff5a5f", patterns: [/\bAIRBNB\b/], categoryHint: "Viagens" },
  { id: "booking", name: "Booking.com", logoPath: si("bookingdotcom"), color: "#003a9a", patterns: [/\bBOOKING\.COM\b/, /\bBOOKING\b/], categoryHint: "Viagens" },
  { id: "expedia", name: "Expedia", logoPath: si("expedia"), color: "#191e3b", patterns: [/\bEXPEDIA\b/], categoryHint: "Viagens" },
  { id: "trivago", name: "trivago", logoPath: si("trivago"), color: "#e32851", patterns: [/\bTRIVAGO\b/], categoryHint: "Viagens" },
  { id: "decolar", name: "Decolar", logoPath: rb("decolar"), color: "#ffffff", patterns: [/\bDECOLAR\b/], categoryHint: "Viagens" },
  { id: "latam", name: "LATAM", logoPath: rb("latampass"), color: "#ffffff", patterns: [/\bLATAM\b/, /\bTAM\s*LINHAS\b/], categoryHint: "Viagens" },
  { id: "azul", name: "Azul", logoPath: rb("azul"), color: "#ffffff", patterns: [/\bAZUL\s*(LINHAS|VIAGENS|AIRLINES)\b/, /\bVOEAZUL\b/], categoryHint: "Viagens" },
  { id: "shell", name: "Shell", logoPath: si("shell"), color: "#ffd500", patterns: [/\bSHELL\b/], categoryHint: "Combustível" },
  { id: "carrefour", name: "Carrefour", logoPath: rb("carrefour"), color: "#ffffff", patterns: [/\bCARREFOUR\b/], categoryHint: "Mercado" },
  { id: "atacadao", name: "Atacadão", logoPath: rb("atacadao"), color: "#ffffff", patterns: [/\bATACADAO\b/], categoryHint: "Mercado" },
  { id: "mcdonalds", name: "McDonald's", logoPath: si("mcdonalds"), color: "#fbc817", patterns: [/\bMC\s*DONALD/, /\bMCDONALDS\b/, /\bARCOS\s*DOURADOS\b/], categoryHint: "Restaurantes" },
  { id: "burgerking", name: "Burger King", logoPath: si("burgerking"), color: "#d62300", patterns: [/\bBURGER\s*KING\b/, /\bBK\s*BRASIL\b/], categoryHint: "Restaurantes" },
  { id: "kfc", name: "KFC", logoPath: si("kfc"), color: "#f40027", patterns: [/\bKFC\b/], categoryHint: "Restaurantes" },
  { id: "starbucks", name: "Starbucks", logoPath: si("starbucks"), color: "#006241", patterns: [/\bSTARBUCKS\b/], categoryHint: "Restaurantes" },
  { id: "shopee", name: "Shopee", logoPath: si("shopee"), color: "#ee4d2d", patterns: [/\bSHOPEE\b/] },
  { id: "aliexpress", name: "AliExpress", logoPath: si("aliexpress"), color: "#ff4747", patterns: [/\bALIEXPRESS\b/, /\bALIPAY\b/] },
  { id: "americanas", name: "Americanas", logoPath: rb("americanas"), color: "#f80032", patterns: [/\bAMERICANAS\b/, /\bLOJAS\s*AMERICANAS\b/] },
  { id: "magalu", name: "Magalu", logoPath: rb("magalupay"), color: "#ffffff", patterns: [/\bMAGALU\b/, /\bMAGAZINE\s*LUIZA\b/] },
  { id: "casasbahia", name: "Casas Bahia", logoPath: rb("casasbahia"), color: "#ffffff", patterns: [/\bCASAS\s*BAHIA\b/] },
  { id: "kabum", name: "KaBuM!", logoPath: rb("kabum"), color: "#000000", patterns: [/\bKABUM\b/], categoryHint: "Eletrônicos" },
  { id: "samsung", name: "Samsung", logoPath: rb("samsung"), color: "#000000", patterns: [/\bSAMSUNG\b/], categoryHint: "Eletrônicos" },
  { id: "havan", name: "Havan", logoPath: rb("havan"), color: "#00275e", patterns: [/\bHAVAN\b/] },
  { id: "ikea", name: "IKEA", logoPath: si("ikea"), color: "#0058a3", patterns: [/\bIKEA\b/], categoryHint: "Casa e decoração" },
  { id: "renner", name: "Renner", logoPath: rb("renner"), color: "#d72027", patterns: [/\bRENNER\b/], categoryHint: "Vestuário" },
  { id: "cea", name: "C&A", logoPath: rb("cea"), color: "#000000", patterns: [/\bC\s*&\s*A\b/, /\bC\s*E\s*A\s*MODAS\b/], categoryHint: "Vestuário" },
  { id: "riachuelo", name: "Riachuelo", logoPath: rb("riachuelo"), color: "#0c2e2d", patterns: [/\bRIACHUELO\b/], categoryHint: "Vestuário" },
  { id: "pernambucanas", name: "Pernambucanas", logoPath: rb("pernambucanas"), color: "#ffffff", patterns: [/\bPERNAMBUCANAS\b/], categoryHint: "Vestuário" },
  { id: "marisa", name: "Marisa", logoPath: rb("marisa"), color: "#ec008c", patterns: [/\bLOJAS?\s*MARISA\b/, /\bMARISA\s*LOJAS\b/], categoryHint: "Vestuário" },
  { id: "zara", name: "Zara", logoPath: si("zara"), color: "#000000", patterns: [/\bZARA\b/], categoryHint: "Vestuário" },
  { id: "uniqlo", name: "Uniqlo", logoPath: si("uniqlo"), color: "#ff0000", patterns: [/\bUNIQLO\b/], categoryHint: "Vestuário" },
  { id: "nike", name: "Nike", logoPath: si("nike"), color: "#111111", patterns: [/\bNIKE\b/], categoryHint: "Vestuário" },
  { id: "adidas", name: "adidas", logoPath: si("adidas"), color: "#000000", patterns: [/\bADIDAS\b/], categoryHint: "Vestuário" },
  { id: "paypal", name: "PayPal", logoPath: si("paypal"), color: "#002991", patterns: [/\bPAYPAL\b/, /\bPP\s*\*/] },
];

/** Normaliza a descrição do extrato: maiúsculas, sem acentos, espaços colapsados. */
export function normalizeMerchantText(description: string): string {
  return description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/**
 * Reconhece o estabelecimento pela descrição. Em intermediários ("PAYPAL *NETFLIX"),
 * o estabelecimento real vence porque o PayPal é o último da lista.
 */
export function detectMerchant(description: string | null | undefined): MerchantEntry | null {
  if (!description) return null;
  const text = normalizeMerchantText(description);
  if (text.length < 2) return null;
  return MERCHANT_CATALOG.find((merchant) => merchant.patterns.some((pattern) => pattern.test(text))) ?? null;
}
