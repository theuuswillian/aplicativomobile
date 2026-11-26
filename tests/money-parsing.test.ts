import { describe, expect, it } from "vitest";
import { centsToDecimal, decimalToBrlInput, decimalToCents, formatBRL, parseBrlAmount } from "../src/lib/money";
import { formatDateBR, isIsoDate, isIsoMonth } from "../src/lib/date";

describe("decimalToCents (valores numeric do PostgREST)", () => {
  it("aceita números JSON além de strings", () => {
    expect(decimalToCents(1234.5)).toBe(123450n);
    expect(decimalToCents("1234.5")).toBe(123450n);
    expect(decimalToCents(0.1)).toBe(10n);
    expect(decimalToCents(150)).toBe(15000n);
  });
  it("mantém o sinal de valores negativos", () => {
    expect(decimalToCents("-5.5")).toBe(-550n);
    expect(decimalToCents(-5.5)).toBe(-550n);
  });
  it("trata vazio e nulo como zero", () => {
    expect(decimalToCents(null)).toBe(0n);
    expect(decimalToCents("")).toBe(0n);
  });
});

describe("parseBrlAmount", () => {
  it("lê valores com separador de milhar brasileiro", () => {
    expect(parseBrlAmount("1.234,56")).toBe("1234.56");
    expect(parseBrlAmount("12.345.678,9")).toBe("12345678.90");
    expect(parseBrlAmount("1500")).toBe("1500.00");
    expect(parseBrlAmount("1500,5")).toBe("1500.50");
    expect(parseBrlAmount("R$ 32,45")).toBe("32.45");
  });
  it("aceita ponto decimal digitado no teclado americano", () => {
    expect(parseBrlAmount("32.45")).toBe("32.45");
  });
  it("rejeita zero, negativos e textos inválidos por padrão", () => {
    expect(parseBrlAmount("0,00")).toBeNull();
    expect(parseBrlAmount("-10,00")).toBeNull();
    expect(parseBrlAmount("abc")).toBeNull();
    expect(parseBrlAmount("1,2,3")).toBeNull();
  });
  it("aceita zero e negativos quando permitido", () => {
    expect(parseBrlAmount("0,00", { allowZero: true })).toBe("0.00");
    expect(parseBrlAmount("-1.000,00", { allowNegative: true })).toBe("-1000.00");
  });
});

describe("conversões de exibição", () => {
  it("converte o valor do banco para edição no formato brasileiro", () => {
    expect(decimalToBrlInput(1234.5)).toBe("1.234,50");
    expect(decimalToBrlInput("89.9")).toBe("89,90");
  });
  it("formata reais a partir de número, string ou centavos", () => {
    expect(formatBRL(1234.5)).toMatch(/1\.234,50/);
    expect(formatBRL("89.90")).toMatch(/89,90/);
    expect(formatBRL(150n)).toMatch(/1,50/);
    expect(centsToDecimal(-150n)).toBe("-1.50");
  });
});

describe("datas", () => {
  it("formata datas ISO como DD/MM/AAAA sem mudar o dia", () => {
    expect(formatDateBR("2026-11-03")).toBe("03/11/2026");
    expect(formatDateBR("2026-11-03T23:30:00Z")).toBe("03/11/2026");
    expect(formatDateBR(null)).toBe("—");
  });
  it("valida datas e meses dos campos nativos", () => {
    expect(isIsoDate("2026-11-26")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoMonth("2027-05")).toBe(true);
    expect(isIsoMonth("2027-13")).toBe(false);
  });
});
