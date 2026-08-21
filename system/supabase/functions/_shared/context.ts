// The shared context layer — one store, read by every agent.
//
// Before this existed, the only things the agents knew about the business were
// two fields: its name and a one-line voice note. Every post they could write
// was therefore a generic post about "web design" — competent, and identical to
// every other studio's. What was missing was not intelligence; it was context:
// who the buyer is, what the studio actually sells and for how much, what has
// really been shipped, and what must never be claimed.
//
// That context lives in the `settings` table under the keys below, so the owner
// can edit it in one place and every agent — orchestrator, runner, report —
// picks the change up on its next run, with no redeploy. This module is the one
// reader: it loads the rows and renders them into a single prompt block, so the
// agents can never drift out of sync about what the business is.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getSetting } from "./supabase.ts";

/** One ideal-customer profile: who they are, what hurts, what we say to them. */
export interface IcpProfile {
  name: string;
  who: string;
  pains: string[];
  buying_triggers: string[];
  what_we_lead_with: string;
  maps_to_service: string;
  status?: "draft" | "confirmed";
}

export interface ServiceSummary {
  title: string;
  price: string;
  is_for: string;
  outcome: string;
}

export interface BusinessContext {
  profile: Record<string, unknown>;
  icps: IcpProfile[];
  services: ServiceSummary[];
  proof_points: string[];
  content_rules: { always: string[]; never: string[] };
}

export async function loadBusinessContext(sb: SupabaseClient): Promise<BusinessContext> {
  const [profile, icpsRow, servicesRow, proofRow, rulesRow] = await Promise.all([
    getSetting(sb, "business_profile", { name: "Your Business", voice: "warm, professional" }),
    getSetting<{ profiles: IcpProfile[] }>(sb, "icp_profiles", { profiles: [] }),
    getSetting<{ services: ServiceSummary[] }>(sb, "services", { services: [] }),
    getSetting<{ points: string[] }>(sb, "proof_points", { points: [] }),
    getSetting<{ always: string[]; never: string[] }>(sb, "content_rules", { always: [], never: [] }),
  ]);

  return {
    profile: profile as Record<string, unknown>,
    icps: icpsRow.profiles ?? [],
    services: servicesRow.services ?? [],
    proof_points: proofRow.points ?? [],
    content_rules: { always: rulesRow.always ?? [], never: rulesRow.never ?? [] },
  };
}

/**
 * The context rendered as one prompt block.
 *
 * Rendered as prose-with-bullets rather than raw JSON: the agents write text
 * for humans, and feeding them structured English keeps the outputs in the
 * same register. Draft ICPs are included but labelled, so content can lean on
 * them without treating them as settled fact.
 */
export function renderContextBlock(ctx: BusinessContext): string {
  const p = ctx.profile;
  const lines: string[] = [
    `## The business`,
    `${p.name} — ${p.industry ?? "services"}. Based in ${p.location ?? "the US"}; serves ${p.service_area ?? "clients anywhere"}.`,
    `Voice: ${p.voice}.`,
  ];
  if (p.website) lines.push(`Website: ${p.website}`);

  if (ctx.icps.length) {
    lines.push(``, `## Who we are writing for`);
    for (const icp of ctx.icps) {
      const tag = icp.status === "draft" ? " (draft profile — plausible, not yet confirmed by the owner)" : "";
      lines.push(
        ``,
        `### ${icp.name}${tag}`,
        `Who: ${icp.who}`,
        `What hurts: ${icp.pains.join("; ")}`,
        `Buying triggers — the moments they start looking: ${icp.buying_triggers.join("; ")}`,
        `Lead with: ${icp.what_we_lead_with}`,
        `Usually buys: ${icp.maps_to_service}`,
      );
    }
  }

  if (ctx.services.length) {
    lines.push(``, `## What we sell (real prices — cite them plainly when useful)`);
    for (const s of ctx.services) {
      lines.push(`- **${s.title}** (${s.price}) — for ${s.is_for}. Outcome: ${s.outcome}`);
    }
  }

  if (ctx.proof_points.length) {
    lines.push(``, `## Proof we can point to (all true — never invent more)`);
    for (const pt of ctx.proof_points) lines.push(`- ${pt}`);
  }

  const r = ctx.content_rules;
  if (r.always.length || r.never.length) {
    lines.push(``, `## Writing rules`);
    for (const a of r.always) lines.push(`- ALWAYS: ${a}`);
    for (const n of r.never) lines.push(`- NEVER: ${n}`);
  }

  return lines.join("\n");
}

/** Convenience: load and render in one call. */
export async function contextBlock(sb: SupabaseClient): Promise<string> {
  return renderContextBlock(await loadBusinessContext(sb));
}
