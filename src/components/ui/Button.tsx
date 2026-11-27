import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "primary-button",
  secondary: "secondary-button",
  ghost: "quiet-button",
  danger: "quiet-button danger-button",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: LucideIcon;
  children?: ReactNode;
};

/** Botão do design system. As variantes compartilham as classes usadas pelos formulários. */
export function Button({ variant = "secondary", icon: Icon, className, children, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={[VARIANT_CLASS[variant], className].filter(Boolean).join(" ")} {...rest}>
    {Icon && <Icon size={18} strokeWidth={1.75} aria-hidden="true" />}
    {children}
  </button>;
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  badge?: boolean;
};

/** Botão só com ícone: exige rótulo acessível. */
export function IconButton({ icon: Icon, label, badge, className, type = "button", ...rest }: IconButtonProps) {
  return <button type={type} className={["icon-button", className].filter(Boolean).join(" ")} aria-label={label} {...rest}>
    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
    {badge && <span className="icon-button-dot" aria-hidden="true" />}
  </button>;
}
