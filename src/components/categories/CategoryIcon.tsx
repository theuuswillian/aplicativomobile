import type { CSSProperties } from "react";
import { resolveCategoryVisual, type CategoryLike } from "./category-icons";

/** Selo quadrado com o ícone da categoria, na cor da categoria. */
export function CategoryIcon({ category, size = 36, className }: { category: CategoryLike; size?: number; className?: string }) {
  const { Icon, color } = resolveCategoryVisual(category);
  const style = { "--category-color": color, width: size, height: size } as CSSProperties;
  return <span className={["category-icon", className].filter(Boolean).join(" ")} style={style} aria-hidden="true">
    <Icon size={Math.round(size * 0.5)} strokeWidth={1.9} />
  </span>;
}
