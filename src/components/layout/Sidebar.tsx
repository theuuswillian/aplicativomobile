import { ChartNoAxesColumn } from "lucide-react";
import { SIDEBAR_GROUPS, isSidebarActive, type DashboardTab, type GastosView, type NavDestination } from "./navigation";

type SidebarProps = {
  activeTab: DashboardTab;
  gastosView: GastosView;
  onNavigate: (item: NavDestination) => void;
  userName: string;
  userEmail?: string;
};

/** Navegação lateral fixa (≥1024px). */
export function Sidebar({ activeTab, gastosView, onNavigate, userName, userEmail }: SidebarProps) {
  const initials = (userName || userEmail || "GV").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <aside className="sidebar">
    <a className="brand sidebar-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate(SIDEBAR_GROUPS[0].items[0]); }}>
      <span className="brand-mark" aria-hidden="true"><ChartNoAxesColumn size={18} strokeWidth={2} /></span>
      <span>Grana<span className="brand-accent">Viva</span></span>
    </a>
    <nav className="sidebar-nav" aria-label="Navegação principal">
      {SIDEBAR_GROUPS.map((group) => <div className="sidebar-group" key={group.label}>
        <span className="sidebar-group-label">{group.label}</span>
        {group.items.map((item) => {
          const active = isSidebarActive(item, activeTab, gastosView);
          const Icon = item.icon;
          return <button key={item.id} type="button" data-nav={item.id} className={"sidebar-item" + (active ? " active" : "")} aria-current={active ? "page" : undefined} onClick={() => onNavigate(item)}>
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{item.label}</span>
          </button>;
        })}
      </div>)}
    </nav>
    <div className="sidebar-user">
      <span className="account-avatar is-small" aria-hidden="true">{initials}</span>
      <span className="sidebar-user-text"><strong>{userName || "Minha conta"}</strong>{userEmail && <small>{userEmail}</small>}</span>
    </div>
  </aside>;
}
