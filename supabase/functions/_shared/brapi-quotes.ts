export interface NormalizedMarketQuote {
  symbol: string;
  price: number;
  previous_close: number | null;
  currency: string;
  observed_at: string;
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parseBrapiQuote(
  payload: unknown,
  expectedSymbol: string,
): NormalizedMarketQuote | null {
  if (!payload || typeof payload !== "object" || !/^[A-Z0-9.]{1,32}$/.test(expectedSymbol)) return null;
  const root = payload as Record<string, unknown>;
  if (!Array.isArray(root.results) || root.results.length !== 1) return null;
  const result = root.results[0];
  if (!result || typeof result !== "object") return null;
  const row = result as Record<string, unknown>;
  const data = row.data && typeof row.data === "object"
    ? row.data as Record<string, unknown>
    : row;
  const symbol = String(data.symbol ?? row.symbol ?? row.requestedSymbol ?? "");
  if (symbol.toUpperCase() !== expectedSymbol) return null;

  const price = positiveNumber(data.regularMarketPrice);
  const previousClose = positiveNumber(data.regularMarketPreviousClose);
  const currency = typeof data.currency === "string" ? data.currency : "";
  const observedAt = typeof data.regularMarketTime === "string" ? data.regularMarketTime : "";
  const timestamp = Date.parse(observedAt);
  if (!price || currency !== "BRL" || !Number.isFinite(timestamp) ||
      timestamp > Date.now() + 2 * 60_000) return null;

  return {
    symbol: expectedSymbol,
    price,
    previous_close: previousClose,
    currency,
    observed_at: new Date(timestamp).toISOString(),
  };
}
