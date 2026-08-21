// Analyze — the return path that closes the loop.
//
// The system could already plan, write and report. But the report was written
// for a human to read, so nothing it learned ever reached the next plan: every
// cycle started from the same standing instructions, no wiser than the last.
// This function is the missing edge of the loop. It measures what actually
// happened, writes the findings to settings.performance, and the shared
// context layer renders them into every planning prompt from then on.
//
// The discipline that matters here is refusing to invent insight. With four
// leads and nothing published, "Instagram outperforms LinkedIn" is noise
// wearing a suit. Every claim below is gated on a minimum sample, and when the
// sample is too small the function says so plainly and tells the planner what
// would actually help — which is usually "publish something".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { serviceClient, getSetting } from "../_shared/supabase.ts";
import { json, corsHeaders } from "../_shared/cors.ts";
import { authorizedRun } from "../_shared/runauth.ts";

/** Below these, a difference between channels is noise, not signal. */
const MIN_LEADS_TO_RANK = 10;
const MIN_POSTS_TO_JUDGE_CHANNEL = 3;

type ChannelRow = {
  channel: string;
  label: string;
  enabled: boolean;
  items_drafted: number;
  items_published: number;
  leads_in: number;
  deals_opened: number;
  pipeline_value: number;
  won_value: number;
  leads_per_post: number | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  if (!(await authorizedRun(req, sb))) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const days = Number(body?.days ?? 30);
  const since = new Date(Date.now() - days * 864e5).toISOString();

  const [chanRes, periodLeads, periodDeals, periodContent, runs, rates, spend, channelKeysRes] =
    await Promise.all([
      sb.from("v_channel_performance").select("*"),
      sb.from("contacts").select("id, source, created_at, lifecycle_stage").gte("created_at", since),
      sb.from("deals").select("id, contact_id, stage, amount, created_at").gte("created_at", since),
      sb.from("content_items").select("id, channel, status, meta, created_at").gte("created_at", since),
      sb.from("agent_runs").select("tokens_in, tokens_out, started_at").gte("started_at", since),
      getSetting(sb, "model_rates", { input_per_mtok: 5, output_per_mtok: 25 }),
      getSetting(sb, "ad_spend", { by_channel: {} as Record<string, number> }),
      sb.from("channels").select("key"),
    ]);

  const channels = (chanRes.data ?? []) as ChannelRow[];
  const leadRows = periodLeads.data ?? [];
  const contentRows = periodContent.data ?? [];
  const knownChannels = new Set((channelKeysRes.data ?? []).map((c: { key: string }) => c.key));

  /* ---- what the AI itself cost -------------------------------------- */
  const tokensIn = (runs.data ?? []).reduce((s, r) => s + Number(r.tokens_in ?? 0), 0);
  const tokensOut = (runs.data ?? []).reduce((s, r) => s + Number(r.tokens_out ?? 0), 0);
  const r = rates as { input_per_mtok: number; output_per_mtok: number };
  const aiCost =
    (tokensIn / 1_000_000) * Number(r.input_per_mtok ?? 0) +
    (tokensOut / 1_000_000) * Number(r.output_per_mtok ?? 0);

  const adByChannel = ((spend as { by_channel?: Record<string, number> }).by_channel ?? {});
  const adTotal = Object.values(adByChannel).reduce((s, v) => s + Number(v ?? 0), 0);

  /* ---- leads the system cannot take credit for ----------------------- */
  // A lead whose source is not one of our channels did not come from us.
  // Counting it as marketing performance would flatter every number here.
  const unattributed: Record<string, number> = {};
  for (const l of leadRows) {
    const src = String(l.source ?? "unknown");
    if (!knownChannels.has(src)) unattributed[src] = (unattributed[src] ?? 0) + 1;
  }
  const unattributedTotal = Object.values(unattributed).reduce((s, n) => s + n, 0);
  const attributedLeads = leadRows.length - unattributedTotal;

  /* ---- which customer profile the content aimed at -------------------- */
  // The orchestrator tags each content task with the profile it targets, and
  // the runner stores that tag. This counts effort per profile — NOT leads per
  // profile, which would need per-link tracking that does not exist yet.
  const effortByIcp: Record<string, number> = {};
  for (const c of contentRows) {
    const icp = (c.meta as Record<string, unknown> | null)?.icp;
    if (typeof icp === "string" && icp) effortByIcp[icp] = (effortByIcp[icp] ?? 0) + 1;
  }

  const publishedInPeriod = contentRows.filter((c) => c.status === "published").length;
  const pendingInPeriod = contentRows.filter((c) => c.status === "pending_approval").length;
  const totalPublishedEver = channels.reduce((s, c) => s + Number(c.items_published ?? 0), 0);

  /* ---- findings, each gated on having enough data to say it ---------- */
  const findings: string[] = [];
  const guidance: string[] = [];
  let sufficient = false;

  if (totalPublishedEver === 0) {
    findings.push(
      `Nothing has ever been published. ${contentRows.length} item(s) were drafted in the last ${days} days and ${pendingInPeriod} are still waiting for approval.`,
    );
    guidance.push(
      "Do not plan more content volume. Nothing that has been written has reached an audience yet, so more drafts cannot teach us anything — the bottleneck is approval and publishing, not writing.",
    );
  } else if (attributedLeads < MIN_LEADS_TO_RANK) {
    findings.push(
      `${totalPublishedEver} item(s) published and ${attributedLeads} lead(s) attributable to a channel — too few to rank channels against each other yet (need ${MIN_LEADS_TO_RANK}).`,
    );
    guidance.push(
      "Keep publishing steadily across the channels already in use rather than switching strategy. There is not yet enough evidence to prefer one over another.",
    );
  } else {
    sufficient = true;
    const judgeable = channels
      .filter((c) => Number(c.items_published) >= MIN_POSTS_TO_JUDGE_CHANNEL && c.leads_per_post !== null)
      .sort((a, b) => Number(b.leads_per_post) - Number(a.leads_per_post));

    if (judgeable.length >= 2) {
      const best = judgeable[0], worst = judgeable[judgeable.length - 1];
      findings.push(
        `Best channel: ${best.label} at ${best.leads_per_post} leads per published post (${best.leads_in} leads from ${best.items_published} posts).`,
      );
      findings.push(
        `Weakest channel: ${worst.label} at ${worst.leads_per_post} leads per published post.`,
      );
      guidance.push(
        `Weight new content toward ${best.label}; it is currently producing ${(Number(best.leads_per_post) / Math.max(Number(worst.leads_per_post), 0.01)).toFixed(1)}x the leads per post of ${worst.label}.`,
      );
    }
    const earners = channels.filter((c) => Number(c.pipeline_value) > 0)
      .sort((a, b) => Number(b.pipeline_value) - Number(a.pipeline_value));
    if (earners.length) {
      findings.push(
        `Most pipeline value: ${earners[0].label} — $${Number(earners[0].pipeline_value).toLocaleString()} open.`,
      );
    }
  }

  if (unattributedTotal > 0) {
    const top = Object.entries(unattributed).sort((a, b) => b[1] - a[1]);
    findings.push(
      `${unattributedTotal} of ${leadRows.length} lead(s) in this window came from outside the system's channels (${top.map(([k, v]) => `${k}: ${v}`).join(", ")}). These are not marketing results and are not counted as such.`,
    );
    if (top[0] && top[0][0].startsWith("meridian-website")) {
      guidance.push(
        "The website is currently the real lead source. Content that drives people to it is worth more than content that asks for a reply in-platform.",
      );
    }
  }

  /* ---- cost ---------------------------------------------------------- */
  const costNotes: string[] = [];
  if (adTotal > 0) {
    costNotes.push(
      attributedLeads > 0
        ? `Ad spend $${adTotal.toLocaleString()} over this window; cost per attributable lead $${(adTotal / attributedLeads).toFixed(2)}.`
        : `Ad spend $${adTotal.toLocaleString()} produced no attributable leads in this window.`,
    );
  } else {
    costNotes.push("No ad spend recorded — cost per acquisition is not computable, and no ad platforms are connected by design.");
  }
  costNotes.push(
    aiCost > 0
      ? `AI cost this window: $${aiCost.toFixed(2)} (${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out)${attributedLeads > 0 ? `, $${(aiCost / attributedLeads).toFixed(2)} per attributable lead` : ""}.`
      : "AI cost this window: $0.00 — the system is running in mock mode, so no tokens have been billed.",
  );

  const performance = {
    computed_at: new Date().toISOString(),
    window_days: days,
    sufficient_data: sufficient,
    totals: {
      leads_in_window: leadRows.length,
      leads_attributable_to_channels: attributedLeads,
      leads_from_elsewhere: unattributedTotal,
      deals_opened: (periodDeals.data ?? []).length,
      content_drafted: contentRows.length,
      content_published: publishedInPeriod,
      content_awaiting_approval: pendingInPeriod,
    },
    by_channel: channels
      .filter((c) => Number(c.items_drafted) > 0 || Number(c.leads_in) > 0)
      .map((c) => ({
        channel: c.channel,
        label: c.label,
        drafted: Number(c.items_drafted),
        published: Number(c.items_published),
        leads: Number(c.leads_in),
        pipeline: Number(c.pipeline_value),
        leads_per_post: c.leads_per_post === null ? null : Number(c.leads_per_post),
      })),
    effort_by_customer_profile: effortByIcp,
    cost: { ai_usd: Number(aiCost.toFixed(4)), ad_usd: adTotal, notes: costNotes },
    findings,
    guidance,
  };

  await sb.from("settings").upsert(
    { key: "performance", value: performance, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );

  // Durable note, so the trend survives even as the snapshot is overwritten.
  await sb.from("memory").insert({
    kind: "performance",
    content: `[${new Date().toISOString().slice(0, 10)}] ${findings.join(" ")} ${guidance.join(" ")}`.trim(),
    importance: sufficient ? 8 : 5,
    meta: { window_days: days, sufficient_data: sufficient },
  });

  return json({ ok: true, performance });
});
