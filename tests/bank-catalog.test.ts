import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANK_CATALOG, LEGACY_BANK_KEYS, findBank, findBankByCode, findBankByName } from "../src/data/bank-catalog";
import { MERCHANT_CATALOG, detectMerchant } from "../src/data/merchant-catalog";

const readPublic = (path: string) => readFileSync(resolve(process.cwd(), "public", path.slice(1)), "utf8");

describe("logos de bancos (react-bancos)", () => {
  it("tem um SVG local, distinto e seguro para cada instituição do catálogo", () => {
    expect(BANK_CATALOG.length).toBeGreaterThanOrEqual(200);
    const paths = BANK_CATALOG.map((bank) => bank.logoPath);
    expect(new Set(paths).size).toBe(BANK_CATALOG.length);
    for (const bank of BANK_CATALOG) {
      const path = resolve(process.cwd(), "public", bank.logoPath.slice(1));
      expect(existsSync(path), bank.name).toBe(true);
      const svg = readPublic(bank.logoPath);
      expect(svg, bank.name).toContain("<svg");
      expect(svg, bank.name).not.toMatch(/<script|foreignObject|onload=|href="http/i);
    }
  });

  it("mantém as chaves já salvas nas contas (domínio legado) e chaves únicas", () => {
    const keys = BANK_CATALOG.map((bank) => bank.logoKey);
    expect(new Set(keys).size).toBe(BANK_CATALOG.length);
    for (const [legacyKey, slug] of Object.entries(LEGACY_BANK_KEYS)) {
      const bank = findBank(legacyKey);
      expect(bank?.slug, legacyKey).toBe(slug);
      expect(bank?.logoKey, legacyKey).toBe(legacyKey);
    }
    expect(findBank("nubank.com.br")?.logoPath).toBe("/banks/nubank.svg");
    expect(findBank("bancointer.com.br")?.name).toMatch(/Inter/);
  });

  it("encontra por código COMPE e por nome digitado", () => {
    expect(findBankByCode("77")?.slug).toBe("inter");
    expect(findBankByCode("260")?.slug).toBe("nubank");
    expect(findBankByName("Nubank")?.slug).toBe("nubank");
    expect(findBankByName("itaú")?.slug).toBe("itau");
    expect(findBankByName("x")).toBeUndefined();
  });

  it("documenta fonte, licença e aviso de marcas", () => {
    const readme = readPublic("/banks/README.md");
    expect(readme).toMatch(/react-bancos/);
    expect(readme).toMatch(/MIT/);
    expect(readme).toMatch(/marcas/i);
  });
});

describe("logos de estabelecimentos", () => {
  it("cada estabelecimento aponta para um SVG local existente", () => {
    for (const merchant of MERCHANT_CATALOG) {
      expect(existsSync(resolve(process.cwd(), "public", merchant.logoPath.slice(1))), merchant.name).toBe(true);
      expect(readPublic(merchant.logoPath)).not.toMatch(/<script|foreignObject|onload=/i);
    }
    const readme = readPublic("/merchants/README.md");
    expect(readme).toMatch(/simple-icons/);
    expect(readme).toMatch(/CC0/);
  });

  it.each([
    ["UBER *TRIP HELP.UBER.COM", "uber"],
    ["Uber Eats", "ubereats"],
    ["UBER *EATS PENDING", "ubereats"],
    ["99APP *99APP", "99"],
    ["99 TECNOLOGIA LTDA", "99"],
    ["IFD*IFOOD.COM AGENCIA", "ifood"],
    ["ifood", "ifood"],
    ["NETFLIX.COM", "netflix"],
    ["PAYPAL *NETFLIX", "netflix"],
    ["PAYPAL *LOJA X", "paypal"],
    ["Spotify P1234", "spotify"],
    ["GOOGLE *YOUTUBE PREMIUM", "youtube"],
    ["GOOGLE *Google Storage", "google"],
    ["APPLE.COM/BILL", "apple"],
    ["Amazon Prime Video", "amazonprime"],
    ["AMAZON MARKETPLACE", "amazon"],
    ["MC DONALDS 123", "mcdonalds"],
    ["Posto Shell Av Brasil", "shell"],
    ["SHOPEE*VENDEDOR", "shopee"],
    ["Supermercado Carrefour", "carrefour"],
  ])("reconhece “%s”", (description, id) => {
    expect(detectMerchant(description)?.id).toBe(id);
  });

  it("não inventa estabelecimento em descrições comuns", () => {
    for (const text of ["Mercado do bairro", "Aluguel", "PIX MARISA SILVA", "Parcela 99 de 120", "Conta de luz", ""]) {
      expect(detectMerchant(text), text).toBeNull();
    }
  });
});
