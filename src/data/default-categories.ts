// Categorias padrão criadas (de forma idempotente) para cada conta.
// `icon` guarda o nome de um ícone do lucide-react (ver src/components/categories/category-icons.ts);
// `aliases` são nomes antigos/equivalentes: se a pessoa já tem um deles, a categoria existente é
// reaproveitada (só ganha ícone e cor novos) e nenhuma duplicata é criada.

export type CategoryKind = "income" | "expense";
export type DefaultCategory = { name: string; icon: string; kind: CategoryKind; color: string; is_default: boolean; aliases?: string[] };

type Seed = [name: string, icon: string, color: string, aliases?: string[]];

const EXPENSES: Seed[] = [
  ["Moradia", "House", "#6366f1"],
  ["Aluguel", "KeyRound", "#4f46e5"],
  ["Condomínio", "Building2", "#7c3aed"],
  ["Energia", "Zap", "#eab308"],
  ["Água", "Droplet", "#0ea5e9"],
  ["Internet", "Wifi", "#06b6d4", ["Internet e telefone"]],
  ["Celular", "Smartphone", "#0891b2", ["Telefone"]],
  ["Mercado", "ShoppingCart", "#16a34a", ["Supermercado"]],
  ["Restaurantes", "Utensils", "#f97316", ["Alimentação"]],
  ["Delivery", "Bike", "#ef4444"],
  ["Padaria", "Croissant", "#d97706"],
  ["Transporte", "Bus", "#3b82f6"],
  ["Combustível", "Fuel", "#dc2626"],
  ["Apps de transporte", "CarTaxiFront", "#1f2937", ["Uber", "Táxi"]],
  ["Estacionamento", "CircleParking", "#2563eb"],
  ["Pedágio", "Milestone", "#64748b"],
  ["Manutenção do veículo", "Wrench", "#475569", ["Manutenção"]],
  ["Saúde", "HeartPulse", "#e11d48"],
  ["Farmácia", "Pill", "#db2777"],
  ["Plano de saúde", "ShieldPlus", "#be123c"],
  ["Academia", "Dumbbell", "#ea580c"],
  ["Educação", "GraduationCap", "#2563eb"],
  ["Cursos", "Presentation", "#4338ca"],
  ["Livros", "BookOpen", "#7c2d12"],
  ["Lazer", "PartyPopper", "#c026d3"],
  ["Streaming", "Tv", "#9333ea"],
  ["Viagens", "Plane", "#0284c7", ["Viagem"]],
  ["Vestuário", "Shirt", "#a855f7", ["Roupas"]],
  ["Beleza", "Sparkles", "#ec4899"],
  ["Pets", "PawPrint", "#a16207"],
  ["Presentes", "Gift", "#f43f5e"],
  ["Doações", "HandHeart", "#10b981"],
  ["Impostos", "Landmark", "#57534e"],
  ["Tarifas bancárias", "Banknote", "#78716c"],
  ["Juros", "Percent", "#b91c1c"],
  ["Seguros", "Shield", "#0f766e"],
  ["Assinaturas", "Repeat", "#8b5cf6"],
  ["Eletrônicos", "Laptop", "#334155"],
  ["Casa e decoração", "Sofa", "#b45309", ["Casa"]],
  ["Filhos", "Baby", "#f472b6"],
  ["Outros", "Package", "#64748b"],
];

const INCOMES: Seed[] = [
  ["Salário", "Briefcase", "#059669"],
  ["Freelance", "Code", "#0d9488"],
  ["Hora extra", "Clock", "#0891b2"],
  ["13º salário", "CalendarCheck", "#16a34a", ["Décimo terceiro"]],
  ["Férias", "TreePalm", "#65a30d"],
  ["Bônus", "Award", "#ca8a04"],
  ["Rendimentos", "TrendingUp", "#10b981"],
  ["Dividendos", "ChartLine", "#047857"],
  ["Aluguel recebido", "Building", "#4f46e5"],
  ["Reembolso", "Undo2", "#0284c7"],
  ["Vendas", "Store", "#7c3aed"],
  ["Outros", "CircleDollarSign", "#64748b", ["Outras receitas"]],
];

const build = (kind: CategoryKind) => ([name, icon, color, aliases]: Seed): DefaultCategory =>
  ({ name, icon, kind, color, is_default: true, ...(aliases ? { aliases } : {}) });

export const DEFAULT_CATEGORIES: DefaultCategory[] = [...EXPENSES.map(build("expense")), ...INCOMES.map(build("income"))];

/** Mesma normalização da coluna gerada `normalized_name` no Postgres (minúsculas + espaços colapsados). */
export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalização para busca: também ignora acentos. */
export function searchKey(value: string): string {
  return normalizeCategoryName(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

type ExistingCategory = { id: string; name: string; kind: CategoryKind; icon: string | null; color: string | null };

/**
 * Planeja a sincronização das categorias padrão sem duplicar nada:
 * - insere apenas padrões cujo nome (ou alias) ainda não existe para aquele tipo;
 * - atualiza ícone/cor de categorias existentes da era dos emojis que correspondem a um padrão.
 */
export function planDefaultCategorySync(existing: ExistingCategory[], isKnownIcon: (icon: string) => boolean) {
  const byKey = new Map(existing.map((item) => [`${item.kind}:${normalizeCategoryName(item.name)}`, item]));
  const inserts: Array<Omit<DefaultCategory, "aliases">> = [];
  const updates: Array<{ id: string; icon: string; color: string }> = [];
  for (const item of DEFAULT_CATEGORIES) {
    const names = [item.name, ...(item.aliases ?? [])];
    const match = names.map((name) => byKey.get(`${item.kind}:${normalizeCategoryName(name)}`)).find(Boolean);
    if (!match) {
      const { aliases: _aliases, ...row } = item;
      void _aliases;
      inserts.push(row);
      continue;
    }
    if (!match.icon || !isKnownIcon(match.icon)) updates.push({ id: match.id, icon: item.icon, color: item.color });
  }
  return { inserts, updates };
}

/** Ícone (nome lucide) sugerido para uma categoria criada pela pessoa, a partir do nome. */
export function suggestCategoryIcon(name: string, kind: CategoryKind = "expense"): { icon: string; color: string } {
  const key = searchKey(name);
  const exact = DEFAULT_CATEGORIES.find((item) => item.kind === kind && [item.name, ...(item.aliases ?? [])].some((alias) => searchKey(alias) === key));
  if (exact) return { icon: exact.icon, color: exact.color };
  const rules: Array<[RegExp, string]> = [
    [/mercad|supermerc|hortifruti|feira|acougue/, "Mercado"], [/aluguel/, "Aluguel"], [/condominio/, "Condomínio"], [/casa|moradia|lar\b/, "Moradia"],
    [/restaur|aliment|comida|lanche|almoco|jantar/, "Restaurantes"], [/delivery|ifood|rappi/, "Delivery"], [/padaria|cafe/, "Padaria"],
    [/uber|99|taxi|corrida/, "Apps de transporte"], [/onibus|metro|transporte|trem/, "Transporte"], [/combust|gasolina|posto|etanol/, "Combustível"],
    [/estacion/, "Estacionamento"], [/pedagio/, "Pedágio"], [/oficina|mecanic|carro|moto|veiculo/, "Manutenção do veículo"],
    [/agua|saneamento/, "Água"], [/energia|luz|eletric/, "Energia"], [/internet|wi-?fi|banda/, "Internet"], [/celular|telefone|plano movel/, "Celular"],
    [/farmac|drogaria|remedio/, "Farmácia"], [/plano de saude|convenio/, "Plano de saúde"], [/saude|medic|dentist|consulta|exame/, "Saúde"],
    [/academia|gym|crossfit|pilates/, "Academia"], [/curso|aula/, "Cursos"], [/livro/, "Livros"], [/escola|faculdade|educa/, "Educação"],
    [/stream|netflix|spotify|filme|serie/, "Streaming"], [/assinatura/, "Assinaturas"], [/lazer|cinema|show|bar|festa/, "Lazer"],
    [/viage|hotel|passagem|aereo/, "Viagens"], [/roupa|calcad|vestu|moda/, "Vestuário"], [/beleza|cabel|salao|estetica|unha/, "Beleza"],
    [/pet|animal|veterin|racao/, "Pets"], [/presente/, "Presentes"], [/doac|caridade|dizimo/, "Doações"], [/imposto|iptu|ipva|taxa/, "Impostos"],
    [/tarifa|banco/, "Tarifas bancárias"], [/juro|multa/, "Juros"], [/seguro/, "Seguros"], [/eletron|gadget|computador/, "Eletrônicos"],
    [/decor|movel|moveis/, "Casa e decoração"], [/filho|crianca|bebe|escolar/, "Filhos"],
    [/salario|emprego/, "Salário"], [/freela|servico|projeto/, "Freelance"], [/hora extra/, "Hora extra"], [/bonus|plr|premio/, "Bônus"],
    [/dividend|provento/, "Dividendos"], [/rendimento|invest|juros recebidos/, "Rendimentos"], [/reembolso|estorno/, "Reembolso"], [/venda/, "Vendas"],
  ];
  const target = rules.find(([pattern]) => pattern.test(key))?.[1];
  const found = target ? DEFAULT_CATEGORIES.find((item) => item.name === target) : undefined;
  if (found) return { icon: found.icon, color: found.color };
  return kind === "income" ? { icon: "CircleDollarSign", color: "#059669" } : { icon: "Tag", color: "#64748b" };
}

/** Compatibilidade: alguns pontos antigos ainda pedem um ícone a partir do nome. */
export function categoryIcon(name: string, kind: CategoryKind = "expense"): string {
  return suggestCategoryIcon(name, kind).icon;
}
