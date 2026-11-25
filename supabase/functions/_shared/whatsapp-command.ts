export type ParsedWhatsAppCommand =
  | { kind: "help" }
  | { kind: "confirm"; pendingId: string }
  | { kind: "cancel"; pendingId: string }
  | { kind: "transaction"; transactionKind: "income" | "expense"; amount: string; description: string }
  | { kind: "link"; code: string }
  | { kind: "unknown" };

export function parseWhatsAppCommand(input: unknown): ParsedWhatsAppCommand {
  if (typeof input !== "string" || input.length > 4096) return { kind: "unknown" };
  const value = input.trim();
  if (/^(AJUDA|HELP|MENU)$/i.test(value)) return { kind: "help" };
  const link = /^(?:VINCULAR\s+)?([0-9]{6})$/i.exec(value);
  if (link) return { kind: "link", code: link[1] };
  const confirm = /^CONFIRMAR\s+([0-9a-f-]{36})$/i.exec(value);
  if (confirm) return { kind: "confirm", pendingId: confirm[1] };
  const cancel = /^CANCELAR\s+([0-9a-f-]{36})$/i.exec(value);
  if (cancel) return { kind: "cancel", pendingId: cancel[1] };
  const transaction = /^(DESPESA|RECEITA)\s+([0-9]{1,8}(?:[,.][0-9]{1,2})?)\s+(.{1,240})$/i.exec(value);
  if (!transaction) return { kind: "unknown" };
  const normalized = transaction[2].replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return { kind: "unknown" };
  return {
    kind: "transaction",
    transactionKind: transaction[1].toUpperCase() === "DESPESA" ? "expense" : "income",
    amount: amount.toFixed(2),
    description: transaction[3].trim(),
  };
}
