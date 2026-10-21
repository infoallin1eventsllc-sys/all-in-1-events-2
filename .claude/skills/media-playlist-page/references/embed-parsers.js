/* Embed-URL parsers — portable, no dependencies.
 *
 * Extracted from a working build. Each parser matches a strict pattern and
 * rebuilds the URL from the captured pieces rather than passing input through;
 * that is what makes `javascript:` schemes and lookalike hosts such as
 * open.spotify.com.evil.tld structurally impossible rather than merely
 * filtered. Every pattern is anchored — an unanchored host match is exactly
 * how a lookalike domain slips past.
 *
 * Each returns a ready-to-use embed URL, or null when the input does not match
 * exactly. Null means "show the owner a visible warning", not "fail quietly".
 *
 * Tests covering the hostile cases live alongside this file in parsers.test.js.
 */

/* Every configured value ends up in an iframe `src`. These parsers are the
 * only thing standing between a mistyped or hostile string and that attribute,
 * so each one rebuilds the URL from matched pieces rather than passing input
 * through. A value that does not match exactly is rejected, never patched up.
 */

// Spotify ids are 22 base62 characters today; the range is loose in case that
// ever changes, but the character class is not.
function parseSpotify(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const m =
    v.match(/^https:\/\/open\.spotify\.com\/(?:embed\/)?playlist\/([A-Za-z0-9]{16,32})(?:[/?#]|$)/) ||
    v.match(/^spotify:playlist:([A-Za-z0-9]{16,32})$/) ||
    v.match(/^([A-Za-z0-9]{16,32})$/);
  if (!m) return null;
  return "https://open.spotify.com/embed/playlist/" + m[1];
}

// Apple has no short id to extract — the embed is the same URL on a different
// host — so the whole path is matched and then rebuilt piece by piece.
function parseAppleMusic(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  const m = v.match(
    /^https:\/\/(?:embed\.)?music\.apple\.com\/([a-z]{2})\/playlist\/([A-Za-z0-9._~%-]{1,120})\/((?:pl\.)?[A-Za-z0-9._~%-]{1,120})(?:[?#]|$)/
  );
  if (!m) return null;
  return "https://embed.music.apple.com/" + m[1] + "/playlist/" + m[2] + "/" + m[3];
}

// youtube-nocookie.com, not youtube.com: it holds off on cookies until the
// visitor actually plays something.
function parseYouTubePlaylist(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  let id = null;
  const q = v.match(/^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/[^?#]*\?(.*)$/);
  if (q) {
    const list = new URLSearchParams(q[1]).get("list");
    if (list) id = list;
  } else if (/^[A-Za-z0-9_-]{12,64}$/.test(v)) {
    id = v;
  }
  if (!id || !/^[A-Za-z0-9_-]{12,64}$/.test(id)) return null;
  return "https://www.youtube-nocookie.com/embed/videoseries?list=" + id;
}

function parseYouTubeVideo(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  let id = null;
  let m;
  if ((m = v.match(/^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#]|$)/))) id = m[1];
  else if ((m = v.match(/^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/watch\?(.*)$/))) {
    id = new URLSearchParams(m[1]).get("v");
  } else if ((m = v.match(/^https:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})(?:[?#]|$)/))) {
    id = m[1];
  } else if (/^[A-Za-z0-9_-]{11}$/.test(v)) id = v;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return "https://www.youtube-nocookie.com/embed/" + id + "?rel=0";
}

// Local media only: a relative path, no scheme, no parent traversal. Blocks
// `javascript:` and anything pointing off-site.
function parseLocalPath(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v)) return null;
  if (v.includes("..")) return null;
  return v;
}
