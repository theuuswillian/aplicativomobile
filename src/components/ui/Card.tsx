import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  titleId?: string;
  icon?: LucideIcon;
  caption?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
};

/** Superfície padrão: fundo de superfície, borda sutil, raio 14px e cabeçalho opcional. */
export function Card({ title, titleId, icon: Icon, caption, action, className, children, ...rest }: CardProps) {
  return <section className={["card", className].filter(Boolean).join(" ")} aria-labelledby={title && titleId ? titleId : undefined} {...rest}>
    {(title || action) && <header className="card-heading">
      <div className="card-heading-title">
        {Icon && <span className="card-heading-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>}
        <div>
          {title && <h2 id={titleId}>{title}</h2>}
          {caption && <p className="card-caption">{caption}</p>}
        </div>
      </div>
      {action}
    </header>}
    {children}
  </section>;
}
