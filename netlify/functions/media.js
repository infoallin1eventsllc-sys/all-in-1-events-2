/**
 * Owner media library: upload, list, rename, delete.
 *
 * Uploads arrive in pieces because a Netlify function receives at most ~6 MB
 * per request. The browser slices the file, posts each slice base64-encoded,
 * and this reassembles them:
 *
 *   init     → reserve an id, record the declared type and size
 *   chunk    → store one slice under that id
 *   finalize → concatenate the slices into one blob, publish it, drop the parts
 *
 * Splitting it this way also means a dropped connection costs one slice rather
 * than the whole upload, and the owner sees real progress instead of a spinner
 * that either succeeds or does not.
 *
 * Everything that writes requires the owner session. The public list lives in
 * `media-public.js` and returns only what the landing page needs, so nothing
 * here has to decide per-caller what is safe to reveal.
 */

const {
  MAX_BYTES,
  CHUNK_BYTES,
  getStoreFor,
  newId,
  safeLabel,
  describeType,
  readIndex,
  writeIndex
} = require("../shared/media-store");
const { verifyToken, tokenFromEvent, normalizePasscode } = require("../shared/owner-session");

// An upload that stalls half-done should not keep its slices forever.
const UPLOAD_TTL_MS = 60 * 60 * 1000;

exports.handler = async (event) => {
  const passcode = normalizePasscode(process.env.OWNER_PASSCODE);
  if (!passcode) {
    return json(503, {
      error: "not_configured",
      message: "OWNER_PASSCODE is not set, so the media library cannot verify who you are."
    });
  }

  // Netlify Identity with the owner role is accepted as well, matching
  // owner-orders — same two doors, same checks, one place each.
  const session = verifyToken(tokenFromEvent(event), passcode);
  if (!session.ok) {
    const expired = session.reason === "expired";
    return json(401, {
      error: expired ? "expired" : "unauthorized",
      message: expired
        ? "Your session has ended. Enter the passcode again."
        : "Enter the owner passcode to manage media."
    });
  }

  let store;
  try {
    store = getStoreFor(event);
  } catch (err) {
    return json(503, {
      error: "storage_unavailable",
      message:
        "Media storage is not reachable. Netlify Blobs is only available on a " +
        "deployed site — it does not run under a plain static server."
    });
  }

  let body = {};
  if (event.httpMethod === "POST") {
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "bad_json", message: "Could not read that request." });
    }
  }

  const action = event.httpMethod === "GET" ? "list" : String(body.action || "");

  try {
    switch (action) {
      case "list":
        return json(200, { items: await readIndex(store) });
      case "init":
        return await initUpload(store, body);
      case "chunk":
        return await putChunk(store, body);
      case "finalize":
        return await finalize(store, body);
      case "delete":
        return await remove(store, body);
      case "rename":
        return await rename(store, body);
      default:
        return json(400, { error: "unknown_action", message: "Unknown action." });
    }
  } catch (err) {
    // The message may name internal storage detail, so it is logged rather
    // than returned. The owner gets something they can act on.
    console.error("media action failed:", action, err && err.message);
    return json(500, {
      error: "failed",
      message: "That did not go through. Try again, and if it keeps failing the file may be too large."
    });
  }
};

async function initUpload(store, body) {
  const desc = describeType(body.contentType);
  if (!desc) {
    return json(415, {
      error: "unsupported_type",
      message:
        "That file type cannot be played in a browser. Use MP3, M4A or WAV for " +
        "music, and MP4, WebM or MOV for video."
    });
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    return json(400, { error: "bad_size", message: "That file looks empty." });
  }

  const cap = MAX_BYTES[desc.kind];
  if (size > cap) {
    return json(413, {
      error: "too_large",
      message:
        "That file is " + mb(size) + " MB. The limit for " + desc.kind + " is " +
        mb(cap) + " MB — compress it, or trim the clip, and try again."
    });
  }

  const id = newId();
  await store.setJSON("upload/" + id + "/meta", {
    id,
    kind: desc.kind,
    contentType: body.contentType,
    size,
    label: safeLabel(body.name, desc.kind === "audio" ? "Track" : "Clip"),
    startedAt: Date.now(),
    received: 0
  });

  return json(200, { id, chunkBytes: CHUNK_BYTES });
}

async function putChunk(store, body) {
  const id = idOf(body.id);
  if (!id) return json(400, { error: "bad_id", message: "Missing upload id." });

  const meta = await store.get("upload/" + id + "/meta", { type: "json" });
  if (!meta) {
    return json(409, {
      error: "no_upload",
      message: "That upload was not found — it may have expired. Start it again."
    });
  }

  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index > 10000) {
    return json(400, { error: "bad_index", message: "Bad chunk index." });
  }

  const data = String(body.data || "");
  if (!data) return json(400, { error: "empty_chunk", message: "Empty chunk." });

  const buf = Buffer.from(data, "base64");
  if (!buf.length) return json(400, { error: "bad_chunk", message: "Chunk could not be decoded." });

  // The declared size was checked at init; this stops a client declaring a
  // small file and then streaming an unbounded one.
  const received = (meta.received || 0) + buf.length;
  if (received > meta.size + CHUNK_BYTES) {
    await discard(store, id, meta);
    return json(413, {
      error: "too_large",
      message: "That upload sent more data than it declared and was stopped."
    });
  }

  await store.set("upload/" + id + "/part/" + index, buf);
  meta.received = received;
  await store.setJSON("upload/" + id + "/meta", meta);

  return json(200, { ok: true, received });
}

async function finalize(store, body) {
  const id = idOf(body.id);
  if (!id) return json(400, { error: "bad_id", message: "Missing upload id." });

  const meta = await store.get("upload/" + id + "/meta", { type: "json" });
  if (!meta) {
    return json(409, { error: "no_upload", message: "That upload was not found. Start it again." });
  }

  const total = Number(body.chunks);
  if (!Number.isInteger(total) || total < 1 || total > 10000) {
    return json(400, { error: "bad_chunks", message: "Bad chunk count." });
  }

  const parts = [];
  for (let i = 0; i < total; i++) {
    const part = await store.get("upload/" + id + "/part/" + i, { type: "arrayBuffer" });
    if (!part) {
      // A gap means the file would be silently corrupt — refuse rather than
      // publish something that will not play.
      await discard(store, id, total);
      return json(409, {
        error: "missing_chunk",
        message: "Part " + (i + 1) + " of the upload did not arrive. Try uploading again."
      });
    }
    parts.push(Buffer.from(part));
  }

  const full = Buffer.concat(parts);
  await store.set("file/" + id, full, { metadata: { contentType: meta.contentType } });

  const item = {
    id,
    kind: meta.kind,
    contentType: meta.contentType,
    label: safeLabel(body.label || meta.label, meta.kind === "audio" ? "Track" : "Clip"),
    bytes: full.length,
    uploadedAt: new Date().toISOString(),
    // New uploads are visible by default: an owner who just uploaded something
    // expects to see it on the site, not to hunt for a second switch.
    visible: true
  };

  const items = await readIndex(store);
  items.unshift(item);
  await writeIndex(store, items);
  await discard(store, id, total);

  return json(200, { ok: true, item });
}

async function remove(store, body) {
  const id = idOf(body.id);
  if (!id) return json(400, { error: "bad_id", message: "Missing id." });

  const items = await readIndex(store);
  const next = items.filter((i) => i.id !== id);
  await writeIndex(store, next);
  // Index first, then the blob: if the second step fails the file is already
  // unreachable, which is the safer way round to be interrupted.
  try {
    await store.delete("file/" + id);
  } catch {
    /* already gone */
  }
  return json(200, { ok: true, items: next });
}

async function rename(store, body) {
  const id = idOf(body.id);
  if (!id) return json(400, { error: "bad_id", message: "Missing id." });

  const items = await readIndex(store);
  const item = items.find((i) => i.id === id);
  if (!item) return json(404, { error: "not_found", message: "That item is gone." });

  if (typeof body.label === "string") {
    item.label = safeLabel(body.label, item.label);
  }
  if (typeof body.visible === "boolean") {
    item.visible = body.visible;
  }
  await writeIndex(store, items);
  return json(200, { ok: true, items });
}

/* Ids are generated here and only ever hex, so anything else is either a bug
 * or someone probing. Rejecting the shape keeps crafted values out of blob
 * keys entirely. */
function idOf(value) {
  const s = String(value || "");
  return /^[0-9a-f]{32}$/.test(s) ? s : null;
}

async function discard(store, id, totalOrMeta) {
  const total = typeof totalOrMeta === "number" ? totalOrMeta : 64;
  for (let i = 0; i < total; i++) {
    try {
      await store.delete("upload/" + id + "/part/" + i);
    } catch {
      /* nothing there */
    }
  }
  try {
    await store.delete("upload/" + id + "/meta");
  } catch {
    /* nothing there */
  }
}

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

module.exports.UPLOAD_TTL_MS = UPLOAD_TTL_MS;
