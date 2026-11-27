import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "positive" | "negative" | "warning" | "accent";

/** Selo curto de estado (12px/500). */
export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={["badge", `badge-${tone}`, className].filter(Boolean).join(" ")}>{children}</span>;
}
