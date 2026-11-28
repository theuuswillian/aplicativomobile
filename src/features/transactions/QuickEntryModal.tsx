import { useEffect, type ReactNode } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, HandCoins } from "lucide-react";
import { Modal } from "../../components/ui";

type EntryKind = "income" | "expense" | "transfer";

type QuickEntryModalProps = {
  open: boolean;
  /** "choose" mostra os tipos; "form" mostra o formulário completo de lançamento. */
  step: "choose" | "form";
  kind: EntryKind;
  form: ReactNode;
  onBack: () => void;
  onClose: () => void;
  onSelect: (kind: EntryKind) => void;
  onOpenPlanning: () => void;
};

const TITLES: Record<EntryKind, string> = { expense: "Nova despesa", income: "Nova receita", transfer: "Nova transferência" };

/** Novo lançamento em um só lugar: escolha do tipo e, em seguida, o formulário completo no próprio modal. */
export function QuickEntryModal({ open, step, kind, form, onBack, onClose, onSelect, onOpenPlanning }: QuickEntryModalProps) {
  useEffect(() => {
    if (!open || step !== "form") return;
    const frame = window.requestAnimationFrame(() => document.getElementById("tx-description")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  if (step === "form") {
    return <Modal open={open} title={TITLES[kind]} description="Preencha os dados do lançamento" onClose={onClose} size="form">
      <button type="button" className="link-button quick-entry-back" onClick={onBack}><ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Trocar tipo</button>
      {form}
    </Modal>;
  }
  return <Modal open={open} title="Novo lançamento" description="Escolha o que deseja registrar" onClose={onClose}>
    <div className="quick-entry-options">
      <button type="button" onClick={() => onSelect("expense")}><span className="quick-entry-icon is-expense"><ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" /></span>Despesa</button>
      <button type="button" onClick={() => onSelect("income")}><span className="quick-entry-icon is-income"><ArrowDownLeft size={18} strokeWidth={1.75} aria-hidden="true" /></span>Receita</button>
      <button type="button" onClick={() => onSelect("transfer")}><span className="quick-entry-icon"><ArrowLeftRight size={18} strokeWidth={1.75} aria-hidden="true" /></span>Transferência</button>
      <button type="button" onClick={onOpenPlanning}><span className="quick-entry-icon is-goal"><HandCoins size={18} strokeWidth={1.75} aria-hidden="true" /></span>Empréstimo ou hora extra</button>
    </div>
  </Modal>;
}
