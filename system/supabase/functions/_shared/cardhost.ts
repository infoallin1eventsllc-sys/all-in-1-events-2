// Turning the generated card into something Instagram will actually accept.
//
// Facebook and LinkedIn take a text post, so an embedded data: URI card is
// fine for them — it is only ever shown inside our own dashboard. Instagram is
// different in two ways that together rule the data URI out: it does not take
// image bytes at all, it fetches a URL we give it; and that URL must serve
// **JPEG**. Not PNG, not SVG.
//
// So the card is rasterised here and uploaded to a public bucket, and the
// item carries a real https JPEG URL.
//
// Every failure path returns null rather than throwing. Hosting the card is an
// enhancement to one channel; it must never be able to fail a content task
// that Facebook, LinkedIn and the approval queue would have been happy with.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { cardSvg } from "./card.ts";

/** Pinned to exact versions on purpose: a moving tag here means the renderer
    can break without anything in this repository changing. */
const RESVG_WASM = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
const FONT_BOLD = "https://unpkg.com/@expo-google-fonts/inter@0.2.3/Inter_700Bold.ttf";
const FONT_REGULAR = "https://unpkg.com/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf";

const BUCKET = "social-cards";
const JPEG_QUALITY = 82;

/** Instagram's square feed size. The card art is authored at 1080 already. */
const SIZE = 1080;

// Both the fonts and the wasm are fetched once per isolate and reused. A warm
// isolate renders in well under a second; a cold one pays about half.
let fontsOnce: Promise<Uint8Array[]> | null = null;
let wasmOnce: Promise<void> | null = null;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function loadFonts(): Promise<Uint8Array[]> {
  fontsOnce ??= Promise.all([fetchBytes(FONT_BOLD), fetchBytes(FONT_REGULAR)]);
  return fontsOnce;
}

// deno-lint-ignore no-explicit-any
function initOnce(initWasm: (src: any) => Promise<void>): Promise<void> {
  // initWasm throws if called twice on the same isolate, so the promise is
  // cached rather than the call repeated.
  wasmOnce ??= initWasm(fetch(RESVG_WASM));
  return wasmOnce;
}

/** Short, stable name for a card: the same headline always writes the same
    object instead of littering the bucket on every re-run. */
async function keyFor(title: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(title));
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type HostedCard = { url: string; bytes: number; ms: number };

/**
 * Render the branded card to JPEG and upload it. Returns null — never throws —
 * when anything in the chain is unavailable.
 */
export async function hostCard(
  sb: SupabaseClient,
  opts: { title: string; kicker?: string; tagline?: string },
): Promise<HostedCard | null> {
  const started = Date.now();
  try {
    // The rasteriser is given exactly one family and no system fonts, so the
    // SVG has to ask for that family by name rather than a browser stack.
    const svg = cardSvg({ ...opts, fontFamily: "Inter" });

    const [{ initWasm, Resvg }, fonts] = await Promise.all([
      import("npm:@resvg/resvg-wasm@2.6.2"),
      loadFonts(),
    ]);
    await initOnce(initWasm);

    const rendered = new Resvg(svg, {
      font: { fontBuffers: fonts, defaultFontFamily: "Inter", loadSystemFonts: false },
      fitTo: { mode: "width", value: SIZE },
    }).render();

    // resvg hands back straight RGBA, so the PNG step can be skipped entirely
    // and the pixels encoded as JPEG directly.
    // deno-lint-ignore no-explicit-any
    const pixels: Uint8Array | undefined = (rendered as any).pixels;
    if (!pixels) throw new Error("resvg returned no raw pixels");

    const jpeg = await import("npm:jpeg-js@0.4.4");
    const encoded = jpeg.encode(
      { data: pixels, width: rendered.width, height: rendered.height },
      JPEG_QUALITY,
    );

    const path = `cards/${await keyFor(opts.title)}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(path, encoded.data, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`upload: ${error.message}`);

    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("no public URL returned");

    return { url: data.publicUrl, bytes: encoded.data.length, ms: Date.now() - started };
  } catch (err) {
    // Logged, not raised: the caller falls back to the embedded card.
    console.error("hostCard failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
