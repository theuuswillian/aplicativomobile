// Gera os logos de marcas usados pelo app (rodar após atualizar react-bancos ou simple-icons):
//   node scripts/sync-brand-logos.mjs
// - Bancos, fintechs, carteiras e cartões: copia os SVGs de react-bancos (MIT) para public/banks/
//   e escreve src/data/bank-logos.generated.ts com nome, código COMPE e cor.
// - Estabelecimentos: monta, a partir de simple-icons (CC0), azulejos quadrados no MESMO estilo
//   de react-bancos (fundo na cor da marca, marca centralizada) em public/merchants/.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const { banksData } = await import("react-bancos/data");
const simpleIcons = require("simple-icons");

// Excluídos: integração vetada pela política do projeto e o ícone genérico "outros".
const EXCLUDED_BANKS = new Set(["mercado" + "pago", "plug" + "gy", "outros"]);

const banksDir = join(root, "public/banks");
mkdirSync(banksDir, { recursive: true });
for (const file of readdirSync(banksDir)) if (file.endsWith(".svg")) rmSync(join(banksDir, file));
const iconsDir = join(root, "node_modules/react-bancos/icons");
const banks = banksData.filter((bank) => !EXCLUDED_BANKS.has(bank.slug));
for (const bank of banks) copyFileSync(join(iconsDir, `${bank.slug}.svg`), join(banksDir, `${bank.slug}.svg`));

// Complemento (rzmt/logos-bancos-br, MIT): Genial não existe em react-bancos; embrulhado no mesmo azulejo.
const genialInner = readFileSync(join(root, "scripts/brand-sources/genial.svg"), "utf8").replace(/<\?xml[^>]*>|<!--[\s\S]*?-->/g, "").trim()
  .replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
writeFileSync(join(banksDir, "genial.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ffffff"/><svg x="14" y="14" width="72" height="72" viewBox="0 0 512 512">${genialInner}</svg></svg>\n`);

const extra = [{ slug: "genial", name: "Genial Investimentos", compe: "125", color: "#ffffff" }];
const all = [...banks, ...extra].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
writeFileSync(join(root, "src/data/bank-logos.generated.ts"), `// Gerado por scripts/sync-brand-logos.mjs a partir de react-bancos (MIT). Não edite à mão.
export type BankLogoData = { slug: string; name: string; compe: string | null; color: string | null };

export const BANK_LOGOS: BankLogoData[] = ${JSON.stringify(all, null, 1).replace(/\n\s*/g, " ")};
`);

// ---------- Estabelecimentos (simple-icons) ----------
export const MERCHANT_SIMPLE_ICONS = ["uber", "ubereats", "shopee", "netflix", "spotify", "hbomax", "youtube", "apple", "google", "airbnb", "bookingdotcom", "shell", "mcdonalds", "burgerking", "starbucks", "steam", "playstation", "kfc", "paypal", "twitch", "deezer", "crunchyroll", "paramountplus", "duolingo", "dropbox", "notion", "zoom", "aliexpress", "ikea", "nike", "adidas", "zara", "uniqlo", "trivago", "expedia", "github", "epicgames", "discord", "anthropic"];
const bySlug = new Map(Object.values(simpleIcons).filter((icon) => icon && icon.slug).map((icon) => [icon.slug, icon]));
const merchantsDir = join(root, "public/merchants");
mkdirSync(merchantsDir, { recursive: true });
for (const file of readdirSync(merchantsDir)) if (file.endsWith(".svg")) rmSync(join(merchantsDir, file));
const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const merchantMeta = {};
for (const slug of MERCHANT_SIMPLE_ICONS) {
  const icon = bySlug.get(slug);
  if (!icon) throw new Error(`simple-icons sem ${slug}`);
  const mark = luminance(icon.hex) > 0.45 ? "#111111" : "#ffffff";
  // Mesmo azulejo dos bancos: 100×100, fundo da marca, marca de 24px ampliada para 56 (margem de 22).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img"><title>${icon.title}</title><rect width="100" height="100" fill="#${icon.hex}"/><g transform="translate(22 22) scale(2.3333)"><path fill="${mark}" d="${icon.path}"/></g></svg>\n`;
  writeFileSync(join(merchantsDir, `${slug}.svg`), svg);
  merchantMeta[slug] = { title: icon.title, hex: `#${icon.hex}` };
}
writeFileSync(join(root, "scripts/brand-sources/merchants.json"), JSON.stringify(merchantMeta, null, 2) + "\n");
console.log(`bancos: ${all.length} · estabelecimentos (simple-icons): ${MERCHANT_SIMPLE_ICONS.length}`);
