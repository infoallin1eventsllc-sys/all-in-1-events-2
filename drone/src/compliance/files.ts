/**
 * Attached documents (a certificate of waiver PDF) in their own small IndexedDB,
 * so the flight recorder's database schema (src/record/db.ts) is left alone.
 * Files stay on this device; the JSON export carries the record, not the file.
 */

const DB = 'a1-compliance-files';
const STORE = 'files';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser has no local file storage')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbp = null; }; resolve(db); };
    req.onerror = () => { dbp = null; reject(req.error ?? new Error('File storage unavailable')); };
  });
  dbp = p;
  return p;
}
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = t.onabort = () => reject(t.error ?? new Error('File storage failed'));
  }));
}

export const files = {
  put: async (file: Blob): Promise<string> => {
    if (file.size > MAX_FILE_BYTES) throw new Error('That file is over 15 MB');
    const id = `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    await run('readwrite', s => s.put(file, id));
    return id;
  },
  get: (id: string) => run<Blob | undefined>('readonly', s => s.get(id)),
  remove: (id: string) => run('readwrite', s => s.delete(id)).catch(() => undefined),
  /** Open a stored file in a new tab (the browser's own PDF viewer). */
  async open(id: string) {
    const b = await files.get(id);
    if (!b) throw new Error('The file is not on this device');
    const url = URL.createObjectURL(b);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
