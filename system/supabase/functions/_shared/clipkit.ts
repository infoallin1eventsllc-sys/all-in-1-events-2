// Clipkit — the renderer behind the sizzle Otis approved, driven by the agents.
//
// The motion pipeline authored the sizzle as a Clipkit composition (JSON) and
// rendered it. This module lets the runner do the same on its own: a script
// (hook, three beats, price line, call to action) becomes a composition in
// the website's palette and type, submitted to Clipkit's cloud renderer, and
// collected into our bucket when done — the same submit/collect shape as
// _shared/video.ts, so the runner's collect_video task works for both.
//
// API (read from @clipkit/cli 1.6): POST {api}/api/v1/renders {source,
// resolution, format, bitrate} with a Bearer key → {id, credits_reserved};
// GET {api}/api/v1/renders/{id} → {status: queued|rendering|done|failed,
// progress, output_url, error}. Source JSON is capped at 2 MB; cloud renders
// spend credits (402 when out). No key → submitClipkit returns null.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadChannelConfig } from "./channels.ts";
import type { VideoScript, CollectResult } from "./video.ts";

const API = "https://clipkit.dev";
const BUCKET = "social-videos";

export type ClipkitHandle = { provider: "clipkit"; render_id: string };

type Cfg = { key: string; music?: string };

async function config(sb: SupabaseClient): Promise<Cfg | null> {
  const cfg = await loadChannelConfig(sb);
  const key = (Deno.env.get("CLIPKIT_API_KEY") ?? cfg.clipkit_api_key ?? "").trim();
  if (!key) return null;
  const music = (Deno.env.get("CLIPKIT_MUSIC_URL") ?? cfg.clipkit_music_url ?? "").trim() || undefined;
  return { key, music };
}

export async function clipkitConfigured(sb: SupabaseClient): Promise<boolean> {
  return (await config(sb)) !== null;
}

/* ------------------------------------------------------------ the look --- */

// The website's own palette and type — the same tokens the sizzle used.
const INK = "#0F172A";
const INK2 = "#0B1226";
const ACCENT = "#2563EB";
const GRID = "#93C5FD";
const MUTED = "#CBD5E1";

const FONTS = [
  { family: "Hanken Grotesk", weight: 800, style: "normal", src: "https://fonts.gstatic.com/s/hankengrotesk/v12/ieVq2YZDLWuGJpnzaiwFXS9tYvBRzyFLlZg_f_NcM2Fq5vBM.woff2" },
  { family: "Inter", weight: 500, style: "normal", src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hiA.woff2" },
  { family: "Inter", weight: 700, style: "normal", src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiA.woff2" },
];

const STYLES = {
  display: { fill_color: "#FFFFFF", font_family: "Hanken Grotesk, Inter, sans-serif", font_weight: 800 },
  accent: { fill_color: ACCENT, font_family: "Hanken Grotesk, Inter, sans-serif", font_weight: 800 },
  kicker: { fill_color: ACCENT, font_family: "Inter, sans-serif", font_weight: 700, letter_spacing: 4 },
  body: { fill_color: MUTED, font_family: "Inter, sans-serif", font_weight: 500 },
  tracked: { fill_color: MUTED, font_family: "Inter, sans-serif", font_weight: 500, letter_spacing: 6 },
};

/** Greedy wrap to a character budget — Clipkit sets text on explicit lines. */
function wrap(text: string, perLine: number): string {
  // The runtime's font atlas is ASCII-only: dashes, curly quotes and the
  // like are dropped silently, so they are normalised here first.
  const words = ascii(text).trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > perLine && cur) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

function ascii(t: string): string {
  return t.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...").replace(/\u00B7/g, "-").replace(/[^\x20-\x7E\n]/g, "");
}

type Scene = { kicker: string; headline: string; sub?: string; accent?: boolean };

/**
 * Build the composition. Portrait (9:16) for TikTok and Reels, landscape
 * (16:9) for LinkedIn and Facebook. Six scenes, each a group whose opacity
 * track fades it in and out; the kicker rises first, the headline follows,
 * the short rule draws under it; a slow camera push per scene; the wordmark
 * closes with the studio line. Same grammar as the approved sizzle.
 */
export function buildComposition(script: VideoScript, aspect: "9:16" | "16:9", music?: string) {
  const portrait = aspect === "9:16";
  const W = portrait ? 1080 : 1920;
  const H = portrait ? 1920 : 1080;
  const M = portrait ? 96 : 160; // margin
  const perLine = portrait ? 16 : 26;
  const display = portrait ? 84 : 92;
  const SCENE = 4.2;
  const scenes: Scene[] = [
    { kicker: "Meridian Interface", headline: script.hook, accent: true },
    ...script.beats.slice(0, 3).map((b, i) => ({ kicker: `${i + 1} of 3`, headline: b })),
    { kicker: "What it costs", headline: script.price_line, accent: true },
    { kicker: "Next step", headline: script.cta },
  ];
  const total = scenes.length * SCENE + 3.2; // + wordmark

  const elements: Record<string, unknown>[] = [
    { id: "bg", type: "shape", layer: 1, time: 0, duration: "end", width: "100%", height: "100%", z: -200,
      gradient: { type: "linear", angle: 160, stops: [{ color: INK, offset: 0 }, { color: INK2, offset: 1 }] } },
    { id: "gridv", type: "shape", layer: 2, time: 0, duration: "end", x: { expr: "i*80" }, y: 0, z: -150, width: 1, height: H,
      repeat: Math.ceil(W / 80), opacity: 0.05, fill_color: GRID },
    { id: "gridh", type: "shape", layer: 3, time: 0, duration: "end", x: 0, y: { expr: "i*80" }, z: -150, width: W, height: 1,
      repeat: Math.ceil(H / 80), opacity: 0.05, fill_color: GRID },
    { id: "glow", type: "shape", layer: 4, time: 0, duration: "end", x: W * 0.55, y: H * 0.45, width: W * 0.9, height: W * 0.9, z: -180,
      x_anchor: "50%", y_anchor: "50%", opacity: 0.35,
      gradient: { type: "radial", stops: [{ color: "rgba(37,99,235,0.55)", offset: 0 }, { color: "rgba(37,99,235,0)", offset: 0.7 }] } },
  ];

  scenes.forEach((s, i) => {
    const t0 = i * SCENE;
    const t1 = t0 + SCENE;
    const top = portrait ? H * 0.30 : H * 0.26;
    const lines = wrap(s.headline, perLine).split("\n");
    const size = lines.length > 3 ? display * 0.8 : display;
    elements.push({
      id: `s${i}`, type: "group", layer: 10 + i, time: 0, duration: "end", x: 0, y: 0, width: W, height: H,
      keyframe_animations: [{ property: "opacity", keyframes: [
        { time: 0, value: 0 }, { time: t0, value: 0 }, { time: t0 + 0.35, value: 1, easing: "ease-out-cubic" },
        { time: t1 - 0.35, value: 1 }, { time: t1, value: 0, easing: "ease-in-cubic" } ] }],
      elements: [
        { id: `s${i}-rule`, type: "shape", layer: 1, time: t0 + 0.1, duration: "end", x: M, y: top - 4, width: 28, height: 2, fill_color: ACCENT,
          animations: [{ type: "fade-in", time: "start", duration: 0.3 }] },
        { id: `s${i}-kicker`, type: "text", layer: 2, time: t0 + 0.1, duration: "end", x: M + 40, y: top - 14, width: W - 2 * M - 40, height: 24,
          text: ascii(s.kicker).toUpperCase(), style: "kicker", font_size: portrait ? 20 : 18,
          animations: [{ type: "fade-in", time: "start", duration: 0.3 }, { type: "slide-up-in", distance: 18, time: "start", duration: 0.45, easing: "ease-out-cubic" }] },
        { id: `s${i}-head`, type: "text", layer: 3, time: t0 + 0.3, duration: "end", x: M, y: top + 30, width: W - 2 * M, height: lines.length * size * 1.1 + 10,
          text: lines.join("\n"), style: s.accent ? "accent" : "display", font_size: size, line_height: 1.08,
          animations: [{ type: "fade-in", time: "start", duration: 0.4 }, { type: "slide-up-in", distance: 28, time: "start", duration: 0.6, easing: "ease-out-cubic" }] },
        { id: `s${i}-bar`, type: "shape", layer: 4, time: t0 + 0.8, duration: "end", x: M, y: top + 30 + lines.length * size * 1.1 + 34, width: 120, height: 4, fill_color: ACCENT, border_radius: 2,
          keyframe_animations: [{ property: "scale_x", keyframes: [{ time: t0 + 0.8, value: 0 }, { time: t0 + 1.3, value: 1, easing: "ease-out-cubic" }] }] },
      ],
    });
  });

  // Wordmark close — live text, never the raster lockup on a dark ground.
  const tw = scenes.length * SCENE;
  elements.push({
    id: "wordmark", type: "group", layer: 40, time: 0, duration: "end", x: 0, y: 0, width: W, height: H,
    keyframe_animations: [{ property: "opacity", keyframes: [{ time: 0, value: 0 }, { time: tw, value: 0 }, { time: tw + 0.5, value: 1, easing: "ease-out-cubic" }] }],
    elements: [
      { id: "wm-1", type: "text", layer: 1, time: tw, duration: "end", x: 0, y: H * 0.44, width: W, height: 90, text: "MERIDIAN", style: "display",
        font_size: portrait ? 72 : 88, letter_spacing: portrait ? 10 : 14, text_align: "center",
        keyframe_animations: [{ property: "scale", keyframes: [{ time: tw, value: 0.96 }, { time: tw + 1.2, value: 1, easing: "ease-out-cubic" }, { time: tw + 2.4, value: 1.02, easing: "ease-in-out-sine" }, { time: total, value: 1, easing: "ease-in-out-sine" }] }] },
      { id: "wm-2", type: "text", layer: 2, time: tw + 0.3, duration: "end", x: 0, y: H * 0.44 + (portrait ? 92 : 108), width: W, height: 40, text: "INTERFACE", style: "tracked",
        font_size: portrait ? 26 : 30, letter_spacing: portrait ? 10 : 12, text_align: "center", animations: [{ type: "fade-in", time: "start", duration: 0.5 }] },
      { id: "wm-3", type: "text", layer: 3, time: tw + 0.8, duration: "end", x: 0, y: H * 0.44 + (portrait ? 160 : 176), width: W, height: 30, text: "DIGITAL DESIGN & DEVELOPMENT STUDIO  -  HOUSTON, TEXAS", style: "kicker",
        font_size: portrait ? 14 : 15, text_align: "center", animations: [{ type: "fade-in", time: "start", duration: 0.5 }] },
    ],
  });

  elements.push({ id: "vignette", type: "shape", layer: 95, time: 0, duration: "end", width: "100%", height: "100%", blend_mode: "multiply",
    gradient: { type: "radial", stops: [{ color: "rgba(255,255,255,1)", offset: 0 }, { color: "rgba(255,255,255,1)", offset: 0.65 }, { color: "rgba(140,150,175,1)", offset: 1 }] } });

  if (music) {
    elements.push({ id: "music", type: "audio", layer: 100, time: 0, duration: "end", source: music, loop: true, volume: 80, audio_fade_in: 0.3, audio_fade_out: 1.6 });
  }

  return {
    clipkit_version: "1.0",
    width: W, height: H, duration: Number(total.toFixed(2)), frame_rate: 30,
    background_color: INK,
    fonts: FONTS,
    styles: STYLES,
    camera: { perspective: 1600, z: scenes.flatMap((_, i) => [
      { time: i * SCENE, value: 20 }, { time: (i + 1) * SCENE - 0.3, value: 70, easing: "ease-in-out-sine" } ]) },
    elements,
  };
}

/* --------------------------------------------------------- submit/collect --- */

export async function submitClipkit(sb: SupabaseClient, script: VideoScript, aspect: "9:16" | "16:9"): Promise<ClipkitHandle | null> {
  const cfg = await config(sb);
  if (!cfg) return null;
  const source = buildComposition(script, aspect, cfg.music);
  const res = await fetch(`${API}/api/v1/renders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ source, resolution: "1080p" }),
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 402) throw new Error(`clipkit: out of render credits${j.upgrade_url ? ` (${API}${j.upgrade_url})` : ""}`);
  if (!res.ok || !j?.id) throw new Error(`clipkit render refused: ${res.status} ${JSON.stringify(j).slice(0, 300)}`);
  return { provider: "clipkit", render_id: String(j.id) };
}

export async function collectClipkit(sb: SupabaseClient, handle: ClipkitHandle, key: string): Promise<CollectResult> {
  const cfg = await config(sb);
  if (!cfg) return { state: "failed", error: "clipkit key was removed before this render finished" };
  const res = await fetch(`${API}/api/v1/renders/${handle.render_id}`, { headers: { authorization: `Bearer ${cfg.key}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { state: "failed", error: `clipkit status ${res.status}: ${JSON.stringify(j).slice(0, 200)}` };
  if (j.status === "failed") return { state: "failed", error: String(j.error ?? "render failed").slice(0, 300) };
  if (j.status !== "done" || !j.output_url) return { state: "rendering" };

  const r = await fetch(String(j.output_url));
  if (!r.ok) return { state: "failed", error: `${r.status} fetching rendered file` };
  const mp4 = new Uint8Array(await r.arrayBuffer());
  const path = `clips/${key}.mp4`;
  const up = await sb.storage.from(BUCKET).upload(path, mp4, { contentType: "video/mp4", upsert: true, cacheControl: "31536000" });
  if (up.error) return { state: "failed", error: `upload: ${up.error.message}` };
  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  // Clipkit returns no poster frame; the caller keeps the card it already has.
  return { state: "ready", url, poster: null, bytes: mp4.length };
}
