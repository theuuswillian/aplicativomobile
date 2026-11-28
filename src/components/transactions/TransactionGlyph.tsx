import { useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import { CategoryIcon } from "../categories/CategoryIcon";
import type { CategoryKind } from "../../data/default-categories";
import { detectMerchant, type MerchantEntry } from "../../data/merchant-catalog";

type Props = {
  kind: "income" | "expense" | "transfer";
  description?: string | null;
  category?: { name: string; kind: CategoryKind; icon: string | null; color: string | null } | null;
  size?: number;
};

/** Azulejo quadrado de marca (mesmo estilo dos bancos). */
export function BrandTile({ src, name, size = 36, className }: { src: string; name: string; size?: number; className?: string }) {
  return <img className={["brand-tile", className].filter(Boolean).join(" ")} src={src} alt={name} title={name} width={size} height={size} loading="lazy" decoding="async" />;
}

export function MerchantLogo({ merchant, size = 36 }: { merchant: MerchantEntry; size?: number }) {
  return <BrandTile src={merchant.logoPath} name={merchant.name} size={size} className="merchant-logo" />;
}

/** Ícone de um lançamento: logo do estabelecimento → ícone da categoria → seta do tipo. */
export function TransactionGlyph({ kind, description, category, size = 36 }: Props) {
  const merchant = kind === "transfer" ? null : detectMerchant(description);
  const [failed, setFailed] = useState<string | null>(null);
  if (merchant && failed !== merchant.id) {
    return <img className="brand-tile merchant-logo tx-glyph" src={merchant.logoPath} alt="" aria-hidden="true" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(merchant.id)} />;
  }
  if (category && kind !== "transfer") return <CategoryIcon category={category} size={size} className="tx-glyph" />;
  const Icon = kind === "income" ? ArrowDownLeft : kind === "transfer" ? ArrowLeftRight : ArrowUpRight;
  return <span className={"tx-icon " + (kind === "income" ? "is-income" : kind === "transfer" ? "is-transfer" : "is-expense")} aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>;
}
