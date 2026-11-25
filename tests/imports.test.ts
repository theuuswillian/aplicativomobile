import { describe, expect, it } from "vitest";
import { importDedupeKey, parseCsvStatement, parseOfxStatement, planImportBatch, planImportUndo } from "../src/domain/imports";

const row = {
  date: "2026-11-22", amountCents: 12500, kind: "expense" as const, description: "  Café   da manhã ",
  destinationType: "account" as const, destinationId: "account-1"
};

describe("CSV/OFX import semantics", () => {

  it("parses Brazilian CSV with quoted delimiters, signed values and source IDs", () => {
    const rows = parseCsvStatement([
      "Data;Descrição;Valor;FITID",
      '23/11/2026;"Mercado; bairro";-123,45;A-1',
      '2026-11-24;"Salário ""empresa""";2500,00;A-2'
    ].join("\n"));
    expect(rows).toEqual([
      { sourceId: "A-1", date: "2026-11-23", amountCents: 12345, kind: "expense", description: "Mercado; bairro" },
      { sourceId: "A-2", date: "2026-11-24", amountCents: 250000, kind: "income", description: 'Salário "empresa"' }
    ]);
  });

  it("parses CSV with separate debit and credit columns", () => {
    const rows = parseCsvStatement("date,description,debit,credit\n2026-11-23,Groceries,50.25,\n2026-11-24,Salary,,3000.00");
    expect(rows.map(({ kind, amountCents }) => ({ kind, amountCents }))).toEqual([
      { kind: "expense", amountCents: 5025 }, { kind: "income", amountCents: 300000 }
    ]);
  });

  it("rejects malformed dates, ambiguous headers and unterminated quotes", () => {
    expect(() => parseCsvStatement("date,description,amount\n2026-02-30,Market,10.00")).toThrow(/Linha CSV/);
    expect(() => parseCsvStatement("date,description\n2026-11-23,Market")).toThrow(/Cabeçalho/);
    expect(() => parseCsvStatement('date,description,amount\n2026-11-23,"Market,10.00')).toThrow(/aspas/);
  });

  it("parses OFX statement transactions and infers signed transaction type", () => {
    const rows = parseOfxStatement(`OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261123120000<TRNAMT>-89.90<FITID>FIT-1<NAME>Supermercado</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261124120000<TRNAMT>4500.00<FITID>FIT-2<MEMO>Salário</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`);
    expect(rows).toEqual([
      { sourceId: "FIT-1", date: "2026-11-23", amountCents: 8990, kind: "expense", description: "Supermercado" },
      { sourceId: "FIT-2", date: "2026-11-24", amountCents: 450000, kind: "income", description: "Salário" }
    ]);
  });

  it("rejects oversized and empty OFX statements", () => {
    expect(() => parseOfxStatement("<OFX></OFX>")).toThrow(/sem lançamentos/);
    expect(() => parseOfxStatement("x".repeat(5_000_001))).toThrow(/5 MB/);
  });

  it("creates stable keys independent of accents and extra spaces", () => {
    expect(importDedupeKey(row)).toBe(importDedupeKey({ ...row, description: "cafe da manha" }));
  });

  it("prefers provider FITID/source references and scopes them to destination", () => {
    const a = importDedupeKey({ ...row, sourceId: "FITID-123" });
    expect(a).toContain("source:fitid-123");
    expect(a).not.toBe(importDedupeKey({ ...row, destinationId: "account-2", sourceId: "FITID-123" }));
  });

  it("marks duplicates both against existing rows and within the same batch", () => {
    const decisions = planImportBatch([row, row, { ...row, date: "2026-11-23" }], new Set());
    expect(decisions.map((item) => item.result)).toEqual(["created", "duplicate", "created"]);
    expect(planImportBatch([row], new Set([importDedupeKey(row)]))[0].result).toBe("duplicate");
  });

  it("undoes only rows created by the batch and restores linked snapshots", () => {
    expect(planImportUndo([
      { id: "a", result: "created", transactionId: "tx-created" },
      { id: "b", result: "linked", transactionId: "tx-linked", snapshot: { description: "original" } },
      { id: "c", result: "ignored" },
      { id: "d", result: "duplicate" }
    ])).toEqual({
      deleteTransactionIds: ["tx-created"],
      restoreLinkedSnapshots: [{ transactionId: "tx-linked", snapshot: { description: "original" } }],
      untouchedItemIds: ["c", "d"]
    });
  });
});
