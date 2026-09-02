// Short-form video: a script becomes a 20-second vertical branded clip.
//
// The system already writes captions and renders a still card. TikTok takes
// only video, and Reels is where Instagram's reach is, so a caption is not a
// post there. This turns the same on-brand copy into motion: five scenes of
// large type on the Meridian ivory ground — hook, three beats, price and call
// to action — rendered by Shotstack from a JSON timeline and kept in our own
// storage as an MP4 with a poster frame.
//
// Rendering is asynchronous on their side (20–90 seconds), and an edge
// function should not sit in a polling loop for that long. So this module is
// two calls: `submitRender` returns a render id at once, and `collectRender`
// asks whether it is done. The runner turns those into a task and a follow-up
// task, which is what the task queue is for.
//
// No key → `submitRender` returns null and nothing here throws. The script is
// still written and still lands in the approval queue, marked as not rendered,
// so the owner sees exactly what the video would have said.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadChannelConfig } from "./channels.ts";

export type VideoScript = {
  hook: string; // one line, under ~50 characters, stops the scroll
  beats: string[]; // three lines that make the case
  price_line: string; // the real price and what it buys
  cta: string; // where to go
  caption: string; // the post text under the video
  hashtags: string[];
};

export type RenderHandle = { provider: "shotstack"; render_id: string; env: string };

export type CollectResult =
  | { state: "rendering" }
  | { state: "failed"; error: string }
  | { state: "ready"; url: string; poster: string | null; bytes: number };

const BUCKET = "social-videos";
const WIDTH = 1080;
const HEIGHT = 1920;
const SCENE_SECONDS = 4;

// Same face the image cards use, so a still and a clip from the same system
// look like the same system.
const FONT_BOLD = "https://unpkg.com/@expo-google-fonts/inter@0.2.3/Inter_700Bold.ttf";
const FONT_REGULAR = "https://unpkg.com/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf";

const BRAND = {
  paper: "#F5F4EF",
  ink: "#23262B",
  slate: "#3E4C63",
  steel: "#4F6D8C",
  soft: "#5B626C",
};

type ShotstackCfg = { key: string; env: "stage" | "v1"; music?: string };

async function shotstackConfig(sb: SupabaseClient): Promise<ShotstackCfg | null> {
  const cfg = await loadChannelConfig(sb);
  const key = (Deno.env.get("SHOTSTACK_API_KEY") ?? cfg.shotstack_api_key ?? "").trim();
  if (!key) return null;
  const env = (Deno.env.get("SHOTSTACK_ENV") ?? cfg.shotstack_env ?? "v1").trim() === "stage" ? "stage" : "v1";
  const music = (Deno.env.get("VIDEO_MUSIC_URL") ?? cfg.video_music_url ?? "").trim() || undefined;
  return { key, env, music };
}

export async function videoConfigured(sb: SupabaseClient): Promise<boolean> {
  return (await shotstackConfig(sb)) !== null;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** One scene: a kicker line, a headline, and the brand sign-off. */
function scene(kicker: string, headline: string, opts: { accent?: boolean } = {}) {
  const size = headline.length > 60 ? 72 : headline.length > 36 ? 88 : 104;
  const html =
    `<div class="s">` +
    (kicker ? `<p class="k">${esc(kicker)}</p>` : "") +
    `<p class="h">${esc(headline)}</p>` +
    `<div class="bar"></div>` +
    `</div>`;
  const css =
    `.s{width:${WIDTH - 160}px;font-family:Inter;color:${BRAND.ink};text-align:left}` +
    `.k{font-size:34px;font-weight:700;letter-spacing:4px;color:${opts.accent ? BRAND.steel : BRAND.soft};margin:0 0 28px 0;text-transform:uppercase}` +
    `.h{font-size:${size}px;font-weight:700;line-height:1.08;letter-spacing:-2px;margin:0}` +
    `.bar{width:120px;height:10px;border-radius:5px;background:${BRAND.slate};margin-top:44px}`;
  return { html, css };
}

/**
 * The Shotstack timeline for a script. Five scenes, four seconds each, a
 * fade between them, the studio name pinned at the bottom throughout.
 */
function buildTimeline(script: VideoScript, music?: string) {
  const scenes = [
    scene("", script.hook, { accent: true }),
    ...script.beats.slice(0, 3).map((b, i) => scene(`${i + 1} of 3`, b)),
    scene("What it costs", script.price_line, { accent: true }),
    scene("Next step", script.cta),
  ];
  const clips = scenes.map((s, i) => ({
    asset: { type: "html", html: s.html, css: s.css, width: WIDTH - 160, height: 900, background: "transparent", position: "center" },
    start: i * SCENE_SECONDS,
    length: SCENE_SECONDS,
    position: "center",
    transition: { in: "fade", out: "fade" },
  }));
  const total = scenes.length * SCENE_SECONDS;

  const footer = {
    asset: {
      type: "html",
      html: `<p class="b">Meridian Interface</p><p class="t">Websites · Apps · Marketing Systems</p>`,
      css: `.b{font-family:Inter;font-weight:700;font-size:38px;color:${BRAND.ink};margin:0;letter-spacing:.5px}` +
        `.t{font-family:Inter;font-size:30px;color:${BRAND.soft};margin:10px 0 0 0}`,
      width: WIDTH - 160,
      height: 140,
      background: "transparent",
      position: "bottomLeft",
    },
    start: 0,
    length: total,
    position: "bottomLeft",
    offset: { x: 0.074, y: 0.06 },
  };

  return {
    timeline: {
      background: BRAND.paper,
      fonts: [{ src: FONT_BOLD }, { src: FONT_REGULAR }],
      ...(music ? { soundtrack: { src: music, effect: "fadeOut", volume: 0.6 } } : {}),
      tracks: [{ clips }, { clips: [footer] }],
    },
    output: {
      format: "mp4",
      fps: 30,
      size: { width: WIDTH, height: HEIGHT },
      poster: { capture: 1 },
    },
  };
}

/** Ask Shotstack to render. Null when not configured; throws on a real refusal. */
export async function submitRender(sb: SupabaseClient, script: VideoScript): Promise<RenderHandle | null> {
  const cfg = await shotstackConfig(sb);
  if (!cfg) return null;

  const res = await fetch(`https://api.shotstack.io/edit/${cfg.env}/render`, {
    method: "POST",
    headers: { "x-api-key": cfg.key, "content-type": "application/json" },
    body: JSON.stringify(buildTimeline(script, cfg.music)),
  });
  const j = await res.json().catch(() => ({}));
  const id = j?.response?.id;
  if (!res.ok || !id) {
    throw new Error(`shotstack render refused: ${res.status} ${String(j?.message ?? j?.response?.message ?? "").slice(0, 300)}`);
  }
  return { provider: "shotstack", render_id: String(id), env: cfg.env };
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} fetching rendered file`);
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * Is it done? When it is, the MP4 and poster are copied into our bucket —
 * Shotstack's URLs expire, and a post scheduled for next week must not point
 * at a file that is gone.
 */
export async function collectRender(sb: SupabaseClient, handle: RenderHandle, key: string): Promise<CollectResult> {
  const cfg = await shotstackConfig(sb);
  if (!cfg) return { state: "failed", error: "video rendering was switched off before this render finished" };

  const res = await fetch(`https://api.shotstack.io/edit/${handle.env}/render/${handle.render_id}`, {
    headers: { "x-api-key": cfg.key },
  });
  const j = await res.json().catch(() => ({}));
  const r = j?.response ?? {};
  if (!res.ok) return { state: "failed", error: `shotstack status ${res.status}: ${String(j?.message ?? "").slice(0, 200)}` };

  const status = String(r.status ?? "");
  if (status === "failed") return { state: "failed", error: String(r.error ?? "render failed").slice(0, 300) };
  if (status !== "done" || !r.url) return { state: "rendering" };

  const mp4 = await fetchBytes(String(r.url));
  const path = `clips/${key}.mp4`;
  const up = await sb.storage.from(BUCKET).upload(path, mp4, {
    contentType: "video/mp4", upsert: true, cacheControl: "31536000",
  });
  if (up.error) return { state: "failed", error: `upload: ${up.error.message}` };
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  let poster: string | null = null;
  if (r.poster) {
    try {
      const jpg = await fetchBytes(String(r.poster));
      const ppath = `clips/${key}.jpg`;
      const pu = await sb.storage.from(BUCKET).upload(ppath, jpg, {
        contentType: "image/jpeg", upsert: true, cacheControl: "31536000",
      });
      if (!pu.error) poster = sb.storage.from(BUCKET).getPublicUrl(ppath).data.publicUrl;
    } catch { /* a missing poster is cosmetic; the clip is what matters */ }
  }

  return { state: "ready", url, poster, bytes: mp4.length };
}

/** Stable object name for a script, so a re-run overwrites rather than litters. */
export async function videoKey(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest)).slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parse the model's script reply; null when it is not one. */
export function parseScript(text: string): VideoScript | null {
  try {
    const j = JSON.parse(text.replace(/```(?:json)?|```/g, "").trim());
    const beats = Array.isArray(j.beats) ? j.beats.map(String).filter(Boolean).slice(0, 3) : [];
    if (!j.hook || beats.length < 3 || !j.price_line || !j.cta) return null;
    return {
      hook: String(j.hook).trim(),
      beats,
      price_line: String(j.price_line).trim(),
      cta: String(j.cta).trim(),
      caption: String(j.caption ?? "").trim(),
      hashtags: Array.isArray(j.hashtags) ? j.hashtags.map(String).slice(0, 8) : [],
    };
  } catch {
    return null;
  }
}
