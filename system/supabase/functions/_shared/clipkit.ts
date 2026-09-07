// Clipkit — the renderer behind the sizzle Otis approved, driven by the agents.
//
// The motion pipeline authored the sizzle as a Clipkit composition (JSON) and
// rendered it; Otis approved it. This module lets the runner build videos out
// of that approved work on its own: the FULL reel - every product scene, in
// the approved order - between a hook card and the wordmark with a call to
// action. Only the words are new; the picture is the reel Otis approved
// (owner rule, Sep 7: "the content I approved is what I want on the video").
// That becomes a composition in the website's palette and type,
// submitted to Clipkit's cloud renderer, and collected into our bucket when
// done — the same submit/collect shape as _shared/video.ts, so the runner's
// collect_video task works for both.
//
// No prices on screen. The owner's rule (Sep 7): a video never shows what a
// product costs. The script's caption may; the picture may not.
//
// The product scenes live in the database (settings key "video_scenes"),
// written from the approved reel by system/motion/clipkit/export-scenes.mjs.
// Loaded at run time so a newly approved reel replaces them with one UPDATE
// and no redeploy.
//
// API (read from @clipkit/cli 1.6): POST {api}/api/v1/renders {source,
// resolution, format, bitrate} with a Bearer key → {id, credits_reserved};
// GET {api}/api/v1/renders/{id} → {status: queued|rendering|done|failed,
// progress, output_url, error}. Source JSON is capped at 2 MB; cloud renders
// spend credits (402 when out). No key → submitClipkit returns null.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadChannelConfig } from "./channels.ts";
import { getSetting } from "./supabase.ts";
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
    .replace(/\u2026/g, "...").replace(/\u00B7/g, "-").replace(/\u2022/g, "*").replace(/\u25CF/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

/** Every string in a scene tree, ASCII-normalised. The approved reel was
    authored with em dashes, middle dots and a check mark; Clipkit's cloud
    font atlas drops those glyphs silently (it is ASCII-only), so they are
    mapped here rather than trusted. Ids, URLs, colours and expressions are
    already ASCII and pass through unchanged. */
function asciiDeep(node: unknown): unknown {
  if (typeof node === "string") return ascii(node);
  if (Array.isArray(node)) return node.map(asciiDeep);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = asciiDeep(v);
    return out;
  }
  return node;
}

/** The owner's rule, enforced rather than requested: nothing on the video
    says what anything costs. The prompt already forbids it and the model
    still wrote "See what each price includes" into a call to action, so the
    two lines that reach the screen - the hook and the call to action - are
    filtered here as well. A line that mentions money or cost is replaced
    whole with the neutral fallback. The caption under the post is untouched:
    it may name a price. */
// Deliberately NOT global: a /g regex keeps lastIndex between .test() calls
// and would pass every other line through unchecked.
const MONEY = /(?:[$\u00A3\u20AC]\s?\d|\b\d[\d,.]*\s?(?:dollars|usd)\b)/i;
const COSTWORD = /\b(price|pricing|prices|priced|cost|costs|costing|quote|quoted|fee|fees|budget|cheap|cheaper|afford|affordable)\b/i;
export function noMoney(line: string, fallback: string): string {
  const t = String(line ?? "").trim();
  if (!t) return fallback;
  // A line about money is replaced whole rather than edited: stripping the
  // figure out of "A 3-7 page site: $8,500." leaves a sentence that stops
  // mid-thought, which is worse on screen than a clean line that says nothing
  // about cost.
  return MONEY.test(t) || COSTWORD.test(t) ? fallback : t;
}

type Scene = { kicker: string; headline: string; sub?: string; accent?: boolean };

type SizzleScene = {
  id: string; label: string; description: string; source_id: string;
  start: number; end: number; length: number; centered: boolean;
  group: Record<string, unknown>;
};
export type SceneSet = { fonts: unknown[]; styles: Record<string, unknown>; scenes: SizzleScene[] };

/** The approved reel's product scenes, from settings.video_scenes. Empty
    when nothing has been loaded yet - the caller decides what that means. */
export async function loadScenes(sb: SupabaseClient): Promise<SceneSet> {
  const v = await getSetting<Partial<SceneSet>>(sb, "video_scenes", {});
  return { fonts: v.fonts ?? [], styles: v.styles ?? {}, scenes: Array.isArray(v.scenes) ? v.scenes : [] };
}

/** The reel as a prompt block. The model does not choose scenes - every
    video plays the whole approved reel in this order - but it should know
    what the viewer will see so the hook and CTA fit the picture. */
export function renderSceneBlock(set: SceneSet): string {
  return ["## The product reel (every video plays ALL of these, in this order, between your hook and your call to action)",
    ...set.scenes.map((s) => `- ${s.id}: ${s.description} (${s.length}s)`)].join("\n");
}

/** What is wrong with the scene set, or null when it is fit to render.
    settings.video_scenes is data, and data can be overwritten - it was, once,
    mid-session. The empty-list check that used to stand here would pass a set
    whose scenes carried no elements, and the next thing downstream is a POST
    that spends render credits on a frame with nothing in it. So everything
    the builder actually relies on is checked: the fonts the styles name, and
    per scene an id, a usable time window, and a group with elements in it. */
export function sceneSetProblem(set: SceneSet): string | null {
  if (!set.scenes.length) return "settings.video_scenes has no scenes";
  if (!set.fonts.length) return "settings.video_scenes has no fonts";
  for (let i = 0; i < set.scenes.length; i++) {
    const s = set.scenes[i];
    const where = s?.id ? `scene "${s.id}"` : `scene ${i + 1}`;
    if (!s?.id) return `${where} has no id`;
    if (!Number.isFinite(s.start) || !Number.isFinite(s.length) || s.length <= 0) {
      return `${where} has no usable time window`;
    }
    const g = s.group as { type?: unknown; elements?: unknown } | undefined;
    if (!g || g.type !== "group") return `${where} has no group`;
    if (!Array.isArray(g.elements) || !g.elements.length) {
      return `${where} has an empty group - nothing would be drawn`;
    }
  }
  return null;
}

const CROSS = 0.3; // scenes overlap by this much, as in the sizzle
const r = (n: number) => Number(n.toFixed(3));
const SIZZLE_W = 1920, SIZZLE_H = 1080;

/** Shift a scene group by `delta` seconds. Element `time` is where the
    element starts; keyframe times are relative to the element's own start,
    so they move only for elements that start at 0 (the group itself, and
    children pinned to 0 whose keyframes therefore read as absolute). Any
    other `time` inside an element - brightness ramps, effect intensity - is
    element-relative and is left alone. Times shifted before 0 clamp to 0. */
const clamp0 = (n: number) => Math.max(0, Number(n.toFixed(3)));
function retime(node: unknown, delta: number): unknown {
  if (Array.isArray(node)) return node.map((n) => retime(n, delta));
  if (!node || typeof node !== "object") return node;
  const el = node as Record<string, unknown>;
  if (typeof el.type !== "string") return node;
  const out: Record<string, unknown> = { ...el };
  const t0 = typeof el.time === "number" ? el.time : 0;
  if (typeof el.time === "number") out.time = clamp0(el.time + delta);
  if (t0 === 0 && Array.isArray(el.keyframe_animations)) {
    out.keyframe_animations = (el.keyframe_animations as Array<{ keyframes?: Array<{ time: number }> }>).map((k) => ({
      ...k, keyframes: (k.keyframes ?? []).map((kf) => ({ ...kf, time: clamp0(kf.time + delta) })),
    }));
  }
  if (Array.isArray(el.elements)) out.elements = el.elements.map((e) => retime(e, delta));
  return out;
}

/** Place a 1920x1080 scene on the target canvas. Landscape: as is. Portrait:
    scaled to the canvas width and centred vertically, a band of product on
    the ink stage - the hook and wordmark stay full-frame. */
function placeScene(scene: SizzleScene, group: Record<string, unknown>, portrait: boolean, layer: number): Record<string, unknown> {
  const g: Record<string, unknown> = { ...group, layer };
  if (!portrait) return g;
  const kfs = (g.keyframe_animations as Array<{ property: string; keyframes: Array<{ time: number; value: number; easing?: string }> }> | undefined) ?? [];
  if (scene.centered) {
    // a card anchored at its centre: move the centre, fill most of the width,
    // scale the existing scale track
    const s = Number((1000 / Number(group.width ?? SIZZLE_W)).toFixed(4));
    g.x = 540; g.y = 960;
    const hasScale = kfs.some((k) => k.property === "scale");
    g.keyframe_animations = hasScale
      ? kfs.map((k) => k.property === "scale" ? { ...k, keyframes: k.keyframes.map((kf) => ({ ...kf, value: Number((kf.value * s).toFixed(4)) })) } : k)
      : [...kfs, { property: "scale", keyframes: [{ time: 0, value: s }] }];
  } else {
    // a full-frame scene: Clipkit scales a group about its anchor, and an
    // unanchored group pivots on its centre, so anchor it there explicitly
    // and put that centre in the middle of the canvas. (Scaling "about the
    // corner" from x=0 left the phone off the right edge - seen in preview.)
    const s = 1080 / SIZZLE_W; // 0.5625 -> a 1080x607 band mid-frame
    g.x = 540; g.y = 960; g.x_anchor = "50%"; g.y_anchor = "50%";
    g.keyframe_animations = [...kfs, { property: "scale", keyframes: [{ time: 0, value: s }] }];
  }
  return g;
}

/** A full-frame type scene in the sizzle's hero grammar: rule, kicker,
    headline, accent bar - used for the hook. */
function typeScene(id: string, layer: number, t0: number, t1: number, s: Scene, W: number, H: number, portrait: boolean): Record<string, unknown> {
  const M = portrait ? 96 : 160;
  const perLine = portrait ? 16 : 26;
  const display = portrait ? 84 : 92;
  const top = portrait ? H * 0.30 : H * 0.26;
  const lines = wrap(s.headline, perLine).split("\n");
  const size = lines.length > 3 ? display * 0.8 : display;
  return {
    id, type: "group", layer, time: 0, duration: "end", x: 0, y: 0, width: W, height: H,
    keyframe_animations: [{ property: "opacity", keyframes: [
      { time: 0, value: 0 }, { time: r(t0), value: 0 }, { time: r(t0 + 0.35), value: 1, easing: "ease-out-cubic" },
      { time: r(t1 - 0.35), value: 1 }, { time: r(t1), value: 0, easing: "ease-in-cubic" } ] }],
    elements: [
      { id: `${id}-rule`, type: "shape", layer: 1, time: t0 + 0.1, duration: "end", x: M, y: top - 4, width: 28, height: 2, fill_color: ACCENT,
        animations: [{ type: "fade-in", time: "start", duration: 0.3 }] },
      { id: `${id}-kicker`, type: "text", layer: 2, time: t0 + 0.1, duration: "end", x: M + 40, y: top - 14, width: W - 2 * M - 40, height: 24,
        text: ascii(s.kicker).toUpperCase(), style: "kicker", font_size: portrait ? 20 : 18,
        animations: [{ type: "fade-in", time: "start", duration: 0.3 }, { type: "slide-up-in", distance: 18, time: "start", duration: 0.45, easing: "ease-out-cubic" }] },
      { id: `${id}-head`, type: "text", layer: 3, time: t0 + 0.3, duration: "end", x: M, y: top + 30, width: W - 2 * M, height: lines.length * size * 1.1 + 10,
        text: lines.join("\n"), style: s.accent ? "accent" : "display", font_size: size, line_height: 1.08,
        animations: [{ type: "fade-in", time: "start", duration: 0.4 }, { type: "slide-up-in", distance: 28, time: "start", duration: 0.6, easing: "ease-out-cubic" }] },
      { id: `${id}-bar`, type: "shape", layer: 4, time: t0 + 0.8, duration: "end", x: M, y: top + 30 + lines.length * size * 1.1 + 34, width: 120, height: 4, fill_color: ACCENT, border_radius: 2,
        keyframe_animations: [{ property: "scale_x", keyframes: [{ time: t0 + 0.8, value: 0 }, { time: t0 + 1.3, value: 1, easing: "ease-out-cubic" }] }] },
    ],
  };
}

/**
 * Build the composition. The video the agents make IS the approved reel:
 * the hook as the opening card, then every product scene in the approved
 * order, then the wordmark close with the call to action. The script's
 * `scenes` field is ignored on purpose - the owner wants the whole reel,
 * never a subset. Nothing about cost. Landscape
 * (16:9) for LinkedIn and Facebook; portrait (9:16) for TikTok and Reels,
 * where the product scenes play as a band across the middle of the frame.
 */
export function buildComposition(set: SceneSet, script: VideoScript, aspect: "9:16" | "16:9", music?: string) {
  const problem = sceneSetProblem(set);
  if (problem) throw new Error(`no approved product reel to build from: ${problem}`);
  const portrait = aspect === "9:16";
  const W = portrait ? 1080 : 1920;
  const H = portrait ? 1920 : 1080;
  const picked = set.scenes; // the whole reel, in the approved order

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
  const segments: Array<[number, number]> = [];

  // 1. the hook
  const HERO = 4.6;
  const hook = noMoney(script.hook, "Software your business is not renting.");
  elements.push(typeScene("hero", 10, 0, HERO, { kicker: "Meridian Interface", headline: hook, accent: true }, W, H, portrait));
  segments.push([0, HERO]);
  let cursor = HERO - CROSS;

  // 2. the product scenes, each shifted so its own window starts at the cursor
  picked.forEach((scene, i) => {
    const delta = cursor - scene.start;
    const g = asciiDeep(retime(scene.group, delta)) as Record<string, unknown>;
    g.id = `scene-${scene.id}`;
    elements.push(placeScene(scene, g, portrait, 11 + i));
    segments.push([cursor, cursor + scene.length]);
    cursor = Number((cursor + scene.length - CROSS).toFixed(3));
  });

  // 3. wordmark close with the call to action - live text, never the raster lockup on a dark ground
  const tw = cursor;
  const total = Number((tw + 4.4).toFixed(2));
  const cta = wrap(noMoney(script.cta, "See the work at meridianinterface.com"), portrait ? 30 : 60);
  elements.push({
    id: "wordmark", type: "group", layer: 40, time: 0, duration: "end", x: 0, y: 0, width: W, height: H,
    keyframe_animations: [{ property: "opacity", keyframes: [{ time: 0, value: 0 }, { time: tw, value: 0 }, { time: tw + 0.5, value: 1, easing: "ease-out-cubic" }] }],
    elements: [
      { id: "wm-1", type: "text", layer: 1, time: tw, duration: "end", x: 0, y: H * 0.40, width: W, height: 90, text: "MERIDIAN", style: "display",
        font_size: portrait ? 72 : 88, letter_spacing: portrait ? 10 : 14, text_align: "center",
        keyframe_animations: [{ property: "scale", keyframes: [{ time: tw, value: 0.96 }, { time: r(tw + 1.2), value: 1, easing: "ease-out-cubic" }, { time: r(tw + 2.4), value: 1.02, easing: "ease-in-out-sine" }, { time: total, value: 1, easing: "ease-in-out-sine" }] }] },
      { id: "wm-2", type: "text", layer: 2, time: tw + 0.3, duration: "end", x: 0, y: H * 0.40 + (portrait ? 92 : 108), width: W, height: 40, text: "INTERFACE", style: "tracked",
        font_size: portrait ? 26 : 30, letter_spacing: portrait ? 10 : 12, text_align: "center", animations: [{ type: "fade-in", time: "start", duration: 0.5 }] },
      { id: "wm-3", type: "text", layer: 3, time: tw + 0.8, duration: "end", x: 0, y: H * 0.40 + (portrait ? 160 : 176), width: W, height: 30, text: "DIGITAL DESIGN & DEVELOPMENT STUDIO  -  HOUSTON, TEXAS", style: "kicker",
        font_size: portrait ? 14 : 15, text_align: "center", animations: [{ type: "fade-in", time: "start", duration: 0.5 }] },
      { id: "wm-cta", type: "text", layer: 4, time: tw + 1.2, duration: "end", x: W * 0.1, y: H * 0.40 + (portrait ? 260 : 260), width: W * 0.8, height: 120, text: cta, style: "body",
        font_size: portrait ? 30 : 30, line_height: 1.3, text_align: "center", animations: [{ type: "fade-in", time: "start", duration: 0.5 }, { type: "slide-up-in", distance: 16, time: "start", duration: 0.5, easing: "ease-out-cubic" }] },
    ],
  });
  segments.push([tw, total]);

  elements.push({ id: "vignette", type: "shape", layer: 95, time: 0, duration: "end", width: "100%", height: "100%", blend_mode: "multiply",
    gradient: { type: "radial", stops: [{ color: "rgba(255,255,255,1)", offset: 0 }, { color: "rgba(255,255,255,1)", offset: 0.65 }, { color: "rgba(140,150,175,1)", offset: 1 }] } });

  if (music) {
    elements.push({ id: "music", type: "audio", layer: 100, time: 0, duration: "end", source: music, loop: true, volume: 80, audio_fade_in: 0.3, audio_fade_out: 1.6 });
  }

  return {
    clipkit_version: "1.0",
    width: W, height: H, duration: total, frame_rate: 30,
    background_color: INK,
    fonts: set.fonts,
    styles: { ...set.styles, ...STYLES },
    camera: { perspective: 1600, z: segments.flatMap(([a, b]) => [
      { time: Number(a.toFixed(3)), value: 20 }, { time: Number((b - 0.3).toFixed(3)), value: 70, easing: "ease-in-out-sine" } ]) },
    elements,
    scenes: picked.map((s) => s.id),
  };
}

/* --------------------------------------------------------- submit/collect --- */

export async function submitClipkit(sb: SupabaseClient, script: VideoScript, aspect: "9:16" | "16:9"): Promise<ClipkitHandle | null> {
  const cfg = await config(sb);
  if (!cfg) return null;
  const set = await loadScenes(sb);
  const { scenes: _picked, ...source } = buildComposition(set, script, aspect, cfg.music);
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
