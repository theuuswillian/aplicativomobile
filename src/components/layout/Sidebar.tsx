import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChartNoAxesColumn, X } from "lucide-react";
import { SIDEBAR_GROUPS, isSidebarActive, type DashboardTab, type GastosView, type NavDestination } from "./navigation";
import { DRAWER_EDGE_PX, decideDrawerSnap } from "./drawer-gesture";

type SidebarProps = {
  activeTab: DashboardTab;
  gastosView: GastosView;
  onNavigate: (item: NavDestination) => void;
  userName: string;
  userEmail?: string;
  /** Gaveta aberta (apenas abaixo de 1024px). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MOBILE_QUERY = "(max-width: 1023.98px)";
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

type Drag = { startX: number; startY: number; startT: number; lastX: number; lastT: number; fromOpen: boolean; active: boolean; width: number };

/**
 * Navegação lateral. ≥1024px: fixa (240px). <1024px: gaveta off-canvas que abre pelo botão de menu
 * ou arrastando a partir da borda esquerda; fecha arrastando para a esquerda, tocando fora, com Esc
 * ou ao escolher um destino. Mantém o foco preso enquanto aberta e trava a rolagem da página.
 */
export function Sidebar({ activeTab, gastosView, onNavigate, userName, userEmail, open, onOpenChange }: SidebarProps) {
  const initials = (userName || userEmail || "GV").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const asideRef = useRef<HTMLElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [offset, setOffset] = useState<number | null>(null); // translateX em px enquanto o dedo arrasta
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
  const setOpen = useCallback((next: boolean) => onOpenChange(next), [onOpenChange]);

  // Fecha a gaveta quando a tela passa para o layout de desktop.
  useEffect(() => { if (!isMobile && open) setOpen(false); }, [isMobile, open, setOpen]);

  // Gestos: borda esquerda abre; arrastar para a esquerda fecha. Usa eventos de toque (passivos).
  useEffect(() => {
    if (!isMobile) return;
    const drawerWidth = () => asideRef.current?.getBoundingClientRect().width || 280;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const fromOpen = openRef.current;
      if (!fromOpen && touch.clientX > DRAWER_EDGE_PX) return;
      if (!fromOpen && document.querySelector(".modal-backdrop")) return;
      const now = performance.now();
      dragRef.current = { startX: touch.clientX, startY: touch.clientY, startT: now, lastX: touch.clientX, lastT: now, fromOpen, active: false, width: drawerWidth() };
    };
    const onMove = (event: TouchEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const touch = event.touches[0];
      const dx = touch.clientX - drag.startX;
      const dy = touch.clientY - drag.startY;
      if (!drag.active) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx) || (drag.fromOpen ? dx > 0 : dx < 0)) { dragRef.current = null; return; }
        drag.active = true;
      }
      drag.lastX = touch.clientX; drag.lastT = performance.now();
      const base = drag.fromOpen ? 0 : -drag.width;
      setOffset(Math.max(-drag.width, Math.min(0, base + dx)));
    };
    const onEnd = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || !drag.active) { setOffset(null); return; }
      const dx = drag.lastX - drag.startX;
      const dt = Math.max(1, drag.lastT - drag.startT);
      setOffset(null);
      setOpen(decideDrawerSnap({ fromOpen: drag.fromOpen, dx, velocity: dx / dt, width: drag.width }));
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [isMobile, setOpen]);

  // Gaveta aberta: foco preso, Esc fecha, rolagem do corpo travada, foco devolvido ao fechar.
  useEffect(() => {
    if (!isMobile || !open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const aside = asideRef.current;
    const items = () => Array.from(aside?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (aside?.querySelector<HTMLElement>("[aria-current='page']") ?? items()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (!aside?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    };
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden"; document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prevOverflow; document.body.style.overflow = prevBodyOverflow;
      previous?.focus();
    };
  }, [isMobile, open, setOpen]);

  const dragging = offset !== null;
  const style: CSSProperties | undefined = dragging ? { transform: `translate3d(${offset}px, 0, 0)`, transition: "none", visibility: "visible" } : undefined;
  const overlayStyle: CSSProperties | undefined = dragging ? { opacity: 1 + (offset ?? 0) / ((asideRef.current?.getBoundingClientRect().width) || 280), transition: "none", visibility: "visible" } : undefined;
  const drawerMode = isMobile;
  const hiddenDrawer = drawerMode && !open && !dragging;

  return <>
    {drawerMode && <div className={"sidebar-overlay" + (open ? " is-open" : "")} style={overlayStyle} aria-hidden="true" onClick={() => setOpen(false)} />}
    <aside
      ref={asideRef}
      id="app-sidebar"
      className={"sidebar" + (open ? " is-open" : "") + (dragging ? " is-dragging" : "")}
      style={style}
      role={drawerMode ? "dialog" : undefined}
      aria-modal={drawerMode && open ? "true" : undefined}
      aria-label={drawerMode ? "Menu de navegação" : undefined}
      aria-hidden={hiddenDrawer ? "true" : undefined}
      inert={hiddenDrawer || undefined}
    >
      <div className="sidebar-top">
        <a className="brand sidebar-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate(SIDEBAR_GROUPS[0].items[0]); }}>
          <span className="brand-mark" aria-hidden="true"><ChartNoAxesColumn size={18} strokeWidth={2} /></span>
          <span>Grana<span className="brand-accent">Viva</span></span>
        </a>
        {drawerMode && <button type="button" className="icon-button sidebar-close" aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={18} strokeWidth={1.75} aria-hidden="true" /></button>}
      </div>
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
    </aside>
  </>;
}
