// Loads the Brand Brain and composes it into a system prompt.
//
// What this replaces: every draft used to be steered by one interpolated
// string — `Voice: ${profile.voice}` — which for the seeded profile was
// "warm, professional, upscale". Three adjectives that describe half the
// businesses in the country, so the drafts read like they came from any of
// them. These four documents are specific enough that output is recognisable
// as one brand rather than as marketing.

import type { SupabaseClient } from "./supabase.ts";

export type BrandDoc = "voice-guide" | "positioning" | "messaging-bank" | "tone-rules";

// Deliberate order. A language model weights the end of a system prompt most
// heavily, so the rules that must never be broken go last: positioning gives
// context, voice shapes the prose, the bank supplies known-good phrasing, and
// the hard rules get the final word. Reordering this weakens the rules.
const DOC_ORDER: BrandDoc[] = ["positioning", "voice-guide", "messaging-bank", "tone-rules"];

const HEADINGS: Record<BrandDoc, string> = {
  positioning: "WHO WE ARE",
  "voice-guide": "HOW WE SOUND",
  "messaging-bank": "APPROVED LINES — prefer these over inventing new ones",
  "tone-rules": "HARD RULES — never override these, for any brief or channel",
};

// Long enough to matter, short enough to leave room for the task. Documents are
// prose written by a person; if one grows past this it has become a manual
// rather than a brief and should be trimmed at the source.
const MAX_DOC_CHARS = 6000;

export interface BrandBrain {
  brand: string;
  /** Ready to concatenate into a system prompt. Empty when nothing is set up. */
  block: string;
  /** Which documents actually had content — useful for reporting a gap. */
  present: BrandDoc[];
}

/**
 * Read the active brand's documents and build the prompt block.
 *
 * Returns an empty block rather than throwing when the table is missing or
 * unpopulated. That matters: this system is designed to run end to end before
 * anything is configured, and a missing brand brain should degrade the writing,
 * never break the pipeline.
 */
export async function loadBrandBrain(
  sb: SupabaseClient,
  brand: string,
): Promise<BrandBrain> {
  if (!brand) return { brand: "", block: "", present: [] };

  let rows: Array<{ doc: string; content: string }> = [];
  try {
    const { data, error } = await sb
      .from("brand_brain")
      .select("doc, content")
      .eq("brand", brand);
    if (error) throw error;
    rows = data ?? [];
  } catch {
    // Table not migrated yet, or unreachable. Fall through to the old
    // one-line voice hint rather than failing the run.
    return { brand, block: "", present: [] };
  }

  const byDoc = new Map<string, string>();
  for (const r of rows) {
    const text = (r.content ?? "").trim();
    if (text) byDoc.set(r.doc, text.slice(0, MAX_DOC_CHARS));
  }

  const present: BrandDoc[] = [];
  const parts: string[] = [];
  for (const doc of DOC_ORDER) {
    const content = byDoc.get(doc);
    if (!content) continue;
    present.push(doc);
    parts.push(`## ${HEADINGS[doc]}\n\n${content}`);
  }

  if (!parts.length) return { brand, block: "", present: [] };

  return {
    brand,
    block: `# BRAND BRIEF — ${brand}\n\n${parts.join("\n\n")}`,
    present,
  };
}

/**
 * Compose a task instruction with the brand brief in front of it.
 *
 * The task goes last on purpose. The brief is context that should colour
 * everything; the instruction is what to do right now, and it reads more
 * reliably when it is the final thing said.
 *
 * `fallbackVoice` keeps the old behaviour alive for a brand with no documents
 * yet — worse output, but working output.
 */
export function withBrand(brain: BrandBrain, task: string, fallbackVoice?: string): string {
  if (!brain.block) {
    return fallbackVoice ? `Voice: ${fallbackVoice}.\n\n${task}` : task;
  }
  return `${brain.block}\n\n---\n\n${task}`;
}
