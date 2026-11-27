import type { CSSProperties } from "react";

/** Bloco de carregamento. Decorativo: o estado é anunciado por quem o usa. */
export function Skeleton({ width = "100%", height = 14, radius, className }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span className={["skeleton", className].filter(Boolean).join(" ")} style={style} aria-hidden="true" />;
}

/** Cartão de KPI em carregamento. */
export function KpiSkeleton() {
  return <div className="kpi-card is-loading" aria-hidden="true">
    <Skeleton width="45%" height={12} />
    <Skeleton width="70%" height={28} />
    <Skeleton width="55%" height={12} />
  </div>;
}

/** Linhas de lista em carregamento. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="list-skeleton" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => <div className="list-skeleton-row" key={index}>
      <Skeleton width={36} height={36} radius={10} />
      <span className="list-skeleton-text"><Skeleton width="60%" height={12} /><Skeleton width="35%" height={10} /></span>
      <Skeleton width={72} height={12} />
    </div>)}
  </div>;
}
