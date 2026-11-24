export interface RadarEvaluationAlert {
  id: string;
  generation: number;
  asset_class: string;
  symbol: string;
  condition_type: "above" | "below" | "daily_drop";
  threshold: string | number;
}

export interface RadarQuote {
  symbol: string;
  price: string | number;
  previous_close?: string | number | null;
  asset_class?: string;
  source: string;
  saved_at: string;
  observed_at?: string;
}

export interface RadarEvaluationResult {
  shouldFire: boolean;
  price: number | null;
  reason: "above" | "below" | "daily_drop" | "not_triggered" | "stale_quote" | "invalid_quote" | "asset_mismatch";
}

export function evaluateRadarAlert(
  alert: RadarEvaluationAlert,
  quote: RadarQuote | null,
  now = Date.now(),
): RadarEvaluationResult {
  if (!quote || quote.symbol.toUpperCase() !== alert.symbol.toUpperCase() ||
      !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0 ||
      !quote.source || !Number.isFinite(Number(alert.threshold)) || Number(alert.threshold) <= 0) {
    return { shouldFire: false, price: null, reason: "invalid_quote" };
  }
  if (quote.asset_class && quote.asset_class !== alert.asset_class) {
    return { shouldFire: false, price: null, reason: "asset_mismatch" };
  }
  const observed = Date.parse(quote.observed_at ?? quote.saved_at);
  if (!Number.isFinite(observed) || observed > now + 2 * 60_000 || now - observed > 15 * 60_000) {
    return { shouldFire: false, price: Number(quote.price), reason: "stale_quote" };
  }
  const price = Number(quote.price);
  const threshold = Number(alert.threshold);
  let shouldFire = false;
  if (alert.condition_type === "above") shouldFire = price >= threshold;
  else if (alert.condition_type === "below") shouldFire = price <= threshold;
  else {
    const previous = Number(quote.previous_close);
    if (!Number.isFinite(previous) || previous <= 0) {
      return { shouldFire: false, price, reason: "invalid_quote" };
    }
    const dropPercent = ((previous - price) / previous) * 100;
    shouldFire = dropPercent >= threshold;
  }
  return {
    shouldFire, price,
    reason: shouldFire ? alert.condition_type : "not_triggered",
  };
}
