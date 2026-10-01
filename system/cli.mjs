#!/usr/bin/env node
// Meridian Marketing System — operator CLI
// Drive the always-on marketing loop from your terminal.
//
//   node cli.mjs status                 # snapshot of CRM + queue
//   node cli.mjs lead --name "..." --email "..." --message "..."
//   node cli.mjs plan                   # run the orchestrator (Claude plans work)
//   node cli.mjs run                    # drain the task queue once
//   node cli.mjs loop                   # plan, then drain until empty
//   node cli.mjs content                # list content awaiting approval
//   node cli.mjs approve <content_id>   # approve + queue publish
//   node cli.mjs messages               # list drafted/queued messages
//   node cli.mjs send <message_id>      # queue a drafted message to send
//   node cli.mjs report                 # generate the weekly owner summary
//
// Config (env or a .env file next to this script):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
// Real AI output additionally requires ANTHROPIC_API_KEY to be set as a
// Supabase secret on the project (see system/README.md). Without it the
// system runs in mock mode.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --- tiny .env loader (no dependency) ---------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [path.join(here, ".env"), path.join(process.cwd(), ".env")]) {
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in the environment or system/.env).");
  process.exit(1);
}

const rest = (p) => `${URL}/rest/v1/${p}`;
const fn = (name) => `${URL}/functions/v1/${name}`;
const authHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function get(pathq) {
  const r = await fetch(rest(pathq), { headers: authHeaders });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function patch(pathq, body) {
  const r = await fetch(rest(pathq), { method: "PATCH", headers: { ...authHeaders, Prefer: "return=representation" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function post(pathq, body, extraHeaders = {}) {
  // extraHeaders exists for PostgREST's `Prefer: resolution=merge-duplicates`,
  // which is what turns an insert into an upsert. Without it, re-syncing the
  // brand brain would fail on the primary key rather than update in place.
  const r = await fetch(rest(pathq), { method: "POST", headers: { ...authHeaders, Prefer: "return=representation", ...extraHeaders }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function invoke(name, body = {}) {
  const r = await fetch(fn(name), { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}

// --- flag parsing ------------------------------------------------------------
function flags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) { out[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true; }
  }
  return out;
}

const bar = "─".repeat(56);
function heading(t) { console.log(`\n${t}\n${bar}`); }

// --- commands ----------------------------------------------------------------
const cmds = {
  async status() {
    const [contacts, tasks, content, runs] = await Promise.all([
      get("contacts?select=lifecycle_stage"),
      get("tasks?select=type,status"),
      get("content_items?select=status"),
      get("agent_runs?select=status,summary,tasks_created,started_at&order=started_at.desc&limit=3"),
    ]);
    heading("CRM");
    console.log(`Contacts: ${contacts.length}  ` + tally(contacts, "lifecycle_stage"));
    heading("Task queue");
    console.log(tally(tasks, "status") || "empty");
    console.log(tally(tasks, "type") || "");
    heading("Content");
    console.log(tally(content, "status") || "none");
    heading("Recent agent runs");
    for (const r of runs) console.log(`  ${r.started_at?.slice(0, 19)}  ${r.status.padEnd(7)}  +${r.tasks_created}  ${r.summary ?? ""}`);
  },

  async lead(args) {
    const f = flags(args);
    const body = { name: f.name, email: f.email, phone: f.phone, message: f.message, source: f.source || "cli" };
    const { status, json } = await invoke("intake", body);
    console.log(status === 200 ? `✓ lead captured: ${json.contact_id}` : `✗ ${status}: ${JSON.stringify(json)}`);
  },

  async plan() {
    heading("Orchestrator");
    const { json } = await invoke("orchestrator");
    if (json.mocked) console.log("(mock mode — set ANTHROPIC_API_KEY as a Supabase secret for real planning)");
    console.log(`summary: ${json.summary}`);
    console.log(`tasks created: ${json.tasks_created}`);
  },

  async run() {
    heading("Runner");
    const { json } = await invoke("runner");
    console.log(`processed: ${json.processed}`);
    for (const r of json.results ?? []) console.log(`  ${r.type.padEnd(18)} ${r.status}${r.error ? "  " + r.error : ""}`);
  },

  async loop() {
    await cmds.plan();
    // Drain the queue until nothing is left (cap iterations to be safe).
    for (let i = 0; i < 10; i++) {
      const { json } = await invoke("runner");
      if (!json.processed) break;
      heading(`Runner pass ${i + 1}`);
      for (const r of json.results ?? []) console.log(`  ${r.type.padEnd(18)} ${r.status}${r.error ? "  " + r.error : ""}`);
    }
    console.log("\nDone. Check `node cli.mjs content` and `node cli.mjs messages` for items awaiting your approval.");
  },

  async content() {
    const rows = await get("content_items?select=id,channel,kind,title,status,created_at&order=created_at.desc&limit=20");
    heading("Content");
    for (const r of rows) console.log(`  [${r.status}] ${r.kind}/${r.channel}  ${r.title ?? "(untitled)"}  ${r.id}`);
    if (!rows.length) console.log("  none yet");
  },

  async approve(args) {
    const id = args[0];
    if (!id) return console.error("usage: approve <content_id>");
    await patch(`content_items?id=eq.${id}`, { status: "approved" });
    await post("tasks", { type: "publish_content", payload: { content_item_id: id }, priority: 60 });
    console.log(`✓ approved and queued for publish: ${id}`);
  },

  async messages() {
    const rows = await get("messages?select=id,channel,status,subject,to_addr,created_at&order=created_at.desc&limit=20");
    heading("Messages");
    for (const r of rows) console.log(`  [${r.status}] ${r.channel} → ${r.to_addr ?? "?"}  ${r.subject ?? ""}  ${r.id}`);
    if (!rows.length) console.log("  none yet");
  },

  async send(args) {
    const id = args[0];
    if (!id) return console.error("usage: send <message_id>");
    const [msg] = await get(`messages?select=channel&id=eq.${id}`);
    if (!msg) return console.error("message not found");
    await patch(`messages?id=eq.${id}`, { status: "queued" });
    await post("tasks", { type: msg.channel === "sms" ? "send_sms" : "send_email", payload: { message_id: id }, priority: 40 });
    console.log(`✓ queued ${msg.channel} for send: ${id}  (run \`node cli.mjs run\` to dispatch)`);
  },


  /* Push system/brand-brain/<brand>/*.md into the brand_brain table.
   *
   * The edge functions run in Supabase and cannot read this repo, so the
   * database is the live copy and these files are only the authoring source.
   * Editing Markdown changes nothing until this runs — the single most
   * confusing thing about the setup, so it is stated in the output too. */
  async ["brand-sync"](args) {
    const root = path.join(here, "brand-brain");
    const only = args.find((a) => !a.startsWith("-"));
    const DOCS = ["voice-guide", "positioning", "messaging-bank", "tone-rules"];

    if (!fs.existsSync(root)) return console.error(`no brand-brain/ at ${root}`);

    const brands = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name)
      .filter((b) => !only || b === only);

    if (!brands.length) return console.error(only ? `no brand "${only}"` : "no brands found");

    heading("Brand sync");
    for (const brand of brands) {
      for (const doc of DOCS) {
        const file = path.join(root, brand, `${doc}.md`);
        if (!fs.existsSync(file)) { console.log(`  –  ${brand}/${doc}  (no file)`); continue; }
        const content = fs.readFileSync(file, "utf8").trim();
        if (!content) { console.log(`  –  ${brand}/${doc}  (empty)`); continue; }
        // Upsert on the composite key so re-running is safe and idempotent.
        // updated_at is sent explicitly — there is no trigger on this table, so
        // an upsert that only changed `content` would keep a stale timestamp.
        await post("brand_brain?on_conflict=brand,doc",
                   { brand, doc, content, updated_at: new Date().toISOString() },
                   { Prefer: "resolution=merge-duplicates,return=minimal" });
        console.log(`  ✓  ${brand}/${doc}  ${content.length} chars`);
      }
    }
    const [profile] = await get("settings?select=value&key=eq.business_profile");
    const active = profile?.value?.brand ?? "(none set)";
    console.log(`\nActive brand: ${active}`);
    console.log("Drafts use this from the next run — nothing to redeploy.");
  },

  /* Show what the agent is actually writing from right now. Reads the database,
   * not the files, because that is what the functions see. */
  async brand() {
    const [profile] = await get("settings?select=value&key=eq.business_profile");
    const active = profile?.value?.brand ?? "";
    heading("Brand brain (live, from the database)");
    if (!active) {
      console.log("No active brand set on settings.business_profile.brand.");
      console.log("Drafts fall back to the old one-line voice hint.");
      return;
    }
    const rows = await get(`brand_brain?select=doc,content,updated_at&brand=eq.${encodeURIComponent(active)}`);
    console.log(`Active brand: ${active}`);
    if (!rows.length) {
      console.log("Nothing synced yet — run `node cli.mjs brand-sync`.");
      return;
    }
    for (const r of rows) {
      const first = (r.content || "").split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "";
      console.log(`\n  ${r.doc}  (${r.content.length} chars, updated ${String(r.updated_at).slice(0, 10)})`);
      console.log(`    ${first.slice(0, 90)}`);
    }
  },

  /* The department inventory: what each part of the operation is covered by,
   * and what a gap would cost to close. */
  async departments() {
    const [depts, channels] = await Promise.all([
      get("departments?select=key,label,purpose&order=sort_order"),
      get("channels?select=key,label,department,status,cost_note"),
    ]);
    heading("Departments");
    for (const d of depts) {
      const mine = channels.filter((c) => c.department === d.key);
      const live = mine.filter((c) => c.status === "live").length;
      console.log(`\n${d.label}  —  ${live}/${mine.length} live`);
      console.log(`  ${d.purpose}`);
      for (const c of mine) {
        const mark = c.status === "live" ? "✓" : "·";
        const cost = c.cost_note ? `  [${c.cost_note}]` : "";
        console.log(`   ${mark} ${c.label}${cost}`);
      }
    }
    const orphan = channels.filter((c) => !c.department);
    if (orphan.length) console.log(`\nUnassigned: ${orphan.map((c) => c.key).join(", ")}`);
  },

  async report() {
    heading("Weekly owner summary");
    const { json } = await invoke("report");
    const [rep] = await get(`reports?select=title,body&id=eq.${json.report_id}`);
    console.log(rep?.title ?? "");
    console.log("");
    console.log(rep?.body ?? JSON.stringify(json, null, 2));
  },
};

function tally(rows, key) {
  const c = {};
  for (const r of rows) { const k = r[key] ?? "?"; c[k] = (c[k] ?? 0) + 1; }
  return Object.entries(c).map(([k, v]) => `${k}:${v}`).join("  ");
}

// --- dispatch ----------------------------------------------------------------
const [, , cmd, ...rest_args] = process.argv;
if (!cmd || !cmds[cmd]) {
  console.log("Commands: status | lead | plan | run | loop | content | approve | messages | send | report");
  console.log("          brand | brand-sync [brand] | departments");
  process.exit(cmd ? 1 : 0);
}
cmds[cmd](rest_args).catch((e) => { console.error("Error:", e.message); process.exit(1); });
