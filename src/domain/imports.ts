export interface ImportRow {
  sourceId?: string | null;
  date: string;
  amountCents: number;
  kind: "income" | "expense";
  description: string;
  destinationType: "account" | "card";
  destinationId: string;
}


export interface ParsedStatementRow {
  sourceId: string | null;
  date: string;
  amountCents: number;
  kind: "income" | "expense";
  description: string;
}

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "");
}

function parseStatementDate(value: string): string | null {
  const input = value.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) match = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(input);
  if (!match) return null;
  const year = Number(match[match.length === 4 && input.includes("-") ? 1 : 3]);
  const month = Number(match[match.length === 4 && input.includes("-") ? 2 : 2]);
  const day = Number(match[match.length === 4 && input.includes("-") ? 3 : 1]);
  const normalized = input.includes("-")
    ? { year, month, day }
    : { year, month, day };
  const date = new Date(Date.UTC(normalized.year, normalized.month - 1, normalized.day));
  if (date.getUTCFullYear() !== normalized.year || date.getUTCMonth() !== normalized.month - 1 || date.getUTCDate() !== normalized.day) return null;
  return `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function parseStatementAmount(value: string): { amountCents: number; negative: boolean } | null {
  let input = value.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!input || input.length > 40) return null;
  const negative = input.startsWith("-") || (input.startsWith("(") && input.endsWith(")"));
  input = input.replace(/[()]/g, "").replace(/^[+-]/, "");
  if (input.includes(",") && input.includes(".")) {
    input = input.lastIndexOf(",") > input.lastIndexOf(".")
      ? input.replace(/\./g, "").replace(",", ".")
      : input.replace(/,/g, "");
  } else if (input.includes(",")) {
    input = input.replace(",", ".");
  }
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > 99999999999999n) return null;
  return { amountCents: Number(cents), negative };
}

function parseCsvRecords(content: string): string[][] {
  const delimiter = (content.split(/\r?\n/, 1)[0].match(/;/g)?.length ?? 0) >
    (content.split(/\r?\n/, 1)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
    if (content.length > 5_000_000) throw new TypeError("Arquivo CSV excede o limite de 5 MB.");
  }
  if (quoted) throw new TypeError("Arquivo CSV contém aspas sem fechamento.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length > 10001) throw new TypeError("O arquivo contém mais de 10.000 linhas.");
  return rows;
}

export function parseCsvStatement(content: string): ParsedStatementRow[] {
  if (content.length > 5_000_000) throw new TypeError("Arquivo CSV excede o limite de 5 MB.");
  const records = parseCsvRecords(content.replace(/^\uFEFF/, ""));
  if (records.length < 2) throw new TypeError("O CSV precisa conter cabeçalho e ao menos um lançamento.");
  const headers = records[0].map(normalizeHeader);
  const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const dateIndex = index("data","date","datamovimento","transactiondate","posteddate");
  const descriptionIndex = index("descricao","description","historico","memo","nome","name");
  const amountIndex = index("valor","amount","value","montante");
  const debitIndex = index("debito","debit","saida","despesa");
  const creditIndex = index("credito","credit","entrada","receita");
  const typeIndex = index("tipo","type","natureza");
  const idIndex = index("fitid","id","referencia","reference","transactionid");
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new TypeError("Cabeçalho CSV inválido. Informe data, descrição e valor (ou débito/crédito).");
  }
  const result: ParsedStatementRow[] = [];
  for (const record of records.slice(1)) {
    if (result.length >= 10000) throw new TypeError("O arquivo contém mais de 10.000 lançamentos.");
    const date = parseStatementDate(record[dateIndex] ?? "");
    const description = (record[descriptionIndex] ?? "").trim().slice(0, 240);
    const rawAmount = amountIndex >= 0 ? (record[amountIndex] ?? "") : "";
    const parsedAmount = parseStatementAmount(rawAmount);
    const debit = debitIndex >= 0 ? parseStatementAmount(record[debitIndex] ?? "") : null;
    const credit = creditIndex >= 0 ? parseStatementAmount(record[creditIndex] ?? "") : null;
    const amount = parsedAmount ?? (credit && !debit ? credit : debit && !credit ? debit : null);
    if (!date || !description || !amount) throw new TypeError(`Linha CSV ${result.length + 2} inválida: confira data, descrição e valor.`);
    const explicitType = normalizeHeader(record[typeIndex] ?? "");
    const kind = explicitType.includes("receita") || explicitType === "entrada" || explicitType === "income" || explicitType === "credit" || (credit !== null && debit === null) || (amountIndex >= 0 && !parsedAmount?.negative && /^\s*\+/.test(rawAmount))
      ? "income" : explicitType.includes("despesa") || explicitType === "saida" || explicitType === "expense" || explicitType === "debit" || (parsedAmount?.negative ?? false) || debit !== null ? "expense" : "income";
    result.push({ sourceId: (record[idIndex] ?? "").trim() || null, date, amountCents: amount.amountCents, kind, description });
  }
  return result;
}

function decodeOfxText(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
}

function ofxValue(block: string, tag: string): string {
  const match = new RegExp("<" + tag + ">([^<\\r\\n]*)", "i").exec(block);
  return decodeOfxText(match?.[1]?.trim() ?? "");
}

export function parseOfxStatement(content: string): ParsedStatementRow[] {
  if (content.length > 5_000_000) throw new TypeError("Arquivo OFX excede o limite de 5 MB.");
  const blocks = [...content.matchAll(/<STMTTRN>\s*([\s\S]*?)<\/STMTTRN>/gi)];
  if (!blocks.length) throw new TypeError("OFX sem lançamentos STMTTRN válidos.");
  if (blocks.length > 10000) throw new TypeError("O arquivo contém mais de 10.000 lançamentos.");
  return blocks.map((match, index) => {
    const block = match[1];
    const posted = ofxValue(block, "DTPOSTED");
    const date = parseStatementDate(`${posted.slice(0,4)}-${posted.slice(4,6)}-${posted.slice(6,8)}`);
    const parsedAmount = parseStatementAmount(ofxValue(block, "TRNAMT"));
    const description = (ofxValue(block, "NAME") || ofxValue(block, "MEMO")).trim().slice(0,240);
    if (!date || !parsedAmount || !description) throw new TypeError(`Lançamento OFX ${index + 1} inválido.`);
    const type = ofxValue(block, "TRNTYPE").toUpperCase();
    const negativeType = ["DEBIT","PAYMENT","CHECK","FEE","SRVCHG","ATM","POS","DIRECTDEBIT"].includes(type);
    return {
      sourceId: ofxValue(block, "FITID") || null,
      date,
      amountCents: parsedAmount.amountCents,
      kind: parsedAmount.negative || negativeType ? "expense" : "income",
      description,
    };
  });
}

export interface ImportDecision {
  row: ImportRow;
  dedupeKey: string;
  result: "created" | "duplicate";
}

export interface ImportedItem {
  id: string;
  result: "created" | "linked" | "ignored" | "duplicate";
  snapshot?: unknown;
  transactionId?: string | null;
}

function stableHash(value: string): string {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, "0");
}

function normalizeDescription(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

export function importDedupeKey(row: ImportRow): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !Number.isSafeInteger(row.amountCents) || row.amountCents < 0 ||
      !row.destinationId.trim() || !row.description.trim()) {
    throw new TypeError("Linha de importação inválida.");
  }
  const destination = `${row.destinationType}:${row.destinationId}`;
  const source = row.sourceId?.trim();
  if (source) {
    if (source.length > 160) throw new TypeError("Referência externa muito longa para deduplicação.");
    return `${destination}:source:${source.toLocaleLowerCase("en-US")}`;
  }
  return `${destination}:row:${row.kind}:${row.date}:${row.amountCents}:${stableHash(normalizeDescription(row.description))}`;
}

export function planImportBatch(rows: readonly ImportRow[], existingKeys: ReadonlySet<string>): ImportDecision[] {
  const seen = new Set(existingKeys);
  return rows.map((row) => {
    const dedupeKey = importDedupeKey(row);
    const duplicate = seen.has(dedupeKey);
    seen.add(dedupeKey);
    return { row, dedupeKey, result: duplicate ? "duplicate" : "created" };
  });
}

/** Produz ações compensatórias sem apagar lançamentos que não foram criados pelo lote. */
export function planImportUndo(items: readonly ImportedItem[]): {
  deleteTransactionIds: string[];
  restoreLinkedSnapshots: Array<{ transactionId: string; snapshot: unknown }>;
  untouchedItemIds: string[];
} {
  const deleteTransactionIds: string[] = [];
  const restoreLinkedSnapshots: Array<{ transactionId: string; snapshot: unknown }> = [];
  const untouchedItemIds: string[] = [];
  for (const item of items) {
    if (item.result === "created" && item.transactionId) {
      deleteTransactionIds.push(item.transactionId);
    } else if (item.result === "linked" && item.transactionId && item.snapshot !== undefined) {
      restoreLinkedSnapshots.push({ transactionId: item.transactionId, snapshot: item.snapshot });
    } else {
      untouchedItemIds.push(item.id);
    }
  }
  return { deleteTransactionIds, restoreLinkedSnapshots, untouchedItemIds };
}
