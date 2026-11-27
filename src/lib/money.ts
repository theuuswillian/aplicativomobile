export function toCents(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError("Valor monetário inválido");

  const negative = value < 0;
  const [coefficient, exponentPart] = Math.abs(value).toString().toLowerCase().split("e");
  const exponent = Number(exponentPart ?? "0");
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = BigInt(`${whole}${fraction}`);
  const decimalShift = exponent - fraction.length + 2;

  let cents: bigint;
  if (decimalShift >= 0) {
    cents = digits * 10n ** BigInt(decimalShift);
  } else {
    const divisor = 10n ** BigInt(-decimalShift);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    cents = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  }

  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Valor monetário excede o limite seguro de centavos");
  }

  const signedCents = negative ? -cents : cents;
  return Number(signedCents);
}

const centsFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

export function formatBRLFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new TypeError("Centavos inválidos");
  return centsFormatter.format(cents / 100);
}

/** Formata a digitação de valores em reais como centavos (ex.: 123456 -> 1.234,56). */
export function formatBrlInput(value: string): string {
  const negative = value.trim().startsWith("-");
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (!digits) return negative ? "-" : "";
  const cents = BigInt(digits);
  const whole = cents / 100n;
  const fraction = String(cents % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(whole)},${fraction}`;
}

/**
 * Converte um valor decimal vindo do banco em centavos exatos.
 * O PostgREST devolve colunas `numeric` como número JSON (ex.: 1234.5),
 * então a função aceita string ou number, inclusive negativos.
 */
export function decimalToCents(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n;
    return BigInt(toCents(value));
  }
  const input = value.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) {
    const numeric = Number(input);
    return Number.isFinite(numeric) ? BigInt(toCents(numeric)) : 0n;
  }
  const [, sign, whole, fraction = ""] = match;
  let cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (fraction.length > 2 && Number(fraction[2]) >= 5) cents += 1n;
  return sign ? -cents : cents;
}

/** Converte centavos em string decimal aceita pelo Postgres (ex.: 123456n -> "1234.56"). */
export function centsToDecimal(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

/**
 * Lê um valor digitado em reais ("1.234,56", "1234,5", "1234.56", "R$ 10") e devolve
 * a string decimal para o banco ("1234.56"), ou null quando inválido.
 */
export function parseBrlAmount(value: string, options: { allowZero?: boolean; allowNegative?: boolean } = {}): string | null {
  let input = value.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  const negative = input.startsWith("-");
  if (negative && !options.allowNegative) return null;
  if (negative) input = input.slice(1);
  if (!input) return null;
  let whole: string;
  let fraction = "";
  if (/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(input)) {
    [whole, fraction = ""] = input.replace(/\./g, "").split(",");
  } else if (/^\d+\.\d{1,2}$/.test(input)) {
    [whole, fraction] = input.split(".");
  } else if (/^(?:\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(input)) {
    [whole, fraction = ""] = input.replace(/,/g, "").split(".");
  } else {
    return null;
  }
  whole = whole.replace(/^0+(?=\d)/, "");
  if (whole.length > 12) return null;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents === 0n && !options.allowZero) return null;
  return centsToDecimal(negative ? -cents : cents);
}

/** Converte o valor do banco para o formato de digitação brasileiro (ex.: 1234.5 -> "1.234,50"). */
export function decimalToBrlInput(value: string | number | null | undefined): string {
  const cents = decimalToCents(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(absolute / 100n);
  return `${negative ? "-" : ""}${whole},${String(absolute % 100n).padStart(2, "0")}`;
}

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata um valor decimal (string ou número) em reais. */
export function formatBRL(value: string | number | bigint | null | undefined): string {
  if (typeof value === "bigint") return brlFormatter.format(Number(value) / 100);
  return brlFormatter.format(Number(decimalToCents(value)) / 100);
}
