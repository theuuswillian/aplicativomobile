export type MoneyCents = number;
export type LiquidAccountKind = "bank" | "cash";
export type LedgerAccountKind =
  | LiquidAccountKind
  | "investment_cash"
  | "investment_asset"
  | "card_liability"
  | "receivable_asset"
  | "expense"
  | "income"
  | "opening_equity";

export interface JournalLineCents {
  account: LedgerAccountKind;
  debitCents: MoneyCents;
  creditCents: MoneyCents;
}

export type AccountingOperation =
  | { type: "cash_expense"; amountCents: MoneyCents }
  | { type: "card_expense"; amountCents: MoneyCents }
  | { type: "card_payment"; amountCents: MoneyCents }
  | { type: "investment_contribution"; amountCents: MoneyCents }
  | { type: "investment_redemption"; amountCents: MoneyCents }
  | { type: "loan"; amountCents: MoneyCents }
  | { type: "loan_repayment"; amountCents: MoneyCents }
  | { type: "overtime_receipt"; amountCents: MoneyCents }
  | { type: "transfer"; amountCents: MoneyCents };

function assertCents(value: number): asserts value is MoneyCents {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("O valor deve ser um inteiro positivo em centavos.");
  }
}

export function allocateInstallments(
  totalCents: MoneyCents,
  count: number
): MoneyCents[] {
  assertCents(totalCents);
  if (!Number.isInteger(count) || count < 1 || count > 48) {
    throw new TypeError("A quantidade de parcelas deve estar entre 1 e 48.");
  }

  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  const installments = Array.from({ length: count }, (_, index) =>
    base + (index === 0 ? remainder : 0)
  );

  if (installments.some((amount) => !Number.isSafeInteger(amount) || amount <= 0) ||
      installments.reduce((sum, amount) => sum + amount, 0) !== totalCents) {
    throw new RangeError("Não foi possível distribuir o valor sem perda de centavos.");
  }
  return installments;
}

export function buildJournalLines(operation: AccountingOperation): readonly JournalLineCents[] {
  assertCents(operation.amountCents);

  let debit: LedgerAccountKind;
  let credit: LedgerAccountKind;
  switch (operation.type) {
    case "cash_expense":
      debit = "expense";
      credit = "bank";
      break;
    case "card_expense":
      debit = "expense";
      credit = "card_liability";
      break;
    case "card_payment":
      debit = "card_liability";
      credit = "bank";
      break;
    case "investment_contribution":
      debit = "investment_asset";
      credit = "bank";
      break;
    case "investment_redemption":
      debit = "bank";
      credit = "investment_asset";
      break;
    case "loan":
      debit = "receivable_asset";
      credit = "bank";
      break;
    case "loan_repayment":
      debit = "bank";
      credit = "receivable_asset";
      break;
    case "overtime_receipt":
      debit = "bank";
      credit = "income";
      break;
    case "transfer":
      debit = "bank";
      credit = "bank";
      break;
  }

  return [
    { account: debit, debitCents: operation.amountCents, creditCents: 0 },
    { account: credit, debitCents: 0, creditCents: operation.amountCents }
  ];
}

export function assertBalancedJournal(lines: readonly JournalLineCents[]): void {
  if (lines.length < 2) throw new TypeError("Um diário precisa de pelo menos duas partidas.");
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.debitCents) || !Number.isSafeInteger(line.creditCents) ||
        line.debitCents < 0 || line.creditCents < 0 ||
        (line.debitCents > 0) === (line.creditCents > 0)) {
      throw new TypeError("Cada partida deve conter débito ou crédito, nunca ambos.");
    }
    debit += line.debitCents;
    credit += line.creditCents;
  }
  if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit !== credit) {
    throw new RangeError("Diário contábil não balanceado.");
  }
}

export function sumSpendableAccounts(
  accounts: readonly { id: string; accountType: string; balanceCents: MoneyCents }[]
): MoneyCents {
  return accounts.reduce((total, account) => {
    if (account.accountType.toLowerCase() === "investment") return total;
    if (!Number.isSafeInteger(account.balanceCents)) {
      throw new TypeError("Saldo de conta inválido.");
    }
    const next = total + account.balanceCents;
    if (!Number.isSafeInteger(next)) throw new RangeError("Saldo livre excede o limite seguro.");
    return next;
  }, 0);
}
