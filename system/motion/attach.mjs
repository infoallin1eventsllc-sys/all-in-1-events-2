#!/usr/bin/env node
// attach.mjs — put a finished piece of motion work into the marketing stack.
//
//   node system/motion/attach.mjs <file> --slug meridian-sizzle --kind video \
//        --title "Meridian Interface sizzle" --description "..." \
//        --tags sizzle,website,app,dashboard,crm --aspect 16:9 --duration 47 \
//        [--poster poster.jpg] [--approved]
//
// What it does, in order:
//   1. uploads the file to the social-videos bucket as library/<slug>.<ext>
//      (and the poster as library/<slug>-poster.jpg — extracted with ffmpeg
//      at 1 s when --poster is not given and ffmpeg is on the PATH);
//   2. upserts the media_assets row the agents choose from;
//   3. flips any content_items waiting on this file
//      (meta.video.state = "awaiting_file" with a matching expected_url)
//      to state "ready", so an item Otis already approved becomes publishable
//      the moment the file lands.
//
// --approved stamps media_assets.approved_by = 'owner'. Only Otis runs this
// on his machine, and only approved pieces are offered to the agents, so the
// flag is his approval of the piece itself — the same rule as content.
//
// Config: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the environment or
// system/.env (same as cli.mjs). Needs Node 18+.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [path.join(here, "..", ".env"), path.join(process.cwd(), ".env")]) {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (environment or system/.env).");
  process.exit(1);
}

// --- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
const opt = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);
if (!file || !fs.existsSync(file)) {
  console.error("usage: attach.mjs <file> --slug <slug> [--kind video|image] [--title ..] [--description ..] [--tags a,b] [--aspect 16:9] [--duration 47] [--poster file] [--approved]");
  process.exit(1);
}
const ext = path.extname(file).toLowerCase().replace(".", "");
const MIME = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const type = MIME[ext];
if (!type) { console.error(`unsupported file type .${ext}`); process.exit(1); }
const kind = opt("kind", type.startsWith("video") ? "video" : "image");
const slug = (opt("slug") ?? path.basename(file, path.extname(file))).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
const title = opt("title", slug);
const description = opt("description", "");
const tags = (opt("tags", "") || "").split(",").map((t) => t.trim()).filter(Boolean);
const aspect = opt("aspect", null);
const duration = opt("duration", null);
const approved = flag("approved");

// --- helpers ---------------------------------------------------------------
const BUCKET = "social-videos";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function upload(objectPath, bytes, contentType) {
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: { ...H, "Content-Type": contentType, "x-upsert": "true", "cache-control": "31536000" },
    body: bytes,
  });
  if (!r.ok) throw new Error(`upload ${objectPath}: ${r.status} ${await r.text()}`);
  return `${URL_}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}
async function rest(method, pathq, body, prefer = "return=representation") {
  const r = await fetch(`${URL_}/rest/v1/${pathq}`, {
    method, headers: { ...H, "Content-Type": "application/json", Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${pathq}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

// --- 1. upload -------------------------------------------------------------
const bytes = fs.readFileSync(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const objectPath = `library/${slug}.${ext === "jpeg" ? "jpg" : ext}`;
console.log(`uploading ${file} (${(bytes.length / 1048576).toFixed(1)} MB) → ${objectPath}`);
const url = await upload(objectPath, bytes, type);

let posterUrl = null;
if (kind === "video") {
  let posterFile = opt("poster", null);
  if (!posterFile) {
    try {
      posterFile = path.join(path.dirname(file), `${slug}-poster.jpg`);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "1", "-i", file, "-frames:v", "1", "-q:v", "3", posterFile]);
    } catch {
      posterFile = null;
      console.log("no ffmpeg on PATH — skipping the poster frame (pass --poster to supply one)");
    }
  }
  if (posterFile && fs.existsSync(posterFile)) {
    posterUrl = await upload(`library/${slug}-poster.jpg`, fs.readFileSync(posterFile), "image/jpeg");
    console.log(`poster → ${posterUrl}`);
  }
}

// --- 2. library row --------------------------------------------------------
const meta = {
  slug, bytes: bytes.length, sha256, content_type: type, source: "system/motion",
  ...(aspect ? { aspect } : {}), ...(duration ? { duration_s: Number(duration) } : {}),
  attached_at: new Date().toISOString(),
};
const existing = await rest("GET", `media_assets?url=eq.${encodeURIComponent(url)}&select=id`);
const row = { url, kind, title, description, tags, poster_url: posterUrl, meta, ...(approved ? { approved_by: "owner" } : {}) };
const saved = existing.length
  ? await rest("PATCH", `media_assets?id=eq.${existing[0].id}`, row)
  : await rest("POST", "media_assets", row);
const asset = Array.isArray(saved) ? saved[0] : saved;
console.log(`library: ${asset.id} (${kind}${approved ? ", approved" : ", not yet approved — add --approved when it is"})`);

// --- 3. items waiting on this file -----------------------------------------
const waiting = await rest("GET",
  `content_items?meta->video->>state=eq.awaiting_file&meta->video->>expected_url=eq.${encodeURIComponent(url)}&select=id,meta,channel`);
for (const item of waiting) {
  const video = { ...(item.meta.video ?? {}), state: "ready", url, poster: posterUrl, source: "library", asset_id: asset.id };
  await rest("PATCH", `content_items?id=eq.${item.id}`, {
    image_url: posterUrl ?? item.image_url ?? null,
    meta: { ...item.meta, video, asset_id: asset.id, image_source: posterUrl ? "video_poster" : item.meta.image_source },
  }, "return=minimal");
  console.log(`content item ${item.id} (${item.channel}) → video ready`);
}
console.log(`done. ${url}`);
