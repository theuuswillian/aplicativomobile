import { Bell, Eye, EyeOff, Plus } from "lucide-react";
import { IconButton } from "../ui";

type HeaderProps = {
  title: string;
  subtitle?: string;
  description?: string;
  alertsLabel: string;
  hasActiveAlerts: boolean;
  balancesHidden: boolean;
  onToggleBalances: () => void;
  onOpenAlerts: () => void;
  onQuickAdd: () => void;
};

/** Cabeçalho da tela: compacto (56px) no mobile; título de página com ações no desktop. */
export function MobileHeader({ title, subtitle, description, alertsLabel, hasActiveAlerts, balancesHidden, onToggleBalances, onOpenAlerts, onQuickAdd }: HeaderProps) {
  return <header className="screen-header">
    <div className="screen-header-title">
      {subtitle && <span className="screen-header-subtitle">{subtitle}</span>}
      <h1 className="screen-title" id="screen-title">{title}</h1>
      {description && <p className="screen-header-description">{description}</p>}
    </div>
    <div className="screen-header-actions">
      <IconButton icon={balancesHidden ? EyeOff : Eye} label={balancesHidden ? "Mostrar saldos" : "Ocultar saldos"} aria-pressed={balancesHidden} onClick={onToggleBalances} />
      <IconButton icon={Bell} label={alertsLabel} badge={hasActiveAlerts} onClick={onOpenAlerts} />
      <button type="button" className="primary-button header-add-button" aria-label="Novo lançamento" onClick={onQuickAdd}>
        <Plus size={18} strokeWidth={2} aria-hidden="true" /><span className="header-add-label">Novo lançamento</span>
      </button>
    </div>
  </header>;
}
