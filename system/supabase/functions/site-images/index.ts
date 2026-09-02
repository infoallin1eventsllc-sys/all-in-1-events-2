// Owner-managed site images — the part that makes a swap actually publish.
//
// Photo Control in the owner portal let Otis replace any portfolio or hero
// image and told him "the live site now shows it." It did not. Overrides were
// written to localStorage, so the change existed in exactly one browser: not on
// his phone, not for a single visitor, and not after clearing site data. The
// message was the worst of it — a swap that silently applies to nobody is
// discovered at the moment it matters, in front of a client.
//
// This is a separate function rather than three more actions on `owner`
// because the read has to be public — every visitor needs it on page load —
// while `owner` is a money-adjacent surface where everything past the auth gate
// requires a session. Different audiences, different function.
//
// verify_jwt = false: the browser calls this without a Supabase session. The
// read is deliberately open; both writes require the owner token that `owner`
// issues after a passcode login, verified here through the shared module.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { ownerTokenValid, tokenFrom } from "../_shared/ownertoken.ts";

const SETTINGS_KEY = "image_overrides";
const BUCKET = "site-images";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_URL = 2048;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

type Overrides = Record<string, string>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const sb = serviceClient();
  const action = String(body.action ?? "");

  const readOverrides = async (): Promise<Overrides> => {
    const { data } = await sb.from("settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    return (data?.value as Overrides) ?? {};
  };

  /* ------------------------------------------------------------- public --- */

  // Read by the public site on load. Unauthenticated on purpose: these are the
  // images every visitor is about to be shown, so there is nothing to protect.
  // Keeping it open is precisely what makes an override publish.
  if (action === "list") {
    return json({ ok: true, overrides: await readOverrides() });
  }

  /* -------------------------------------------------------------- owner --- */

  if (!(await ownerTokenValid(tokenFrom(req, body)))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  switch (action) {
    case "set": {
      // Set one override, or clear it with an empty url — which is how the
      // portal reverts an image to the one shipped in the bundle.
      const id = String(body.id ?? "").trim();
      const url = String(body.url ?? "").trim();
      if (!id) return json({ ok: false, error: "id required" }, 400);

      // http(s) only. A data: URL here would be written into the settings row
      // and then downloaded by every visitor on every page load — a portal
      // convenience turning into an outage.
      if (url) {
        if (url.length > MAX_URL) return json({ ok: false, error: "that URL is too long" }, 400);
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return json({ ok: false, error: "that is not a valid URL" }, 400);
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return json({ ok: false, error: "image URLs must start with http:// or https://" }, 400);
        }
      }

      const overrides = { ...(await readOverrides()) };
      if (url) overrides[id] = url;
      else delete overrides[id];

      const { error } = await sb.from("settings")
        .upsert({ key: SETTINGS_KEY, value: overrides }, { onConflict: "key" });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, overrides });
    }

    case "upload": {
      // A file from the portal becomes an object in a public bucket and the
      // override stores its CDN URL. The bytes never enter the settings row,
      // which the whole public site downloads.
      const id = String(body.id ?? "").trim();
      const contentType = String(body.content_type ?? "").trim().toLowerCase();
      if (!id) return json({ ok: false, error: "id required" }, 400);
      if (!EXT[contentType]) {
        return json({
          ok: false,
          error: `unsupported image type${contentType ? `: ${contentType}` : ""} — use PNG, JPEG, WebP, AVIF or GIF`,
        }, 400);
      }

      let bytes: Uint8Array;
      try {
        const bin = atob(String(body.data ?? ""));
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      } catch {
        return json({ ok: false, error: "could not decode that file" }, 400);
      }
      if (bytes.byteLength === 0) return json({ ok: false, error: "that file is empty" }, 400);
      if (bytes.byteLength > MAX_BYTES) {
        return json({ ok: false, error: "that image is over 8 MB — resize it first" }, 400);
      }

      // A fresh path per upload rather than a stable one, so a replacement is
      // never served stale from a CDN that already cached the previous bytes.
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "image";
      const path = `${safeId}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${EXT[contentType]}`;

      const { error: upErr } = await sb.storage.from(BUCKET)
        .upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
      if (upErr) return json({ ok: false, error: `upload failed: ${upErr.message}` }, 500);

      const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
      const overrides = { ...(await readOverrides()), [id]: pub.publicUrl };

      const { error } = await sb.from("settings")
        .upsert({ key: SETTINGS_KEY, value: overrides }, { onConflict: "key" });
      if (error) return json({ ok: false, error: error.message }, 500);

      return json({ ok: true, url: pub.publicUrl, overrides });
    }

    default:
      return json({ ok: false, error: `unknown action: ${action}` }, 400);
  }
});
