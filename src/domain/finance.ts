import { toCents } from "../lib/money";

export type FinancialStatus = "paid" | "planned" | "cancelled";
export type LedgerKind = "income" | "expense" | "transfer" | "card_expense" | "card_payment";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  status?: FinancialStatus;
  amountCents: number;
  date: string;
  accountId?: string | null;
  transferFromAccountId?: string | null;
  transferToAccountId?: string | null;
  cardId?: string | null;
  categoryId?: string | null;
}

export interface CardCycle {
  closingDate: string;
  dueDate: string;
}

export interface InvoicePayment {
  amountCents: number;
  date: string;
  status?: FinancialStatus;
  accountId?: string | null;
}

function assertCents(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Valor em centavos inválido.");
}

function assertSignedCents(value: number): void {
  if (!Number.isSafeInteger(value)) throw new TypeError("Valor em centavos inválido.");
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError("Data inválida.");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError("Data inválida.");
  }
  return date;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clampDay(year: number, month: number, day: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Math.max(1, day), last), 12));
}

export function isEffectiveStatus(status?: FinancialStatus): boolean {
  return status === undefined || status === "paid";
}

export function calculateAccountBalance(
  openingBalanceCents: number,
  accountId: string,
  entries: readonly LedgerEntry[],
  asOf: string,
  includePlanned = false
): number {
  assertSignedCents(openingBalanceCents);
  parseDate(asOf);
  let balance = openingBalanceCents;
  for (const entry of entries) {
    parseDate(entry.date);
    assertCents(entry.amountCents);
    if (entry.date > asOf || entry.status === "cancelled") continue;
    if (entry.status === "planned" && !includePlanned) continue;
    if (!isEffectiveStatus(entry.status) && entry.status !== "planned") continue;

    if (entry.kind === "income" && entry.accountId === accountId) balance += entry.amountCents;
    if (entry.kind === "expense" && entry.accountId === accountId) balance -= entry.amountCents;
    if (entry.kind === "card_payment" && entry.accountId === accountId) balance -= entry.amountCents;
    if (entry.kind === "transfer") {
      if (entry.transferFromAccountId === accountId) balance -= entry.amountCents;
      if (entry.transferToAccountId === accountId) balance += entry.amountCents;
    }
    // Compras no cartão não debitam a conta bancária; o débito ocorre no pagamento da fatura.
  }
  if (!Number.isSafeInteger(balance)) throw new RangeError("Saldo excede o limite seguro de centavos.");
  return balance;
}

export function calculateMonthlyTotals(
  entries: readonly LedgerEntry[],
  month: string
): { incomeCents: number; expenseCents: number; plannedIncomeCents: number; plannedExpenseCents: number } {
  if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5, 7)) < 1 || Number(month.slice(5, 7)) > 12) {
    throw new TypeError("Mês inválido.");
  }
  const totals = { incomeCents: 0, expenseCents: 0, plannedIncomeCents: 0, plannedExpenseCents: 0 };
  for (const entry of entries) {
    parseDate(entry.date);
    assertCents(entry.amountCents);
    if (entry.date.slice(0, 7) !== month || entry.kind === "transfer" || entry.kind === "card_payment" || entry.status === "cancelled") continue;
    const planned = entry.status === "planned";
    if (!planned && !isEffectiveStatus(entry.status)) continue;
    if (entry.kind === "income") totals[planned ? "plannedIncomeCents" : "incomeCents"] += entry.amountCents;
    if (entry.kind === "expense" || entry.kind === "card_expense") totals[planned ? "plannedExpenseCents" : "expenseCents"] += entry.amountCents;
  }
  if (!Object.values(totals).every(Number.isSafeInteger)) throw new RangeError("Total mensal excede o limite seguro de centavos.");
  return totals;
}

export function calculateCardCycle(purchaseDate: string, closingDay: number, dueDay: number): CardCycle {
  const purchase = parseDate(purchaseDate);
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31 ||
      !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new TypeError("Dia de fechamento ou vencimento inválido.");
  }
  let closing = clampDay(purchase.getUTCFullYear(), purchase.getUTCMonth(), closingDay);
  if (iso(closing) < purchaseDate) closing = clampDay(purchase.getUTCFullYear(), purchase.getUTCMonth() + 1, closingDay);
  const dueMonthOffset = dueDay > closingDay ? 0 : 1;
  const due = clampDay(closing.getUTCFullYear(), closing.getUTCMonth() + dueMonthOffset, dueDay);
  return { closingDate: iso(closing), dueDate: iso(due) };
}

export function cardInstallmentDates(purchaseDate: string, closingDay: number, dueDay: number, count: number): string[] {
  const purchase = parseDate(purchaseDate);
  if (!Number.isInteger(count) || count < 1 || count > 48) throw new TypeError("Quantidade de parcelas inválida.");
  const firstCycle = calculateCardCycle(purchaseDate, closingDay, dueDay);
  const firstClosing = parseDate(firstCycle.closingDate);
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return purchaseDate;
    const targetClosing = clampDay(firstClosing.getUTCFullYear(), firstClosing.getUTCMonth() + index, closingDay);
    const previousClosing = clampDay(firstClosing.getUTCFullYear(), firstClosing.getUTCMonth() + index - 1, closingDay);
    const candidate = clampDay(purchase.getUTCFullYear(), purchase.getUTCMonth() + index, purchase.getUTCDate());
    const candidateDate = iso(candidate);
    const candidateClosing = calculateCardCycle(candidateDate, closingDay, dueDay).closingDate;
    if (candidateClosing === iso(targetClosing)) return candidateDate;
    if (candidateClosing < iso(targetClosing)) {
      const firstDayAfterPreviousClose = new Date(previousClosing);
      firstDayAfterPreviousClose.setUTCDate(firstDayAfterPreviousClose.getUTCDate() + 1);
      return iso(firstDayAfterPreviousClose);
    }
    return iso(targetClosing);
  });
}

export function calculateInvoice(
  cardId: string,
  closingDay: number,
  dueDay: number,
  entries: readonly LedgerEntry[],
  invoiceClosingDate: string,
  payments: readonly InvoicePayment[],
  today: string
): { totalCents: number; paidCents: number; remainingCents: number; status: "paid" | "partial" | "open" | "overdue" } {
  parseDate(today);
  parseDate(invoiceClosingDate);
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new TypeError("Dia de fechamento ou vencimento inválido.");
  }
  let totalCents = 0;
  for (const entry of entries) {
    if (entry.cardId !== cardId || entry.kind !== "card_expense" || !isEffectiveStatus(entry.status)) continue;
    assertCents(entry.amountCents);
    const cycle = calculateCardCycle(entry.date, closingDay, dueDay);
    if (cycle.closingDate === invoiceClosingDate) totalCents += entry.amountCents;
  }
  const paidCents = payments.reduce((sum, payment) => {
    parseDate(payment.date);
    assertCents(payment.amountCents);
    return sum + (isEffectiveStatus(payment.status) && payment.date <= today ? payment.amountCents : 0);
  }, 0);
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(paidCents)) throw new RangeError("Total de fatura excede o limite seguro de centavos.");
  const remainingCents = Math.max(0, totalCents - paidCents);
  const dueMonthOffset = dueDay > closingDay ? 0 : 1;
  const closing = parseDate(invoiceClosingDate);
  const dueDate = iso(clampDay(closing.getUTCFullYear(), closing.getUTCMonth() + dueMonthOffset, dueDay));
  const status = remainingCents === 0 ? "paid" : paidCents > 0 ? "partial" : dueDate < today ? "overdue" : "open";
  return { totalCents, paidCents, remainingCents, status };
}

export function calculateCardCommittedLimitCents(
  cardId: string,
  closingDay: number,
  dueDay: number,
  entries: readonly LedgerEntry[],
  paymentsByClosingDate: ReadonlyMap<string, readonly InvoicePayment[]>,
  today: string
): number {
  parseDate(today);
  const invoices = new Map<string, { total: number; dueDate: string }>();
  for (const entry of entries) {
    if (entry.cardId !== cardId || entry.kind !== "card_expense" || !isEffectiveStatus(entry.status)) continue;
    assertCents(entry.amountCents);
    const cycle = calculateCardCycle(entry.date, closingDay, dueDay);
    const current = invoices.get(cycle.closingDate) ?? { total: 0, dueDate: cycle.dueDate };
    current.total += entry.amountCents;
    if (!Number.isSafeInteger(current.total)) throw new RangeError("Limite comprometido excede o limite seguro de centavos.");
    invoices.set(cycle.closingDate, current);
  }
  let committed = 0;
  for (const [closingDate, invoice] of invoices) {
    const paid = (paymentsByClosingDate.get(closingDate) ?? []).reduce((sum, payment) => {
      parseDate(payment.date);
      assertCents(payment.amountCents);
      return sum + (isEffectiveStatus(payment.status) && payment.date <= today ? payment.amountCents : 0);
    }, 0);
    if (!Number.isSafeInteger(paid)) throw new RangeError("Pagamento de fatura excede o limite seguro de centavos.");
    committed += Math.max(0, invoice.total - paid);
  }
  if (!Number.isSafeInteger(committed)) throw new RangeError("Limite comprometido excede o limite seguro de centavos.");
  return committed;
}

export function splitInstallments(totalCents: number, count: number): number[] {
  assertCents(totalCents);
  if (!Number.isInteger(count) || count < 1 || count > 48 || totalCents < count) {
    throw new TypeError("Quantidade de parcelas ou valor inválido.");
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function installmentDates(startDate: string, count: number): string[] {
  const start = parseDate(startDate);
  if (!Number.isInteger(count) || count < 1 || count > 48) throw new TypeError("Quantidade de parcelas inválida.");
  return Array.from({ length: count }, (_, index) =>
    iso(clampDay(start.getUTCFullYear(), start.getUTCMonth() + index, start.getUTCDate()))
  );
}

export function calculateBudgetRemaining(budgetCents: number, entries: readonly LedgerEntry[], month: string, categoryId: string): number {
  assertCents(budgetCents);
  const used = calculateMonthlyTotals(entries.filter((entry) => entry.categoryId === categoryId), month).expenseCents;
  return budgetCents - used;
}

export function calculateGoalProgress(targetCents: number, contributions: readonly { amountCents: number; status?: FinancialStatus }[]): {
  contributedCents: number; remainingCents: number; percentage: number;
} {
  assertCents(targetCents);
  if (targetCents === 0) throw new TypeError("A meta precisa ter valor-alvo positivo.");
  const contributedCents = contributions.reduce((sum, contribution) => {
    assertCents(contribution.amountCents);
    return sum + (isEffectiveStatus(contribution.status) ? contribution.amountCents : 0);
  }, 0);
  if (!Number.isSafeInteger(contributedCents)) throw new RangeError("Total da meta excede o limite seguro de centavos.");
  return {
    contributedCents,
    remainingCents: Math.max(0, targetCents - contributedCents),
    percentage: Math.min(100, Math.round(contributedCents / targetCents * 10000) / 100)
  };
}

export function amountToCents(value: number): number {
  return toCents(value);
}
