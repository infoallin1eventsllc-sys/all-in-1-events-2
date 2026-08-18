// Dashboard — server-rendered, Meridian-branded live view of the marketing system.
// Public URL gated by a passcode stored in settings.dashboard.passcode:
//   https://<project>.supabase.co/functions/v1/dashboard?key=<passcode>
// Reads live data with the service role. Read-only (approvals happen via CLI).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // --- passcode gate ---
  const { data: cfg } = await sb.from("settings").select("value").eq("key", "dashboard").maybeSingle();
  const passcode = (cfg?.value as { passcode?: string } | null)?.passcode;
  if (!passcode || url.searchParams.get("key") !== passcode) {
    return html(page(`<div class="gate"><div class="mono">${MONO}</div>
      <h1>Meridian Dashboard</h1><p>Add <code>?key=YOUR_PASSCODE</code> to the URL to view.</p></div>`), 401);
  }

  // --- gather data ---
  const [contacts, deals, tasks, content, messages, runs, report, media] = await Promise.all([
    sb.from("contacts").select("full_name,email,source,lifecycle_stage,created_at").order("created_at", { ascending: false }).limit(8),
    sb.from("deals").select("stage,amount"),
    sb.from("tasks").select("status"),
    sb.from("content_items").select("channel,kind,title,body,image_url,status,meta,created_at").order("created_at", { ascending: false }).limit(12),
    sb.from("messages").select("channel,to_addr,subject,body,status,meta,created_at").order("created_at", { ascending: false }).limit(6),
    sb.from("agent_runs").select("status,summary,tasks_created,started_at").order("started_at", { ascending: false }).limit(5),
    sb.from("reports").select("title,body,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("media_assets").select("id"),
  ]);

  const C = contacts.data ?? [], D = deals.data ?? [], T = tasks.data ?? [], CO = content.data ?? [], M = messages.data ?? [];
  const leads = C.filter((c) => c.lifecycle_stage === "lead").length;
  const pipeline = D.filter((d) => ["new", "quoted"].includes(d.stage)).reduce((s, d) => s + Number(d.amount ?? 0), 0);
  const pendingContent = CO.filter((c) => c.status === "pending_approval").length;
  const draftMsgs = M.filter((m) => m.status === "draft").length;
  const pendingTasks = T.filter((t) => t.status === "pending").length;
  // "Live AI" only if real (non-mock) output actually exists — not merely a key present.
  const liveAI = [...CO, ...M].some((x) => (x.meta as { mocked?: boolean } | null)?.mocked === false);

  // --- KPI tiles ---
  const kpis = [
    ["Leads", leads], ["Open pipeline", "$" + pipeline.toLocaleString()],
    ["Content to approve", pendingContent], ["Emails drafted", draftMsgs], ["Tasks queued", pendingTasks],
  ].map(([label, val]) => `<div class="tile"><div class="tile-val">${esc(val)}</div><div class="tile-label">${esc(label)}</div></div>`).join("");

  // --- approval queue (content) ---
  const queue = CO.filter((c) => c.status === "pending_approval").map((c) => `
    <article class="card content-card">
      ${c.image_url ? `<div class="thumb" style="background-image:url('${esc(c.image_url)}')"></div>` : ""}
      <div class="content-body">
        <div class="row"><span class="pill">${esc(c.channel)}</span><span class="pill ghost">${esc(c.kind)}</span><span class="pill amber">awaiting approval</span></div>
        <h4>${esc(c.title ?? "Untitled")}</h4>
        <p>${esc(c.body).slice(0, 240)}</p>
      </div>
    </article>`).join("") || `<p class="empty">Nothing awaiting approval right now.</p>`;

  // --- drafted messages ---
  const msgs = M.map((m) => `
    <div class="msg">
      <div class="row"><span class="pill">${esc(m.channel)}</span><span class="pill ${m.status === "sent" ? "green" : "amber"}">${esc(m.status)}</span>
        <span class="to">→ ${esc(m.to_addr ?? "?")}</span></div>
      <strong>${esc(m.subject ?? "")}</strong>
      <p>${esc(m.body ?? "").slice(0, 180)}</p>
    </div>`).join("") || `<p class="empty">No messages yet.</p>`;

  // --- recent leads ---
  const leadRows = C.map((c) => `<tr><td>${esc(c.full_name ?? "—")}</td><td>${esc(c.email ?? "")}</td>
    <td><span class="pill ghost">${esc(c.source ?? "")}</span></td><td><span class="pill">${esc(c.lifecycle_stage)}</span></td></tr>`).join("");

  // --- agent runs ---
  const runRows = (runs.data ?? []).map((r) => `<div class="run"><span class="dot ${r.status}"></span>
    <span class="run-time">${esc(String(r.started_at).slice(5, 16).replace("T", " "))}</span>
    <span class="run-sum">${esc(r.summary ?? r.status)}</span></div>`).join("") || `<p class="empty">No runs yet.</p>`;

  const reportBlock = report.data ? `<section class="panel"><h3>Latest owner summary</h3>
    <div class="report"><strong>${esc(report.data.title)}</strong><p>${esc(report.data.body).slice(0, 600)}</p></div></section>` : "";

  return html(page(`
    <header class="top">
      <div class="brand"><div class="mono">${MONO}</div><div><div class="bname">Meridian Interface</div><div class="bsub">Marketing Dashboard</div></div></div>
      <div class="badges">
        <span class="badge ${liveAI ? "on" : "off"}">${liveAI ? "● Live AI" : "○ Demo mode"}</span>
        <span class="badge muted">${esc((media.data ?? []).length)} images</span>
      </div>
    </header>
    <div class="kpis">${kpis}</div>
    <div class="grid">
      <section class="panel span2"><h3>Approval queue <span class="count">${pendingContent}</span></h3><div class="queue">${queue}</div></section>
      <section class="panel"><h3>Drafted messages</h3>${msgs}</section>
      <section class="panel span2"><h3>Recent leads</h3>
        <table><thead><tr><th>Name</th><th>Email</th><th>Source</th><th>Stage</th></tr></thead><tbody>${leadRows}</tbody></table></section>
      <section class="panel"><h3>Agent activity</h3>${runRows}</section>
    </div>
    ${reportBlock}
    <footer class="foot">Meridian Interface · live view · refreshes on reload</footer>
  `));
});

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const MONO = `<svg width="30" height="30" viewBox="0 0 64 64" fill="none"><defs><linearGradient id="m" x1="8" y1="12" x2="56" y2="52" gradientUnits="userSpaceOnUse"><stop stop-color="#3E4C63"/><stop offset="1" stop-color="#5B6472"/></linearGradient></defs><path d="M11 52V16.5C11 13.5 14.7 12.2 16.6 14.5L32 33L47.4 14.5C49.3 12.2 53 13.5 53 16.5V52H45V27L34.8 39.2C33.4 40.9 30.6 40.9 29.2 39.2L19 27V52H11Z" fill="url(#m)"/></svg>`;

function page(inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Meridian Marketing Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@600;700;800&display=swap" rel="stylesheet"/>
<style>
:root{--paper:#F5F4EF;--card:#fff;--ink:#23262B;--soft:#5B626C;--faint:#8A8F98;--line:#E7E5DD;--slate:#3E4C63;--slate2:#5B6472;--steel:#4F6D8C;--amber:#B4791F;--green:#3E7C86;}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 500px at 12% -8%,rgba(62,76,99,.06),transparent 60%),#F5F4EF;font-family:Inter,system-ui,sans-serif;color:var(--ink);}
h1,h3,h4,.bname{font-family:Sora,system-ui,sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:22px 20px 60px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.brand{display:flex;gap:12px;align-items:center}.bname{font-weight:700;font-size:18px}.bsub{color:var(--soft);font-size:13px}
.badges{display:flex;gap:8px}.badge{font-size:12px;font-weight:600;padding:5px 11px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--soft)}
.badge.on{color:#2f7d5b;border-color:#bfe3d0;background:#eefaf3}.badge.off{color:var(--amber);border-color:#eeddba;background:#fbf5e8}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:18px}
@media(max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}}
.tile{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px}
.tile-val{font-family:Sora;font-weight:700;font-size:26px}.tile-label{color:var(--soft);font-size:12.5px;margin-top:2px}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}@media(max-width:900px){.grid{grid-template-columns:1fr}}
.span2{grid-column:span 2}@media(max-width:900px){.span2{grid-column:auto}}
.panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 18px 40px -30px rgba(35,38,43,.4)}
.panel h3{margin:0 0 12px;font-size:15px;display:flex;align-items:center;gap:8px}
.count{background:#eef1f6;color:var(--slate);border-radius:999px;font-size:12px;padding:1px 9px;font-family:Inter}
.queue{display:flex;flex-direction:column;gap:12px}
.content-card{display:flex;gap:14px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fafaf7}
.thumb{width:120px;flex:0 0 120px;background-size:cover;background-position:center;min-height:100px}
.content-body{padding:12px 14px}.content-body h4{margin:6px 0 4px;font-size:15px}.content-body p{margin:0;color:var(--soft);font-size:13.5px;line-height:1.5}
.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.pill{font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;background:#eef1f6;color:var(--slate)}
.pill.ghost{background:#fff;border:1px solid var(--line);color:var(--soft)}
.pill.amber{background:#fbf5e8;color:var(--amber)}.pill.green{background:#eefaf3;color:#2f7d5b}
.msg{border-top:1px solid var(--line);padding:11px 0}.msg:first-of-type{border-top:0}.msg strong{display:block;margin:5px 0 3px;font-size:13.5px}
.msg p{margin:0;color:var(--soft);font-size:13px}.to{color:var(--faint);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13.5px}th{text-align:left;color:var(--faint);font-weight:600;font-size:12px;padding:6px 8px}
td{padding:8px;border-top:1px solid var(--line)}
.run{display:flex;align-items:center;gap:9px;padding:7px 0;font-size:13px}
.dot{width:8px;height:8px;border-radius:999px;background:#ccc;flex:0 0 8px}.dot.success{background:#3e9c72}.dot.error{background:#c0563f}.dot.running{background:#c9a227}
.run-time{color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums}.run-sum{color:var(--soft)}
.report p{color:var(--soft);line-height:1.6;font-size:14px;white-space:pre-wrap}
.empty{color:var(--faint);font-size:13px;font-style:italic}
.foot{text-align:center;color:var(--faint);font-size:12px;margin-top:26px}
.gate{max-width:420px;margin:16vh auto;text-align:center}.gate h1{font-size:22px}.gate code{background:#eef1f6;padding:2px 6px;border-radius:6px}
.mono{display:inline-flex}
</style></head><body><div class="wrap">${inner}</div></body></html>`;
}
