/**
 * The public view of the media library — what the landing page reads.
 *
 * Kept separate from `media.js` rather than branching inside it on whether a
 * caller is signed in. That branch is exactly where "returns everything to
 * everyone" bugs come from: one missed early return and the owner-only fields
 * ship to the public. Here there is no owner path to leak, and the response is
 * assembled field by field rather than by spreading the stored record, so a
 * field added later is private until someone deliberately adds it.
 *
 * Items the owner has hidden are filtered out, so hiding something takes it off
 * the site immediately without deleting the file.
 */

const { getStoreFor, readIndex } = require("../shared/media-store");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "GET only" }, 0);
  }

  let items = [];
  try {
    items = await readIndex(getStoreFor(event));
  } catch {
    // No store yet, or running somewhere Blobs does not exist. An empty
    // library is a normal state — the page renders its own quiet fallback.
    return json(200, { items: [], available: false }, 30);
  }

  const visible = items
    .filter((i) => i && i.visible !== false && i.id)
    .map((i) => {
      if (i.kind === "youtube") {
        // Only an id of the shape the parser issues goes out; the page
        // rebuilds the embed URL from it. A tampered index entry is dropped,
        // not forwarded.
        const playlist = i.ytKind === "playlist";
        const ok = playlist ? /^[A-Za-z0-9_-]{12,64}$/.test(i.ytId) : /^[A-Za-z0-9_-]{11}$/.test(i.ytId);
        if (!ok) return null;
        return {
          id: i.id,
          kind: "youtube",
          ytKind: playlist ? "playlist" : "video",
          ytId: i.ytId,
          label: i.label || (playlist ? "Music video playlist" : "Music video")
        };
      }
      if (i.kind !== "audio" && i.kind !== "video") return null;
      return {
        id: i.id,
        kind: i.kind,
        label: i.label || (i.kind === "audio" ? "Track" : "Clip"),
        contentType: i.contentType,
        src: "/.netlify/functions/media-file?id=" + encodeURIComponent(i.id)
      };
    })
    .filter(Boolean);

  return json(200, { items: visible, available: true }, 60);
};

function json(statusCode, body, maxAge) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Short cache: the owner should see a change within about a minute
      // without every visitor re-running the function.
      "Cache-Control": maxAge ? "public, max-age=" + maxAge : "no-store"
    },
    body: JSON.stringify(body)
  };
}
