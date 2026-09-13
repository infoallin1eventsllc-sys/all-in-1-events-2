/**
 * Serve one uploaded audio or video file.
 *
 * A function can return at most ~6 MB, so a 40 MB video can never be sent in
 * one response. This answers HTTP Range requests instead, which is what
 * <video> and <audio> issue natively: the player asks for the window it needs,
 * plays it, and asks for the next. Seeking works for the same reason.
 *
 * Every response is 206 Partial Content with an explicit `Content-Range`, even
 * when the player did not send a Range header — a browser opening a media
 * element sends `Range: bytes=0-` and then follows the `Content-Range` total
 * to request the rest. Replying 200 with a truncated body would instead look
 * like a complete, corrupt file.
 *
 * The Content-Type comes from the stored allowlisted type and is sent with
 * `nosniff`. That pairing is what stops an uploaded file being re-interpreted
 * as HTML or script and running as first-party code on this origin.
 */

const { getStoreFor, describeType, readIndex, parseRange } = require("../shared/media-store");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") {
    return text(405, "GET only");
  }

  const id = String((event.queryStringParameters || {}).id || "");
  // Ids are generated as hex here, so anything else is a probe. Checking the
  // shape keeps crafted values out of the blob key entirely.
  if (!/^[0-9a-f]{32}$/.test(id)) return text(400, "Bad id");

  let store;
  try {
    store = getStoreFor(event);
  } catch {
    return text(503, "Media storage unavailable");
  }

  // The index is the authority on what is public. Reading it means a hidden or
  // deleted item cannot still be fetched by anyone holding its id.
  const items = await readIndex(store);
  const item = items.find((i) => i && i.id === id);
  if (!item || item.visible === false) return text(404, "Not found");

  const desc = describeType(item.contentType);
  if (!desc) return text(415, "Unsupported type");

  let buf;
  try {
    const raw = await store.get("file/" + id, { type: "arrayBuffer" });
    if (!raw) return text(404, "Not found");
    buf = Buffer.from(raw);
  } catch {
    return text(404, "Not found");
  }

  const size = buf.length;
  const range = parseRange(event.headers && (event.headers.range || event.headers.Range), size);

  // A readable Range asking for bytes this file does not have gets 416 with
  // the true size, so the player can correct itself. Answering 206 from byte 0
  // would look like success and produce corrupt playback or a request loop.
  if (range && range.unsatisfiable) {
    return {
      statusCode: 416,
      headers: {
        "Content-Range": "bytes */" + size,
        "Accept-Ranges": "bytes",
        "Content-Type": "text/plain",
        "Cache-Control": "no-store"
      },
      body: "Range not satisfiable"
    };
  }

  const start = range ? range.start : 0;
  // No Range header still gets a capped window, for the reason above.
  const end = range ? range.end : Math.min(size - 1, capFrom(0, size));

  const slice = buf.subarray(start, end + 1);

  return {
    statusCode: 206,
    headers: {
      "Content-Type": item.contentType,
      "Content-Length": String(slice.length),
      "Content-Range": "bytes " + start + "-" + end + "/" + size,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      // Uploads are immutable — a change produces a new id — so this can be
      // cached hard. It is the difference between the function running once
      // per visitor and once per seek.
      "Cache-Control": "public, max-age=31536000, immutable"
    },
    body: slice.toString("base64"),
    isBase64Encoded: true
  };
};

function capFrom(start, size) {
  const { MAX_RANGE_BYTES } = require("../shared/media-store");
  return Math.min(size - 1, start + MAX_RANGE_BYTES - 1);
}

function text(statusCode, message) {
  return {
    statusCode,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    body: message
  };
}
