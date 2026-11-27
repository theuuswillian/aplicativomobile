type ProgressTone = "accent" | "secondary" | "warning" | "negative";

/** Barra de progresso acessível (0–100). */
export function ProgressBar({ value, label, tone = "accent", className }: { value: number; label: string; tone?: ProgressTone; className?: string }) {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return <div className={["progress-bar", `progress-${tone}`, className].filter(Boolean).join(" ")} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)}>
    <span style={{ width: clamped + "%" }} />
  </div>;
}
