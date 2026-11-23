export interface ImportRow {
  sourceId?: string | null;
  date: string;
  amountCents: number;
  description: string;
  destinationType: "account" | "card";
  destinationId: string;
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
  if (source) return `${destination}:source:${source.toLocaleLowerCase("en-US")}`;
  return `${destination}:row:${row.date}:${row.amountCents}:${normalizeDescription(row.description)}`;
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
