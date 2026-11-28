import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { CategoryIcon } from "../categories/CategoryIcon";
import type { CategoryKind } from "../../data/default-categories";

type Props = {
  kind: "income" | "expense" | "transfer";
  description?: string | null;
  category?: { name: string; kind: CategoryKind; icon: string | null; color: string | null } | null;
  size?: number;
};

/** Ícone de um lançamento: logo do estabelecimento → ícone da categoria → seta do tipo. */
export function TransactionGlyph({ kind, category, size = 36 }: Props) {
  if (category && kind !== "transfer") return <CategoryIcon category={category} size={size} className="tx-glyph" />;
  const Icon = kind === "income" ? ArrowDownLeft : kind === "transfer" ? ArrowLeftRight : ArrowUpRight;
  return <span className={"tx-icon " + (kind === "income" ? "is-income" : kind === "transfer" ? "is-transfer" : "is-expense")} aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>;
}
