import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { parseWhatsAppCommand } from "./whatsapp-command.ts";

Deno.test("WhatsApp command parser accepts only explicit safe commands", () => {
  deepStrictEqual(parseWhatsAppCommand(" AJUDA "), { kind: "help" });
  deepStrictEqual(parseWhatsAppCommand("VINCULAR 123456"), { kind: "link", code: "123456" });
  deepStrictEqual(parseWhatsAppCommand("CONFIRMAR 20000000-0000-4000-8000-000000000001"), {
    kind: "confirm", pendingId: "20000000-0000-4000-8000-000000000001",
  });
  deepStrictEqual(parseWhatsAppCommand("DESPESA 12,50 almoço"), {
    kind: "transaction", transactionKind: "expense", amount: "12.50", description: "almoço",
  });
  deepStrictEqual(parseWhatsAppCommand("RECEITA 100 salario"), {
    kind: "transaction", transactionKind: "income", amount: "100.00", description: "salario",
  });
  strictEqual(parseWhatsAppCommand("DESPESA 0 fraude").kind, "unknown");
  strictEqual(parseWhatsAppCommand("DESPESA 10000001 teste").kind, "unknown");
  strictEqual(parseWhatsAppCommand("gastei 12 reais").kind, "unknown");
  strictEqual(parseWhatsAppCommand("DESPESA 10").kind, "unknown");
});
