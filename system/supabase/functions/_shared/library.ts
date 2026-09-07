// The media library — the pieces the agents are allowed to build marketing on.
//
// Otis rejected 25 of 27 text-card drafts and approved the rendered sizzle.
// The lesson: content that shows the work beats content that describes it.
// So every video and every post now starts from a library piece — a clip or
// still that came out of the motion pipeline (system/motion) and that he has
// approved — and the model's job is to choose the piece and write the words
// around it, not to invent a scene.
//
// Only approved pieces are offered. A piece is approved when
// media_assets.approved_by = 'owner', which system/motion/attach.mjs sets
// only when run with --approved (by him, on his machine).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type LibraryAsset = {
  id: string;
  kind: "image" | "video";
  url: string;
  poster_url: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  meta: Record<string, unknown>;
};

export async function loadLibrary(sb: SupabaseClient, kind?: "image" | "video"): Promise<LibraryAsset[]> {
  let q = sb.from("media_assets")
    .select("id, kind, url, poster_url, title, description, tags, meta")
    .eq("approved_by", "owner")
    .order("created_at", { ascending: false });
  // Audio rows are soundtracks for the renderer, never content pieces.
  q = kind ? q.eq("kind", kind) : q.in("kind", ["image", "video"]);
  const { data } = await q;
  return ((data ?? []) as LibraryAsset[]).filter((a) => a.url?.startsWith("http"));
}

/** The library as a prompt block: short ids the model can quote back. */
export function renderLibraryBlock(assets: LibraryAsset[]): string {
  if (!assets.length) return "## Media library\n(empty — no approved pieces yet)";
  const lines = ["## Media library (approved pieces — build on these, quote the id exactly)"];
  for (const a of assets) {
    const m = a.meta ?? {};
    const shape = [m.aspect, m.duration_s ? `${m.duration_s}s` : null].filter(Boolean).join(", ");
    lines.push(`- id=${a.id} [${a.kind}${shape ? ", " + shape : ""}] ${a.title ?? "(untitled)"}` +
      (a.description ? ` — ${a.description}` : "") +
      (a.tags?.length ? ` (tags: ${a.tags.join(", ")})` : ""));
  }
  return lines.join("\n");
}

/** Resolve the id the model returned to a real asset, or null. */
export function pickAsset(assets: LibraryAsset[], id: unknown): LibraryAsset | null {
  const s = String(id ?? "").trim();
  if (!s) return null;
  return assets.find((a) => a.id === s) ?? null;
}

/** Which aspect a channel wants; used to steer, not to forbid. */
export function preferredAspect(channel: string): string {
  return channel === "tiktok" || channel === "instagram" ? "9:16" : "16:9";
}
