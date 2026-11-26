export type CurrencyCode = "BRL";
export type TransactionKind = "income" | "expense" | "transfer";
export type TransactionStatus = "paid" | "planned" | "cancelled";
export type AccountType = string;
export type MoneyCents = number & { readonly __brand: "MoneyCents" };

export interface Account {
  id: string;
  userId: string;
  name: string;
  institutionName: string | null;
  institutionCode: string | null;
  institutionLogoKey: string | null;
  accountType: AccountType;
  openingBalanceCents: MoneyCents;
  openingBalanceDate: string;
  isPrimary: boolean;
  isArchived: boolean;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  kind: Exclude<TransactionKind, "transfer">;
  color: string | null;
  icon: string | null;
}

export interface Transaction {
  id: string;
  userId: string;
  kind: TransactionKind;
  status: TransactionStatus;
  amountCents: MoneyCents;
  transactionDate: string;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  cardId: string | null;
  transferFromAccountId: string | null;
  transferToAccountId: string | null;
  settledAmountCents: MoneyCents;
  settledAt: string | null;
}

export interface Card {
  id: string;
  userId: string;
  accountId: string | null;
  name: string;
  institutionName: string;
  lastFour: string;
  creditLimitCents: MoneyCents;
  closingDay: number;
  dueDay: number;
  isArchived: boolean;
}

export function isEffectiveTransaction(status: TransactionStatus): boolean {
  return status === "paid";
}

export function affectsIncomeOrExpense(kind: TransactionKind): kind is "income" | "expense" {
  return kind !== "transfer";
}
