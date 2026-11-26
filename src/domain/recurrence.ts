export type RecurrenceFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "interval";

export interface RecurrenceRule {
  id: string;
  frequency: RecurrenceFrequency;
  startsOn: string;
  endsOn?: string | null;
  intervalCount?: number;
  intervalUnit?: "day" | "week" | "month";
  weekday?: number;
  monthDay?: number;
  monthOfYear?: number;
}

function dateOf(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError("Data inválida.");
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new TypeError("Data inválida.");
  return d;
}
function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function addMonthsFrom(anchor: Date, n: number, day = anchor.getUTCDate()): Date {
  const y = anchor.getUTCFullYear(), m = anchor.getUTCMonth() + n;
  const target = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, target), 12));
}

export function generateOccurrences(rule: RecurrenceRule, from: string, through: string): string[] {
  const start = dateOf(rule.startsOn), end = dateOf(through), lower = dateOf(from);
  if (end < lower || (rule.endsOn && end > dateOf(rule.endsOn) && dateOf(rule.endsOn) < lower)) return [];
  const until = rule.endsOn ? new Date(Math.min(end.getTime(), dateOf(rule.endsOn).getTime())) : end;
  const interval = rule.intervalCount ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 366) throw new TypeError("Intervalo inválido.");
  const out: string[] = [];
  const push = (d: Date) => { const s = iso(d); if (d >= lower && d >= start && d <= until) out.push(s); };
  if (rule.frequency === "weekly") {
    const weekday = rule.weekday ?? start.getUTCDay();
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new TypeError("Dia da semana inválido.");
    let d = new Date(start);
    d.setUTCDate(d.getUTCDate() + ((weekday - d.getUTCDay() + 7) % 7));
    for (; d <= until; d = addDays(d, 7)) push(d);
    return out;
  }
  if (rule.frequency === "daily" || rule.frequency === "biweekly" ||
      (rule.frequency === "interval" && (rule.intervalUnit ?? "day") !== "month")) {
    const step = rule.frequency === "daily" ? 1 : rule.frequency === "biweekly" ? 14 :
      interval * ((rule.intervalUnit ?? "day") === "week" ? 7 : 1);
    let d = new Date(start);
    while (d < lower) d = addDays(d, step);
    for (; d <= until; d = addDays(d, step)) push(d);
    return out;
  }
  const yearly = rule.frequency === "yearly";
  const anchor = yearly && rule.monthOfYear !== undefined
    ? new Date(Date.UTC(start.getUTCFullYear(), rule.monthOfYear - 1, 1, 12))
    : start;
  const day = rule.monthDay ?? start.getUTCDate();
  if (rule.monthDay !== undefined && (!Number.isInteger(rule.monthDay) || rule.monthDay < 1 || rule.monthDay > 31)) {
    throw new TypeError("Dia do mês inválido.");
  }
  if (yearly && rule.monthOfYear !== undefined && (!Number.isInteger(rule.monthOfYear) || rule.monthOfYear < 1 || rule.monthOfYear > 12)) {
    throw new TypeError("Mês do ano inválido.");
  }
  const step = yearly ? 12 : rule.frequency === "interval" ? interval : 1;
  let offset = 0;
  while (addMonthsFrom(anchor, offset, day) < lower) offset += step;
  for (let d = addMonthsFrom(anchor, offset, day); d <= until; offset += step, d = addMonthsFrom(anchor, offset, day)) push(d);
  return out;
}
