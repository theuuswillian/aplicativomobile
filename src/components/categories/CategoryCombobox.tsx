import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { normalizeCategoryName, searchKey, type CategoryKind } from "../../data/default-categories";
import { CategoryIcon } from "./CategoryIcon";

export type ComboCategory = { id: string; name: string; kind: CategoryKind; icon: string | null; color: string | null };

type Props = {
  label: string;
  kind: CategoryKind;
  categories: ComboCategory[];
  /** id da categoria escolhida ("" = nenhuma). */
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string, kind: CategoryKind) => Promise<ComboCategory | null>;
  onRename: (id: string, name: string) => Promise<boolean>;
  /** Devolve null quando excluiu, ou a mensagem amigável do motivo de não excluir. */
  onDelete: (id: string) => Promise<string | null>;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
};

type Option = { type: "none" } | { type: "category"; category: ComboCategory } | { type: "create"; name: string };

/**
 * Seletor de categoria com busca (padrão ARIA combobox + listbox).
 * Cria categoria na hora quando não há correspondência e permite renomear ou excluir
 * a categoria destacada sem sair do formulário.
 */
export function CategoryCombobox({ label, kind, categories, value, onChange, onCreate, onRename, onDelete, required, allowEmpty = true, emptyLabel = "Sem categoria", disabled, className }: Props) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const ofKind = useMemo(() => categories.filter((item) => item.kind === kind).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [categories, kind]);
  const selected = ofKind.find((item) => item.id === value) ?? null;

  const options = useMemo<Option[]>(() => {
    const key = searchKey(query);
    const matches = key ? ofKind.filter((item) => searchKey(item.name).includes(key)) : ofKind;
    const list: Option[] = [];
    if (allowEmpty && !key) list.push({ type: "none" });
    for (const category of matches) list.push({ type: "category", category });
    const trimmed = query.trim().replace(/\s+/g, " ");
    if (trimmed && !ofKind.some((item) => normalizeCategoryName(item.name) === normalizeCategoryName(trimmed))) list.push({ type: "create", name: trimmed });
    return list;
  }, [allowEmpty, ofKind, query]);

  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const activeOption = options[activeIndex];
  const focusCategory = open && activeOption?.type === "category" ? activeOption.category : selected;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  function openList() {
    if (disabled) return;
    setOpen(true); setMessage("");
    const index = options.findIndex((option) => option.type === "category" && option.category.id === value);
    setActive(index >= 0 ? index : 0);
  }
  function close() { setOpen(false); setQuery(""); setRenaming(null); setConfirmDelete(null); }

  async function choose(option: Option | undefined) {
    if (!option) return;
    if (option.type === "none") { onChange(""); close(); return; }
    if (option.type === "category") { onChange(option.category.id); close(); return; }
    setPending(true); setMessage("");
    try {
      const created = await onCreate(option.name, kind);
      if (created) { onChange(created.id); close(); setMessage(`Categoria “${created.name}” criada.`); }
    } finally { setPending(false); }
  }

  async function saveRename() {
    if (!renaming) return;
    const name = renaming.name.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (ofKind.some((item) => item.id !== renaming.id && normalizeCategoryName(item.name) === normalizeCategoryName(name))) { setMessage("Já existe uma categoria com esse nome."); return; }
    setPending(true);
    try { if (await onRename(renaming.id, name)) { setRenaming(null); setMessage(`Categoria renomeada para “${name}”.`); } }
    finally { setPending(false); }
  }

  async function runDelete(id: string) {
    setPending(true);
    try {
      const problem = await onDelete(id);
      if (problem) setMessage(problem);
      else { if (id === value) onChange(""); setMessage("Categoria excluída."); }
      setConfirmDelete(null);
    } finally { setPending(false); }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); if (!open) openList(); else setActive((index) => Math.min(options.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Home" && open) { event.preventDefault(); setActive(0); }
    else if (event.key === "End" && open) { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === "Enter") { if (open) { event.preventDefault(); void choose(activeOption); } }
    else if (event.key === "Escape") { if (open) { event.preventDefault(); event.stopPropagation(); close(); } }
  }

  const displayValue = open ? query : selected?.name ?? "";

  return <div className={["category-combobox", open ? "is-open" : "", className].filter(Boolean).join(" ")}
    ref={wrapperRef}
    onBlur={(event) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      // Adiado: no Safari/WebKit o toque numa opção pode tirar o foco antes do clique ser entregue.
      window.setTimeout(() => { if (!wrapperRef.current?.contains(document.activeElement)) close(); }, 180);
    }}>
    <label htmlFor={inputId}>{label}</label>
    <div className="category-combobox-control">
      {selected && !open ? <CategoryIcon category={selected} size={24} /> : null}
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options.length ? optionId(activeIndex) : undefined}
        autoComplete="off"
        value={displayValue}
        placeholder={selected ? selected.name : open ? "Buscar ou criar categoria" : allowEmpty ? emptyLabel : "Selecione a categoria"}
        required={required && !selected}
        disabled={disabled}
        onFocus={openList}
        onClick={() => { if (!open) openList(); }}
        onChange={(event) => { setQuery(event.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="category-combobox-toggle" tabIndex={-1} aria-label={open ? "Fechar lista de categorias" : "Abrir lista de categorias"} onClick={() => { if (open) close(); else { openList(); inputRef.current?.focus(); } }} disabled={disabled}>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
    {open && <div className="category-combobox-popup">
      <ul id={listId} role="listbox" aria-label={label} className="category-combobox-list">
        {options.map((option, index) => {
          const isActive = index === activeIndex;
          const common = { id: optionId(index), role: "option" as const, className: "category-option" + (isActive ? " is-active" : ""), onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(), onMouseEnter: () => setActive(index), onClick: () => void choose(option) };
          if (option.type === "none") return <li key="none" {...common} aria-selected={value === ""}><span className="category-option-empty" aria-hidden="true">—</span><span>{emptyLabel}</span></li>;
          if (option.type === "create") return <li key="create" {...common} className={common.className + " is-create"} aria-selected={false}><span className="category-option-create" aria-hidden="true"><Plus size={14} strokeWidth={2} /></span><span>Criar categoria “{option.name}”</span></li>;
          return <li key={option.category.id} {...common} aria-selected={option.category.id === value}>
            <CategoryIcon category={option.category} size={28} /><span className="category-option-name">{option.category.name}</span>
            {option.category.id === value && <Check size={16} strokeWidth={2} aria-hidden="true" className="category-option-check" />}
          </li>;
        })}
        {options.length === 0 && <li className="category-option is-empty" role="presentation">Digite um nome para criar uma categoria.</li>}
      </ul>
      {focusCategory && <div className="category-combobox-manage">
        {renaming?.id === focusCategory.id ? <>
          <input aria-label={`Novo nome para ${focusCategory.name}`} value={renaming.name} maxLength={80} autoFocus
            onChange={(event) => setRenaming({ id: focusCategory.id, name: event.target.value })}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveRename(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenaming(null); } }} />
          <button type="button" className="icon-button" aria-label="Salvar nome" disabled={pending} onClick={() => void saveRename()}><Check size={16} strokeWidth={1.9} aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label="Cancelar renomeação" onClick={() => setRenaming(null)}><X size={16} strokeWidth={1.9} aria-hidden="true" /></button>
        </> : confirmDelete === focusCategory.id ? <>
          <span className="category-manage-text">Excluir “{focusCategory.name}”?</span>
          <button type="button" className="quiet-button danger-button" disabled={pending} onClick={() => void runDelete(focusCategory.id)}>Excluir</button>
          <button type="button" className="quiet-button" onClick={() => setConfirmDelete(null)}>Cancelar</button>
        </> : <>
          <span className="category-manage-text">“{focusCategory.name}”</span>
          <button type="button" className="quiet-button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setMessage(""); setRenaming({ id: focusCategory.id, name: focusCategory.name }); }}><Pencil size={14} strokeWidth={1.75} aria-hidden="true" /> Renomear</button>
          <button type="button" className="quiet-button danger-button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setMessage(""); setConfirmDelete(focusCategory.id); }}><Trash2 size={14} strokeWidth={1.75} aria-hidden="true" /> Excluir</button>
        </>}
      </div>}
    </div>}
    <p className="category-combobox-status" role="status" aria-live="polite">{pending ? "Salvando…" : message}</p>
  </div>;
}
