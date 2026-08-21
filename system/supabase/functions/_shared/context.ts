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

/** What the last analyze run measured. Written by the `analyze` function. */
export interface Performance {
  computed_at?: string | null;
  window_days?: number;
  sufficient_data?: boolean;
  totals?: Record<string, number>;
  by_channel?: Array<{
    channel: string; label: string; drafted: number; published: number;
    leads: number; pipeline: number; leads_per_post: number | null;
  }>;
  effort_by_customer_profile?: Record<string, number>;
  cost?: { ai_usd?: number; ad_usd?: number; notes?: string[] };
  findings?: string[];
  guidance?: string[];
  note?: string;
}

export interface BusinessContext {
  profile: Record<string, unknown>;
  icps: IcpProfile[];
  services: ServiceSummary[];
  proof_points: string[];
  content_rules: { always: string[]; never: string[] };
  performance: Performance;
}

export async function loadBusinessContext(sb: SupabaseClient): Promise<BusinessContext> {
  const [profile, icpsRow, servicesRow, proofRow, rulesRow, perfRow] = await Promise.all([
    getSetting(sb, "business_profile", { name: "Your Business", voice: "warm, professional" }),
    getSetting<{ profiles: IcpProfile[] }>(sb, "icp_profiles", { profiles: [] }),
    getSetting<{ services: ServiceSummary[] }>(sb, "services", { services: [] }),
    getSetting<{ points: string[] }>(sb, "proof_points", { points: [] }),
    getSetting<{ always: string[]; never: string[] }>(sb, "content_rules", { always: [], never: [] }),
    getSetting<Performance>(sb, "performance", {}),
  ]);

  return {
    profile: profile as Record<string, unknown>,
    icps: icpsRow.profiles ?? [],
    services: servicesRow.services ?? [],
    proof_points: proofRow.points ?? [],
    content_rules: { always: rulesRow.always ?? [], never: rulesRow.never ?? [] },
    performance: perfRow ?? {},
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

  // The return edge of the loop. Without this section every cycle would start
  // from the same standing instructions, no wiser than the one before it.
  const perf = ctx.performance;
  if (perf?.computed_at) {
    lines.push(
      ``,
      `## What actually happened (measured ${perf.computed_at.slice(0, 10)}, last ${perf.window_days ?? 30} days)`,
    );
    const t = perf.totals ?? {};
    lines.push(
      `Drafted ${t.content_drafted ?? 0}; published ${t.content_published ?? 0}; ` +
        `awaiting approval ${t.content_awaiting_approval ?? 0}. ` +
        `Leads ${t.leads_in_window ?? 0} (${t.leads_attributable_to_channels ?? 0} from our channels, ` +
        `${t.leads_from_elsewhere ?? 0} from elsewhere).`,
    );

    if (perf.by_channel?.length) {
      lines.push(``, `Per channel:`);
      for (const c of perf.by_channel) {
        const rate = c.leads_per_post === null
          ? "no published posts yet, so no rate"
          : `${c.leads_per_post} leads per post`;
        lines.push(`- ${c.label}: ${c.drafted} drafted, ${c.published} published, ${c.leads} leads — ${rate}`);
      }
    }

    for (const note of perf.cost?.notes ?? []) lines.push(`- ${note}`);

    if (perf.findings?.length) {
      lines.push(``, `Findings:`);
      for (const f of perf.findings) lines.push(`- ${f}`);
    }

    if (perf.guidance?.length) {
      lines.push(``, `### Act on this when planning`);
      for (const g of perf.guidance) lines.push(`- ${g}`);
    }

    if (perf.sufficient_data === false) {
      lines.push(
        ``,
        `NOTE: there is not yet enough data to rank channels against each other. ` +
          `Do not claim one channel beats another, and do not overhaul strategy on this evidence.`,
      );
    }
  }

  return lines.join("\n");
}

/** Convenience: load and render in one call. */
export async function contextBlock(sb: SupabaseClient): Promise<string> {
  return renderContextBlock(await loadBusinessContext(sb));
}
