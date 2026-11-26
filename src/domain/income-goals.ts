export type IncomeAssetClass = "stock" | "fii" | "fixed_income" | "etf" | "bdr" | "crypto";
export interface IncomeAsset {
  id: string;
  asset_class: IncomeAssetClass;
  currency: "BRL" | "USD";
  metadata?: Record<string, unknown> | null;
}
export interface IncomeOperation {
  asset_id: string;
  operation_type: "opening" | "buy" | "sell";
  operation_date: string;
  quantity: string | number;
  unit_price: string | number;
  gross_amount: string | number;
  fees: string | number;
}
export interface IncomeEvent {
  asset_id: string;
  event_type: "dividend" | "jcp" | "distribution" | "coupon" | "interest" | "amortization" | "other";
  reference_date: string;
  payment_date: string | null;
  received_amount: string | number;
  status: "announced" | "planned" | "received" | "cancelled";
}
export interface PassiveIncomeSnapshot {
  proventsReceived12mCents: number;
  proventsMonthlyAverageCents: number;
  allIncomeReceived12mCents: number;
  fixedIncomeEstimatedMonthlyCents: number;
  projectedMonthlyCents: number;
  unsupportedFixedIncomeCount: number;
  foreignIncomeEventCount: number;
}
function cents(value: string | number): bigint {
  const raw = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return 0n;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}
function inLast12Months(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return false;
  const end = new Date(today + "T12:00:00");
  end.setFullYear(end.getFullYear() - 1);
  const start = end.toISOString().slice(0, 10);
  return date >= start && date <= today;
}
function investmentCostBasisCents(assetId: string, operations: readonly IncomeOperation[]): number {
  const ordered = operations.filter((item) => item.asset_id === assetId).slice().sort((a, b) =>
    a.operation_date.localeCompare(b.operation_date));
  let quantity = 0;
  let cost = 0;
  for (const item of ordered) {
    const amount = Number(item.quantity);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (item.operation_type === "opening") {
      quantity += amount;
      cost += Number(cents(item.gross_amount)) + Number(cents(item.fees));
    } else if (item.operation_type === "buy") {
      quantity += amount;
      cost += Math.round(amount * Number(cents(item.unit_price))) + Number(cents(item.fees));
    } else if (item.operation_type === "sell" && amount <= quantity && quantity > 0) {
      const removed = Math.round(cost * amount / quantity);
      cost -= removed;
      quantity -= amount;
    }
  }
  return Math.max(0, Math.round(cost));
}
export function calculatePassiveIncomeSnapshot(input: {
  assets: readonly IncomeAsset[];
  operations: readonly IncomeOperation[];
  events: readonly IncomeEvent[];
  today: string;
}): PassiveIncomeSnapshot {
  const assets = new Map(input.assets.map((asset) => [asset.id, asset]));
  let proventsReceived12mCents = 0n;
  let allIncomeReceived12mCents = 0n;
  let foreignIncomeEventCount = 0;
  for (const event of input.events) {
    if (event.status !== "received" || !inLast12Months(event.payment_date ?? event.reference_date, input.today)) continue;
    const asset = assets.get(event.asset_id);
    if (!asset) continue;
    if (asset.currency !== "BRL") {
      foreignIncomeEventCount += 1;
      continue;
    }
    const amount = cents(event.received_amount);
    allIncomeReceived12mCents += amount;
    if ((asset.asset_class === "stock" || asset.asset_class === "fii") &&
        ["dividend", "jcp", "distribution"].includes(event.event_type)) {
      proventsReceived12mCents += amount;
    }
  }
  let fixedIncomeEstimatedMonthlyCents = 0;
  let unsupportedFixedIncomeCount = 0;
  for (const asset of input.assets) {
    if (asset.asset_class !== "fixed_income" || asset.currency !== "BRL") continue;
    const config = asset.metadata?.fixed_income;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      unsupportedFixedIncomeCount += 1;
      continue;
    }
    const details = config as Record<string, unknown>;
    if (details.indexer !== "PREFIXADO") {
      unsupportedFixedIncomeCount += 1;
      continue;
    }
    const annualRate = Number(String(details.annual_rate_percent ?? "").replace(",", "."));
    const maturity = typeof details.maturity_date === "string" ? details.maturity_date : "";
    const start = typeof details.start_date === "string" ? details.start_date : "";
    if (!Number.isFinite(annualRate) || annualRate <= 0 || annualRate > 1000 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(maturity) || maturity < input.today ||
        !/^\d{4}-\d{2}-\d{2}$/.test(start) || start > input.today) {
      unsupportedFixedIncomeCount += 1;
      continue;
    }
    const principalCents = investmentCostBasisCents(asset.id, input.operations);
    if (principalCents <= 0) continue;
    const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
    fixedIncomeEstimatedMonthlyCents += Math.round(principalCents * monthlyRate);
  }
  const provents = Number(proventsReceived12mCents);
  const average = Math.round(provents / 12);
  return {
    proventsReceived12mCents: provents,
    proventsMonthlyAverageCents: average,
    allIncomeReceived12mCents: Number(allIncomeReceived12mCents),
    fixedIncomeEstimatedMonthlyCents,
    projectedMonthlyCents: average + fixedIncomeEstimatedMonthlyCents,
    unsupportedFixedIncomeCount,
    foreignIncomeEventCount,
  };
}
