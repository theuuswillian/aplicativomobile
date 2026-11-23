export type InvestmentOperation =
  | { type: "opening"; date: string; quantity: number; costCents: number }
  | { type: "buy"; date: string; quantity: number; unitPriceCents: number; feesCents?: number }
  | { type: "sell"; date: string; quantity: number; unitPriceCents: number; feesCents?: number }
  | { type: "dividend"; date: string; amountCents: number };

export interface InvestmentSummary {
  quantity: number;
  costBasisCents: number;
  averageCostCents: number;
  realizedProfitCents: number;
  dividendsReceivedCents: number;
  error: string | null;
}

export function calculateInvestmentSummary(operations: readonly InvestmentOperation[]): InvestmentSummary {
  const ordered = [...operations].sort((a, b) => a.date.localeCompare(b.date) ||
    (a.type === "opening" ? -1 : b.type === "opening" ? 1 : 0));
  let quantity = 0, costBasisCents = 0, realizedProfitCents = 0, dividendsReceivedCents = 0;
  let error: string | null = null;
  for (const operation of ordered) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(operation.date)) throw new TypeError("Data de operação inválida.");
    if (operation.type === "opening") {
      if (operation.quantity < 0 || !Number.isSafeInteger(operation.costCents) || operation.costCents < 0) throw new TypeError("Posição inicial inválida.");
      quantity = roundQuantity(quantity + operation.quantity);
      costBasisCents += operation.costCents;
    } else if (operation.type === "buy") {
      if (operation.quantity <= 0 || operation.unitPriceCents < 0 || (operation.feesCents ?? 0) < 0) throw new TypeError("Compra inválida.");
      quantity = roundQuantity(quantity + operation.quantity);
      costBasisCents += Math.round(operation.quantity * operation.unitPriceCents) + (operation.feesCents ?? 0);
    } else if (operation.type === "sell") {
      if (operation.quantity <= 0 || operation.quantity > quantity + 1e-9) {
        error ??= "Venda superior à posição disponível na data da operação.";
        continue;
      }
      const costRemoved = quantity > 0 ? Math.round(costBasisCents * operation.quantity / quantity) : 0;
      realizedProfitCents += Math.round(operation.quantity * operation.unitPriceCents) - (operation.feesCents ?? 0) - costRemoved;
      costBasisCents -= costRemoved;
      quantity = roundQuantity(quantity - operation.quantity);
      if (quantity <= 0) { quantity = 0; costBasisCents = 0; }
    } else {
      if (!Number.isSafeInteger(operation.amountCents) || operation.amountCents < 0) throw new TypeError("Provento inválido.");
      dividendsReceivedCents += operation.amountCents;
    }
  }
  return {
    quantity,
    costBasisCents,
    averageCostCents: quantity > 0 ? Math.round(costBasisCents / quantity) : 0,
    realizedProfitCents,
    dividendsReceivedCents,
    error
  };
}

function roundQuantity(value: number): number { return Math.round(value * 1e8) / 1e8; }
