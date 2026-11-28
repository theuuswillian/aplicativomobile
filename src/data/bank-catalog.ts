/**
 * Catálogo de bancos, fintechs, carteiras digitais e cartões com logo.
 * Fonte única dos logos: react-bancos (MIT) — SVGs copiados para public/banks/ por
 * scripts/sync-brand-logos.mjs, todos no mesmo azulejo quadrado (cor da marca + logo centralizado).
 * As marcas pertencem às respectivas instituições; o uso aqui é apenas identificativo.
 */
import { BANK_LOGOS } from "./bank-logos.generated";

/**
 * Chaves antigas salvas em accounts.institution_logo_key (domínio do banco) → slug react-bancos.
 * Contas já cadastradas continuam salvando e lendo a mesma chave.
 */
export const LEGACY_BANK_KEYS: Record<string, string> = {
  "agibank.com.br": "agibank",
  "bancointer.com.br": "inter",
  "banrisul.com.br": "banrisul",
  "bb.com.br": "bancodobrasil",
  "binance.com": "binance",
  "bmg.com.br": "bmg",
  "bnb.gov.br": "bancodonordeste",
  "bradesco.com.br": "bradesco",
  "brb.com.br": "brb",
  "btgpactual.com": "btgpactual",
  "bv.com.br": "bv",
  "c6bank.com.br": "c6bank",
  "caixa.gov.br": "caixa",
  "cora.com.br": "cora",
  "daycoval.com.br": "daycoval",
  "digio.com.br": "digio",
  "genialinvestimentos.com.br": "genial",
  "itau.com.br": "itau",
  "mercantildobrasil.com.br": "mercantil",
  "neon.com.br": "neon",
  "nubank.com.br": "nubank",
  "pagbank.com.br": "pagbank",
  "picpay.com": "picpay",
  "safra.com.br": "safra",
  "santander.com.br": "santander",
  "sicoob.com.br": "sicoob",
  "sicredi.com.br": "sicredi",
  "sofisa.com.br": "sofisa",
  "stone.com.br": "stone",
  "unicred.com.br": "unicred",
  "xpi.com.br": "xp",
};

const slugToLegacyKey = new Map(Object.entries(LEGACY_BANK_KEYS).map(([key, slug]) => [slug, key]));

export type BankCatalogEntry = {
  /** Código COMPE (vazio quando não se aplica). */
  code: string;
  name: string;
  /** Valor salvo em accounts.institution_logo_key: domínio legado quando existir, senão o slug. */
  logoKey: string;
  slug: string;
  logoPath: string;
  color: string | null;
};

export const BANK_CATALOG: BankCatalogEntry[] = BANK_LOGOS.map((bank) => ({
  code: bank.compe ?? "",
  name: bank.name,
  logoKey: slugToLegacyKey.get(bank.slug) ?? bank.slug,
  slug: bank.slug,
  logoPath: `/banks/${bank.slug}.svg`,
  color: bank.color,
}));

/** Encontra a instituição por chave salva (domínio legado ou slug). */
export function findBank(key: string | null | undefined): BankCatalogEntry | undefined {
  if (!key) return undefined;
  const slug = LEGACY_BANK_KEYS[key] ?? key;
  return BANK_CATALOG.find((bank) => bank.slug === slug);
}

/** Encontra pelo código COMPE ("77" ou "077"). */
export function findBankByCode(code: string | null | undefined): BankCatalogEntry | undefined {
  if (!code) return undefined;
  const padded = code.trim().padStart(3, "0");
  return BANK_CATALOG.find((bank) => bank.code === padded);
}

const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Encontra pelo nome digitado (ex.: nome da instituição de um cartão): exato, depois parcial. */
export function findBankByName(name: string | null | undefined): BankCatalogEntry | undefined {
  if (!name) return undefined;
  const query = plain(name);
  if (query.length < 2) return undefined;
  const exact = BANK_CATALOG.find((bank) => plain(bank.name) === query || bank.slug === query.replace(/ /g, ""));
  if (exact) return exact;
  const candidates = BANK_CATALOG.filter((bank) => {
    const bankName = plain(bank.name).replace(/^(banco|cartao) /, "");
    return bankName === query || query.split(" ").includes(bank.slug) || (query.length >= 3 && bankName.startsWith(query));
  });
  return candidates.sort((a, b) => a.name.length - b.name.length)[0];
}
