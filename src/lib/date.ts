export function todayInBrazil(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Exibe uma data ISO (AAAA-MM-DD ou timestamp) como DD/MM/AAAA sem deslocar o dia. */
export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Valida uma data no formato AAAA-MM-DD (o valor entregue por <input type="date">). */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** Valida um mês no formato AAAA-MM (o valor entregue por <input type="month">). */
export function isIsoMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return Boolean(match) && Number(match![2]) >= 1 && Number(match![2]) <= 12;
}
