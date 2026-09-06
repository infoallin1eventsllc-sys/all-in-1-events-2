// media — brings a finished piece of marketing media into the system's own
// storage and the media library, server-side.
//
// Why this exists: the motion pipeline (system/motion) renders clips and
// stills wherever a browser and ffmpeg live — a laptop, a remote session —
// and those places cannot always reach Supabase storage directly. What they
// can usually do is put the file somewhere with a fetchable URL (a monday.com
// asset, a Drive share, any signed URL). This function fetches that URL from
// inside the platform, writes the bytes into the `social-videos` bucket
// (`library/<slug>.<ext>`), and records the piece in `media_assets` so the
// agents can choose it. Signed URLs expire; the bucket copy does not.
//
// Auth: same gate as the runner — the run secret (what public.invoke_edge()
// sends) or a service-role JWT (the operator CLI). Never the anon key alone:
// this writes to the library the agents draw from.
//
// Actions:
//   ingest  { url, slug, kind: "image"|"video", title, description, tags[],
//             poster_url?, meta?, approved_by?: "owner", content_type? }
//           → { ok, asset_id, url, poster_url, bytes, sha256 }
//   list    → { ok, assets: [...] }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { authorizedRun } from "../_shared/runauth.ts";

const BUCKET = "social-videos";
const MAX_BYTES = 200 * 1024 * 1024;

const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchInto(sb: ReturnType<typeof serviceClient>, url: string, path: string, declared?: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} fetching ${url.slice(0, 80)}`);
  const type = (declared ?? r.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
  const ext = EXT[type];
  if (!ext) throw new Error(`unsupported content type ${type}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length === 0) throw new Error("fetched an empty file");
  if (bytes.length > MAX_BYTES) throw new Error(`file is ${bytes.length} bytes; limit is ${MAX_BYTES}`);
  const full = `${path}.${ext}`;
  const up = await sb.storage.from(BUCKET).upload(full, bytes, { contentType: type, upsert: true, cacheControl: "31536000" });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  return {
    url: sb.storage.from(BUCKET).getPublicUrl(full).data.publicUrl,
    bytes: bytes.length,
    sha256: await sha256(bytes),
    type,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const sb = serviceClient();
  if (!(await authorizedRun(req, sb))) return json({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }
  const action = String(body.action ?? "ingest");

  if (action === "list") {
    const { data, error } = await sb.from("media_assets")
      .select("id, kind, url, poster_url, title, description, tags, meta, approved_by, created_at")
      .order("created_at", { ascending: false });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, assets: data ?? [] });
  }

  if (action !== "ingest") return json({ ok: false, error: `unknown action ${action}` }, 400);

  const url = String(body.url ?? "").trim();
  const slug = String(body.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  const kind = body.kind === "video" ? "video" : "image";
  const title = String(body.title ?? slug).slice(0, 200);
  const description = String(body.description ?? "").slice(0, 2000);
  const tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 30) : [];
  const meta = (body.meta && typeof body.meta === "object") ? body.meta as Record<string, unknown> : {};
  const approvedBy = body.approved_by === "owner" ? "owner" : null;
  if (!/^https:\/\//.test(url)) return json({ ok: false, error: "url must be https" }, 400);
  if (!slug) return json({ ok: false, error: "slug required" }, 400);

  try {
    const file = await fetchInto(sb, url, `library/${slug}`, body.content_type ? String(body.content_type) : undefined);

    let posterUrl: string | null = null;
    const posterSrc = String(body.poster_url ?? "").trim();
    if (/^https:\/\//.test(posterSrc)) {
      try {
        posterUrl = (await fetchInto(sb, posterSrc, `library/${slug}-poster`)).url;
      } catch (err) {
        // A missing poster is cosmetic. Record why so it is not a mystery.
        meta.poster_error = err instanceof Error ? err.message : String(err);
      }
    }

    // One row per slug: re-ingesting a piece replaces it rather than
    // duplicating it in the list the agents choose from.
    const row = {
      url: file.url, kind, title, description, tags,
      poster_url: posterUrl,
      meta: { ...meta, bytes: file.bytes, sha256: file.sha256, content_type: file.type, slug, ingested_at: new Date().toISOString() },
      approved_by: approvedBy,
    };
    const { data: existing } = await sb.from("media_assets").select("id").eq("url", file.url).maybeSingle();
    const res = existing
      ? await sb.from("media_assets").update(row).eq("id", existing.id).select("id").single()
      : await sb.from("media_assets").insert(row).select("id").single();
    if (res.error) throw new Error(res.error.message);

    return json({ ok: true, asset_id: res.data.id, url: file.url, poster_url: posterUrl, bytes: file.bytes, sha256: file.sha256 });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
