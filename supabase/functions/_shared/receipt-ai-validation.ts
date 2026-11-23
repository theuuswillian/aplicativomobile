export type ReceiptDraft = {
  sufficient: boolean;
  kind: "income" | "expense" | null;
  amount: string | null;
  date: string | null;
  description: string | null;
  category: string | null;
  payment_method: string | null;
  installment_count: number | null;
  card_last_four: string | null;
  confidence: number;
  warnings: string[];
};

function currentBrazilDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function validDateWindow(value: string): boolean {
  if (!validCalendarDate(value)) return false;
  const today = currentBrazilDate();
  const todayMs = Date.parse(today + "T00:00:00Z");
  const valueMs = Date.parse(value + "T00:00:00Z");
  const differenceDays = (valueMs - todayMs) / 86_400_000;
  return differenceDays >= -1_826 && differenceDays <= 366;
}

function amountInCents(value: string): bigint | null {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return cents > 0n && cents <= 1_000_000_000n ? cents : null;
}

function cleanText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = Array.from(value).map((character) => { const code = character.charCodeAt(0); return code <= 0x1f || code === 0x7f ? " " : character; }).join("").replace(/\\s+/g, " ").trim();
  return cleaned.length > 0 && cleaned.length <= maximum ? cleaned : null;
}

export function validateReceiptDraft(
  value: unknown,
  categories: Array<{ name: string; kind: string }>,
  cards: Array<{ name: string; last_four: string }>,
): ReceiptDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const required = [
    "sufficient", "kind", "amount", "date", "description", "category",
    "payment_method", "installment_count", "card_last_four", "confidence", "warnings",
  ];
  if (Object.keys(raw).length !== required.length ||
      required.some((key) => !Object.hasOwn(raw, key))) return null;
  if (typeof raw.sufficient !== "boolean" ||
      !["income", "expense", null].includes(raw.kind as string | null) ||
      typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence) ||
      raw.confidence < 0 || raw.confidence > 1 ||
      !Array.isArray(raw.warnings) || raw.warnings.length > 4) return null;

  const warnings = raw.warnings.map((item) => cleanText(item, 120));
  if (warnings.some((item) => item === null)) return null;

  if (!raw.sufficient) {
    if (raw.kind !== null || raw.amount !== null || raw.date !== null ||
        raw.description !== null || raw.category !== null ||
        raw.payment_method !== null || raw.installment_count !== null ||
        raw.card_last_four !== null) return null;
    return {
      sufficient: false,
      kind: null,
      amount: null,
      date: null,
      description: null,
      category: null,
      payment_method: null,
      installment_count: null,
      card_last_four: null,
      confidence: raw.confidence,
      warnings: warnings as string[],
    };
  }

  if ((raw.kind !== "income" && raw.kind !== "expense") ||
      typeof raw.amount !== "string" || amountInCents(raw.amount) === null ||
      typeof raw.date !== "string" || !validDateWindow(raw.date)) return null;

  const description = cleanText(raw.description, 80);
  if (!description) return null;

  let category: string | null = null;
  if (raw.category !== null) {
    const suggested = cleanText(raw.category, 80);
    if (!suggested) return null;
    const matched = categories.find((item) =>
      item.kind === raw.kind &&
      item.name.toLocaleLowerCase("pt-BR") === suggested.toLocaleLowerCase("pt-BR")
    );
    if (matched) category = matched.name;
    else warnings.push("A categoria sugerida não existe na sua lista e precisa ser escolhida na revisão.");
  }

  let paymentMethod: string | null = null;
  if (raw.payment_method !== null) {
    paymentMethod = cleanText(raw.payment_method, 40);
    if (!paymentMethod) return null;
  }

  let installmentCount: number | null = null;
  if (raw.installment_count !== null) {
    if (typeof raw.installment_count !== "number" ||
        !Number.isInteger(raw.installment_count) ||
        raw.installment_count < 1 || raw.installment_count > 48) return null;
    installmentCount = raw.installment_count > 1 ? raw.installment_count : null;
  }

  let cardLastFour: string | null = null;
  if (raw.card_last_four !== null) {
    const lastFour = cleanText(raw.card_last_four, 4);
    if (!lastFour || !/^\d{4}$/.test(lastFour)) return null;
    const matches = cards.filter((item) => item.last_four.trim() === lastFour);
    if (matches.length === 1) cardLastFour = lastFour;
    else warnings.push(matches.length === 0
      ? "O cartão identificado não corresponde a um cartão cadastrado."
      : "Há mais de um cartão com esse final; escolha o cartão manualmente.");
  }

  return {
    sufficient: true,
    kind: raw.kind,
    amount: raw.amount,
    date: raw.date,
    description,
    category,
    payment_method: paymentMethod,
    installment_count: installmentCount,
    card_last_four: cardLastFour,
    confidence: raw.confidence,
    warnings: warnings as string[],
  };
}
