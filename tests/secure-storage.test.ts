import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearFinancialRecordsForUser,
  readFinancialRecord,
  saveFinancialRecord,
  SecureStorageError
} from "../src/lib/secure-storage";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("granaviva-secure-cache");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database deletion blocked"));
  });
}

describe("secure local financial storage", () => {
  beforeEach(async () => deleteDatabase());

  it("encrypts and decrypts a record for the owning user", async () => {
    const record = { amountCents: 12990, description: "Salário", status: "paid" };
    await saveFinancialRecord("user-a", "transaction-1", record);
    await expect(readFinancialRecord<typeof record>("user-a", "transaction-1")).resolves.toEqual(record);
  });

  it("persists a non-exportable AES-GCM key", async () => {
    await saveFinancialRecord("user-a", "transaction-key", { value: 1 });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("granaviva-secure-cache", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keyRecord = await new Promise<{ key: CryptoKey }>((resolve, reject) => {
      const request = db.transaction("keys", "readonly").objectStore("keys").get("financial-records-aes-gcm-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    expect(keyRecord.key.algorithm.name).toBe("AES-GCM");
    expect(keyRecord.key.extractable).toBe(false);
    expect(keyRecord.key.usages).toContain("encrypt");
    expect(keyRecord.key.usages).toContain("decrypt");
  });

  it("fails closed when ciphertext is modified", async () => {
    await saveFinancialRecord("user-a", "transaction-tamper", { amountCents: 1234 });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("granaviva-secure-cache", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      const store = tx.objectStore("records");
      const request = store.get("user-a:transaction-tamper");
      request.onsuccess = () => {
        const record = request.result;
        const bytes = new Uint8Array(record.ciphertext);
        bytes[0] ^= 1;
        record.ciphertext = bytes.buffer;
        store.put(record);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    await expect(readFinancialRecord("user-a", "transaction-tamper")).rejects.toBeInstanceOf(SecureStorageError);
  });

  it("does not expose a record to a different user namespace", async () => {
    await saveFinancialRecord("user-a", "transaction-1", { amountCents: 5000 });
    await expect(readFinancialRecord("user-b", "transaction-1")).resolves.toBeNull();
  });

  it("stores ciphertext instead of financial plaintext", async () => {
    await saveFinancialRecord("user-a", "transaction-1", { description: "segredo-financeiro" });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("granaviva-secure-cache", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction("records", "readonly").objectStore("records").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    expect(JSON.stringify(records)).not.toContain("segredo-financeiro");
  });

  it("clears only records belonging to the requested user", async () => {
    await saveFinancialRecord("user-a", "one", { value: 1 });
    await saveFinancialRecord("user-b", "two", { value: 2 });
    await clearFinancialRecordsForUser("user-a");
    await expect(readFinancialRecord("user-a", "one")).resolves.toBeNull();
    await expect(readFinancialRecord("user-b", "two")).resolves.toEqual({ value: 2 });
  });

  it("rejects malformed identifiers and never falls back to plaintext", async () => {
    await expect(saveFinancialRecord("", "x", { value: 1 })).rejects.toThrow(TypeError);
    await expect(readFinancialRecord("user-a", "x")).resolves.toBeNull();
    expect(SecureStorageError.name).toBe("SecureStorageError");
  });
});
