import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, HandCoins } from "lucide-react";
import { Modal } from "../../components/ui";

type QuickEntryModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (kind: "income" | "expense" | "transfer") => void;
  onOpenPlanning: () => void;
};

/** Escolha rápida do tipo de lançamento (abre o formulário já no tipo certo). */
export function QuickEntryModal({ open, onClose, onSelect, onOpenPlanning }: QuickEntryModalProps) {
  return <Modal open={open} title="Novo lançamento" description="Escolha o que deseja registrar" onClose={onClose}>
    <div className="quick-entry-options">
      <button type="button" onClick={() => onSelect("expense")}><span className="quick-entry-icon is-expense"><ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" /></span>Despesa</button>
      <button type="button" onClick={() => onSelect("income")}><span className="quick-entry-icon is-income"><ArrowDownLeft size={18} strokeWidth={1.75} aria-hidden="true" /></span>Receita</button>
      <button type="button" onClick={() => onSelect("transfer")}><span className="quick-entry-icon"><ArrowLeftRight size={18} strokeWidth={1.75} aria-hidden="true" /></span>Transferência</button>
      <button type="button" onClick={onOpenPlanning}><span className="quick-entry-icon is-goal"><HandCoins size={18} strokeWidth={1.75} aria-hidden="true" /></span>Empréstimo ou hora extra</button>
    </div>
  </Modal>;
}
