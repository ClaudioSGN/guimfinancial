import { parseStoredEntry, validEntry, type DollarEntry } from "./ledger";

const DB = "guimfinancial-dollars";
const STORE = "entries";
export const DOLLARS_CHANGED = "guimfinancial:dollars-changed";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Browser storage is unavailable"));
      return;
    }
    const request = indexedDB.open(DB, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: ["userId", "id"] });
      store.createIndex("userId", "userId");
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error("Browser storage is unavailable"));
    request.onblocked = () => { blocked = true; reject(new Error("Storage is busy")); };
  });
}

function notifyDollarChange() {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DOLLARS_CHANGED));
  } catch { /* Notifications must not turn a committed save into an error. */ }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(DOLLARS_CHANGED);
      channel.postMessage("changed");
      channel.close();
    }
  } catch { /* A notification failure must not turn a committed save into an error. */ }
}

// Row-level transactions keep simultaneous writes from overwriting other entries.
async function transact<T>(userId: string, mode: IDBTransactionMode, work: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  if (!userId) throw new Error("Sign in to access dollar entries");
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result: T;
      let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error("Storage operation cancelled"));
      const fail = (error: unknown) => {
        failure = error;
        try { tx.abort(); } catch { reject(error); }
      };
      try { work(tx.objectStore(STORE), (value) => { result = value; }, fail); }
      catch (error) { fail(error); }
    });
  } finally { db.close(); }
}

export async function readEntries(userId: string) {
  const rows = await transact<unknown[]>(userId, "readonly", (store, done) => {
    const request = store.index("userId").getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => done(request.result);
  });
  const entries = rows.map(parseStoredEntry);
  return entries.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export async function saveEntry(userId: string, entry: DollarEntry) {
  if (!validEntry(entry)) throw new Error("Invalid entry");
  await transact<void>(userId, "readwrite", (store, _done, fail) => {
    const existing = store.get([userId, entry.id]);
    existing.onsuccess = () => {
      try {
        // Keep legacy metadata on an edit without requiring it in the new ledger.
        store.put({ ...existing.result, id: entry.id, date: entry.date, usd: entry.usd, userId });
      } catch (error) { fail(error); }
    };
  });
  notifyDollarChange();
}

export async function deleteEntry(userId: string, id: string) {
  await transact<void>(userId, "readwrite", (store) => { store.delete([userId, id]); });
  notifyDollarChange();
}

export async function clearEntries(userId: string) {
  await transact<void>(userId, "readwrite", (store) => {
    const cursor = store.index("userId").openCursor(IDBKeyRange.only(userId));
    cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } };
  });
  notifyDollarChange();
}
