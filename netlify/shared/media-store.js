/**
 * Storage for owner-uploaded audio and video.
 *
 * Netlify Blobs is the backing store: it ships with the platform, so there is
 * no second account to create, no keys to rotate, and nothing for the owner to
 * configure. `connectLambda` is what wires it up from a legacy-style handler
 * (`exports.handler`); without that call the store cannot find the site
 * context and every read fails at runtime rather than at deploy.
 *
 * Two platform limits drive the whole design, and neither is negotiable:
 *
 *   - A function receives at most ~6 MB per request, so a 40 MB video cannot
 *     arrive in one POST. Uploads are split browser-side and reassembled here.
 *   - A function returns at most ~6 MB per response, so a whole video cannot
 *     be sent back either. Playback relies on HTTP Range requests, which is
 *     what <video> and <audio> issue anyway.
 *
 * Everything is addressed by a generated id, never by the uploaded filename.
 * A filename is attacker-controlled text: using it as a key invites traversal
 * and collisions, and the original name is only ever shown as a label.
 */

const crypto = require("crypto");

const STORE_NAME = "420-media";
const META_KEY = "index.json";

/* Only formats a browser can actually play, and deliberately no more.
 *
 * This allowlist is a security control, not a convenience. Files here are
 * served back from our own origin, so permitting text/html or any script type
 * would let an upload run as first-party JavaScript — stored XSS on our own
 * domain. Serving additionally pins the response to the stored type with
 * `nosniff`, so a mislabelled file cannot be re-interpreted on the way out.
 */
const ALLOWED = {
  "audio/mpeg": { kind: "audio", ext: "mp3" },
  "audio/mp4": { kind: "audio", ext: "m4a" },
  "audio/aac": { kind: "audio", ext: "aac" },
  "audio/ogg": { kind: "audio", ext: "ogg" },
  "audio/wav": { kind: "audio", ext: "wav" },
  "audio/webm": { kind: "audio", ext: "weba" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" }
};

// Generous enough for a hero loop or a full track, small enough that one file
// cannot quietly consume the site's monthly bandwidth. Enforced server-side:
// the browser-side check is a courtesy to the owner, not the limit.
const MAX_BYTES = { audio: 20 * 1024 * 1024, video: 60 * 1024 * 1024 };

// 3 MB of binary becomes ~4 MB once base64-encoded, leaving headroom under the
// 6 MB request ceiling for JSON overhead and headers.
const CHUNK_BYTES = 3 * 1024 * 1024;

// Keep every response comfortably under the 6 MB ceiling, base64 growth
// included. Players ask for the next range as they need it.
const MAX_RANGE_BYTES = 3 * 1024 * 1024;

function getStoreFor(event) {
  const { connectLambda, getStore } = require("@netlify/blobs");
  // Safe to call repeatedly; it only reads this invocation's site context.
  if (event) connectLambda(event);
  return getStore(STORE_NAME);
}

function newId() {
  return crypto.randomBytes(16).toString("hex");
}

/* Uploaded names are shown to the owner but never used as a storage key or a
 * path, so this only has to stop them being a display or header hazard:
 * control characters, quotes, angle brackets and path separators go. */
function safeLabel(name, fallback) {
  const cleaned = String(name || "")
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 0x20 || code === 0x7f) return false;
      return !'\\/<>:"|?*'.includes(ch);
    })
    .join("")
    .trim();
  return cleaned.slice(0, 120) || fallback;
}

function describeType(contentType) {
  const key = String(contentType || "").toLowerCase().split(";")[0].trim();
  return ALLOWED[key] || null;
}

async function readIndex(store) {
  try {
    const raw = await store.get(META_KEY, { type: "json" });
    return Array.isArray(raw) ? raw : [];
  } catch {
    // A missing index is the normal first-run state, not an error.
    return [];
  }
}

async function writeIndex(store, items) {
  await store.setJSON(META_KEY, items);
}

/* Parse an HTTP Range header into a concrete byte window.
 *
 * Only the single `bytes=start-end` form is handled; multi-range requests are
 * legal HTTP but no media element sends them, and answering one wrongly is
 * worse than declining.
 *
 * Three outcomes, and the caller must treat them differently:
 *   null                     — no Range header, or one it cannot read
 *   { unsatisfiable: true }  — a valid header asking for bytes outside the file
 *   { start, end }           — a concrete window
 *
 * The middle case has to stay distinct from the first. Serving byte 0 to a
 * player that asked for a byte past the end looks like a successful answer to
 * a different question: the player either renders corrupt output or keeps
 * re-requesting. HTTP has 416 for exactly this, so say 416.
 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m) return null;
  const hasStart = m[1] !== "";
  const hasEnd = m[2] !== "";
  if (!hasStart && !hasEnd) return null;

  let start;
  let end;
  if (hasStart) {
    start = parseInt(m[1], 10);
    end = hasEnd ? parseInt(m[2], 10) : size - 1;
  } else {
    // Suffix form: the last N bytes.
    const suffix = parseInt(m[2], 10);
    if (suffix <= 0) return { unsatisfiable: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= size || end < start) return { unsatisfiable: true };
  end = Math.min(end, size - 1);
  // Cap the window so the response stays under the platform ceiling; the
  // player simply asks for the next window when it needs it.
  end = Math.min(end, start + MAX_RANGE_BYTES - 1);
  return { start, end };
}

module.exports = {
  ALLOWED,
  MAX_BYTES,
  CHUNK_BYTES,
  MAX_RANGE_BYTES,
  META_KEY,
  STORE_NAME,
  getStoreFor,
  newId,
  safeLabel,
  describeType,
  readIndex,
  writeIndex,
  parseRange
};
