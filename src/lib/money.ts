const centsFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

export function toCents(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError("Valor monetário inválido");
  return Math.round((value + Number.EPSILON) * 100);
}

export function formatBRLFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new TypeError("Centavos inválidos");
  return centsFormatter.format(cents / 100);
}
