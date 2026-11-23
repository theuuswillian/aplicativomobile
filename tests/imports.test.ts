import { describe, expect, it } from "vitest";
import { importDedupeKey, planImportBatch, planImportUndo } from "../src/domain/imports";

const row = {
  date: "2026-11-22", amountCents: 12500, description: "  Café   da manhã ",
  destinationType: "account" as const, destinationId: "account-1"
};

describe("CSV/OFX import semantics", () => {
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
