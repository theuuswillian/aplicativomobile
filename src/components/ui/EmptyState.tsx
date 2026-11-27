import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
};

/** Estado vazio com ícone, título, explicação e ação opcional. */
export function EmptyState({ icon: Icon, title, children, action, compact }: EmptyStateProps) {
  return <div className={"empty-state" + (compact ? " is-compact" : "")}>
    {Icon && <span className="empty-state-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>}
    {title && <strong className="empty-state-title">{title}</strong>}
    {children && <p>{children}</p>}
    {action}
  </div>;
}
