const DATABASE_NAME = "granaviva-secure-cache";
const DATABASE_VERSION = 1;
const KEY_ID = "financial-records-aes-gcm-v1";
const KEY_STORE = "keys";
const RECORD_STORE = "records";

interface StoredKey {
  id: string;
  key: CryptoKey;
}

interface EncryptedRecord {
  id: string;
  version: 1;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
  updatedAt: string;
}

export class SecureStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SecureStorageError";
  }
}

function requirePlatform(): { factory: IDBFactory; subtle: SubtleCrypto } {
  const factory = globalThis.indexedDB;
  const subtle = globalThis.crypto?.subtle;
  if (!factory || !subtle) {
    throw new SecureStorageError("Armazenamento seguro indisponível neste dispositivo.");
  }
  return { factory, subtle };
}

function openDatabase(): Promise<IDBDatabase> {
  const { factory } = requirePlatform();
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        db.createObjectStore(RECORD_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new SecureStorageError("Não foi possível abrir o armazenamento seguro.", { cause: request.error }));
    request.onblocked = () => reject(new SecureStorageError("O armazenamento seguro está bloqueado por outra conexão."));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("Transação IndexedDB abortada."));
  });
}

async function readKey(db: IDBDatabase): Promise<CryptoKey | null> {
  const tx = db.transaction(KEY_STORE, "readonly");
  const result = await requestValue(tx.objectStore(KEY_STORE).get(KEY_ID)) as StoredKey | undefined;
  await transactionDone(tx);
  return result?.key ?? null;
}

async function getOrCreateKey(db: IDBDatabase): Promise<CryptoKey> {
  const { subtle } = requirePlatform();
  const existing = await readKey(db);
  if (existing) {
    if (existing.extractable) throw new SecureStorageError("A chave local não atende aos requisitos de segurança.");
    return existing;
  }

  const generated = await subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  try {
    const tx = db.transaction(KEY_STORE, "readwrite");
    tx.objectStore(KEY_STORE).add({ id: KEY_ID, key: generated } satisfies StoredKey);
    await transactionDone(tx);
    return generated;
  } catch {
    const concurrentKey = await readKey(db);
    if (concurrentKey && !concurrentKey.extractable) return concurrentKey;
    throw new SecureStorageError("Não foi possível persistir a chave criptográfica não exportável.");
  }
}

function validateIdentifiers(userId: string, recordId: string): string {
  if (!userId.trim() || !recordId.trim() || userId.length > 128 || recordId.length > 256) {
    throw new TypeError("Identificadores inválidos para armazenamento financeiro.");
  }
  return `${userId}:${recordId}`;
}

export async function saveFinancialRecord<T>(
  userId: string,
  recordId: string,
  value: T
): Promise<void> {
  const id = validateIdentifiers(userId, recordId);
  let db: IDBDatabase | undefined;
  try {
    const { subtle } = requirePlatform();
    db = await openDatabase();
    const key = await getOrCreateKey(db);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError("Registro financeiro não serializável.");
    const plaintext = new TextEncoder().encode(serialized);
    const ciphertext = await subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
      key,
      plaintext
    );
    const tx = db.transaction(RECORD_STORE, "readwrite");
    tx.objectStore(RECORD_STORE).put({
      id,
      version: 1,
      iv,
      ciphertext,
      updatedAt: new Date().toISOString()
    } satisfies EncryptedRecord);
    await transactionDone(tx);
  } catch (error) {
    if (error instanceof SecureStorageError || error instanceof TypeError) throw error;
    throw new SecureStorageError("Falha ao criptografar ou persistir o dado financeiro. Nenhum dado foi salvo em texto puro.", { cause: error });
  } finally {
    db?.close();
  }
}

export async function readFinancialRecord<T>(
  userId: string,
  recordId: string
): Promise<T | null> {
  const id = validateIdentifiers(userId, recordId);
  let db: IDBDatabase | undefined;
  try {
    const { subtle } = requirePlatform();
    db = await openDatabase();
    const tx = db.transaction(RECORD_STORE, "readonly");
    const record = await requestValue(tx.objectStore(RECORD_STORE).get(id)) as EncryptedRecord | undefined;
    await transactionDone(tx);
    if (!record) return null;
    if (record.version !== 1 || record.iv.length !== 12) {
      throw new SecureStorageError("Registro criptografado incompatível ou corrompido.");
    }
    const key = await readKey(db);
    if (!key || key.extractable) throw new SecureStorageError("Chave criptográfica ausente ou inválida; leitura bloqueada.");
    const plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv: record.iv, additionalData: new TextEncoder().encode(id) },
      key,
      record.ciphertext
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch (error) {
    if (error instanceof SecureStorageError || error instanceof TypeError) throw error;
    throw new SecureStorageError("Não foi possível descriptografar o dado financeiro. A leitura foi bloqueada.", { cause: error });
  } finally {
    db?.close();
  }
}

export async function deleteFinancialRecord(userId: string, recordId: string): Promise<void> {
  const id = validateIdentifiers(userId, recordId);
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const tx = db.transaction(RECORD_STORE, "readwrite");
    tx.objectStore(RECORD_STORE).delete(id);
    await transactionDone(tx);
  } catch (error) {
    throw new SecureStorageError("Não foi possível remover o registro financeiro local.", { cause: error });
  } finally {
    db?.close();
  }
}

export async function clearFinancialRecordsForUser(userId: string): Promise<void> {
  if (!userId.trim() || userId.length > 128) throw new TypeError("Identificador de usuário inválido.");
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const readTx = db.transaction(RECORD_STORE, "readonly");
    const records = await requestValue(readTx.objectStore(RECORD_STORE).getAll()) as EncryptedRecord[];
    await transactionDone(readTx);
    const ownedIds = records.filter((record) => record.id.startsWith(`${userId}:`)).map((record) => record.id);
    if (ownedIds.length === 0) return;
    const writeTx = db.transaction(RECORD_STORE, "readwrite");
    const store = writeTx.objectStore(RECORD_STORE);
    for (const id of ownedIds) store.delete(id);
    await transactionDone(writeTx);
  } catch (error) {
    throw new SecureStorageError("Não foi possível limpar os dados locais desta conta.", { cause: error });
  } finally {
    db?.close();
  }
}
