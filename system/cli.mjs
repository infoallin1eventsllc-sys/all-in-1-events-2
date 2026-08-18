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
async function post(pathq, body) {
  const r = await fetch(rest(pathq), { method: "POST", headers: { ...authHeaders, Prefer: "return=representation" }, body: JSON.stringify(body) });
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
  process.exit(cmd ? 1 : 0);
}
cmds[cmd](rest_args).catch((e) => { console.error("Error:", e.message); process.exit(1); });
