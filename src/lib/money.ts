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
  const digits = value.replace(/\D/g, "").slice(0, 12);
  if (!digits) return "";
  const cents = BigInt(digits);
  const whole = cents / 100n;
  const fraction = String(cents % 100n).padStart(2, "0");
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(whole)},${fraction}`;
}
