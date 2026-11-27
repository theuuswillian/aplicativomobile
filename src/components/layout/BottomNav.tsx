import { BOTTOM_NAV, isBottomNavActive, type DashboardTab, type GastosView, type NavDestination } from "./navigation";

type BottomNavProps = {
  activeTab: DashboardTab;
  gastosView: GastosView;
  hidden: boolean;
  onNavigate: (item: NavDestination) => void;
};

/** Navegação inferior fixa (<1024px). Recolhe ao rolar para baixo e volta ao subir. */
export function BottomNav({ activeTab, gastosView, hidden, onNavigate }: BottomNavProps) {
  return <nav className={`bottom-nav${hidden ? " is-hidden" : ""}`} aria-label="Navegação principal" aria-hidden={hidden ? "true" : "false"}>
    {BOTTOM_NAV.map((item) => {
      const active = isBottomNavActive(item, activeTab, gastosView);
      const Icon = item.icon;
      return <button key={item.id} type="button" data-nav={item.id} className={active ? "active" : ""} aria-current={active ? "page" : undefined} tabIndex={hidden ? -1 : undefined} onClick={() => onNavigate(item)}>
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className={item.compactLabel ? "nav-label has-compact" : "nav-label"}>{item.shortLabel ?? item.label}</span>
        {item.compactLabel && <span className="nav-label-compact">{item.compactLabel}</span>}
      </button>;
    })}
  </nav>;
}
