// Formatação de valores em centavos (bigint) sem aritmética de ponto flutuante.

export function formatCents(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  const formattedWhole = new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(whole);
  return `${negative ? "-" : ""}${formattedWhole},${fraction}`;
}

export function formatInvestmentCents(value: bigint, currency: "BRL" | "USD"): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = Number(absolute % 100n) / 100;
  const numeric = Number(whole) + fraction;
  return `${negative ? "-" : ""}${new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)}`;
}

/** Valor compacto para eixos e rótulos de gráfico (ex.: R$ 3,8 mil). */
export function formatCompactCurrency(value: number, currency: "BRL" | "USD" = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Percentual com sinal e uma casa decimal (ex.: +12,4%). */
export function formatSignedPercent(value: number): string {
  const formatted = Math.abs(value).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted}%`;
}
