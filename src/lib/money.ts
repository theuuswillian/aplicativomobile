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
