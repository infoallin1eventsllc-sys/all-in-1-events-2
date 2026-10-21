/* 420 FRIENDLY — local data store.
 *
 * Photos live in IndexedDB, not localStorage: localStorage is a ~5MB string
 * store and would be blown by a single camera image. IndexedDB holds Blobs and
 * is orders of magnitude larger.
 *
 * SCOPE: everything here is per-browser. Photos uploaded on one machine are not
 * visible on another, and nothing reaches a server. This is the seam to replace
 * when object storage is connected — swap the bodies of the functions below and
 * the rest of the site is unchanged.
 */

const DB_NAME = "420_friendly";
const DB_VERSION = 1;
const PHOTO_STORE = "photos";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const s = db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        s.createIndex("productId", "productId", { unique: false });
        s.createIndex("addedAt", "addedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(PHOTO_STORE, mode);
        const store = t.objectStore(PHOTO_STORE);
        let out;
        try {
          out = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function photoId() {
  return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ===== Image processing =====
 * Full-size camera images are re-encoded before storage: a 6MB JPEG is wasted
 * on a 1200px-wide product tile, and storing originals fills the quota fast.
 */

const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.85;

function processImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Could not encode image"));
            return;
          }
          resolve({ blob, width: w, height: h });
        },
        "image/webp",
        WEBP_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Not a readable image"));
    };
    img.src = url;
  });
}

/* ===== Photo CRUD ===== */

async function addPhoto(file) {
  const { blob, width, height } = await processImage(file);
  const record = {
    id: photoId(),
    name: file.name,
    type: blob.type,
    size: blob.size,
    originalSize: file.size,
    width,
    height,
    productId: null,
    addedAt: new Date().toISOString(),
    blob
  };
  await tx("readwrite", (s) => s.add(record));
  return record;
}

function listPhotos() {
  return tx("readonly", (s) => s.getAll()).then((rows) =>
    (rows || []).sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
  );
}

function deletePhoto(id) {
  return tx("readwrite", (s) => s.delete(id));
}

async function assignPhoto(id, productId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(PHOTO_STORE, "readwrite");
    const s = t.objectStore(PHOTO_STORE);
    const get = s.get(id);
    get.onsuccess = () => {
      const rec = get.result;
      if (!rec) {
        reject(new Error("Photo not found"));
        return;
      }
      rec.productId = productId || null;
      s.put(rec);
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage || 0, quota: quota || 0 };
    }
  } catch {
    // Not supported everywhere; the UI falls back to summing photo sizes.
  }
  return null;
}

/* ===== Product image overrides =====
 * Product rendering is synchronous, so assigned photos are resolved to object
 * URLs once at page load and held in a plain map. If anything here fails the
 * map stays empty and every page renders exactly as it did before.
 */

const PHOTO_OVERRIDES = new Map();

async function initPhotoOverrides() {
  try {
    const rows = await listPhotos();
    PHOTO_OVERRIDES.clear();
    rows.forEach((r) => {
      if (r.productId && !PHOTO_OVERRIDES.has(r.productId)) {
        PHOTO_OVERRIDES.set(r.productId, URL.createObjectURL(r.blob));
      }
    });
  } catch {
    PHOTO_OVERRIDES.clear();
  }
  return PHOTO_OVERRIDES;
}

function photoOverrideFor(productId) {
  return PHOTO_OVERRIDES.get(productId) || null;
}

function formatBytes(n) {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}
