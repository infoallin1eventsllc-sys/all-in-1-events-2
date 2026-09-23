import { recordDb, type FlightEvent, type FlightSession } from '../record/db';
import type { FlightHealth } from '../diagnostics/health';
import type { ServiceRecord } from '../analytics/aggregate';

/**
 * Server copy of the record, over Supabase (Auth + PostgREST). Off unless the
 * build sets VITE_SYNC_URL and VITE_SYNC_ANON_KEY (see server/README.md).
 *
 *   sign in      email link (magic link); the token comes back in the URL hash
 *   who am I     dc_members gives company and role (the role then comes from
 *                the server, not the device)
 *   upload       each closed flight: the session row, then only the events the
 *                server does not have yet, in recorded order, so the database's
 *                chain check (server/supabase/migrations) accepts them
 *   offline      failed uploads stay queued on the device and retry when the
 *                browser comes back online
 *
 * Plain fetch, no SDK: the whole client is this file.
 */

type Env = { VITE_SYNC_URL?: string; VITE_SYNC_ANON_KEY?: string };
const env: Env = (import.meta as unknown as { env?: Env }).env ?? {};
export const config = { url: (env.VITE_SYNC_URL ?? '').replace(/\/$/, ''), key: env.VITE_SYNC_ANON_KEY ?? '' };
export const enabled = () => !!(config.url && config.key);

const TOKEN_KEY = 'dc-sync-auth', QUEUE_KEY = 'dc-sync-queue', DONE_KEY = 'dc-sync-done';
export interface Auth { access: string; refresh: string; expiresAt: number; userId: string; email?: string }
export interface Member { org_id: string; role: 'PIC' | 'OBSERVER' | 'CLIENT' | 'ADMIN'; display_name: string }

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests replace the network. */
export function setFetch(f: typeof fetch) { fetchImpl = f; }

const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

function b64json(s: string) { try { return JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } }

export function auth(): Auth | null { return store.get<Auth | null>(TOKEN_KEY, null); }
export function signOut() { store.del(TOKEN_KEY); }

/** Email a sign-in link. The account must already be a member (admins add people). */
export async function requestLink(email: string, redirectTo = location.href.split('#')[0]) {
  const r = await fetchImpl(`${config.url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!r.ok) throw new Error(`Sign-in link refused (${r.status})`);
}

/** After clicking the email link: pick the session out of the URL hash. */
export function consumeRedirect(hash = typeof location !== 'undefined' ? location.hash : ''): Auth | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const access = p.get('access_token'), refresh = p.get('refresh_token');
  if (!access || !refresh) return null;
  const claims = b64json(access.split('.')[1] ?? '');
  const a: Auth = { access, refresh, expiresAt: Date.now() + Number(p.get('expires_in') ?? 3600) * 1000, userId: claims.sub, email: claims.email };
  store.set(TOKEN_KEY, a);
  if (typeof history !== 'undefined') history.replaceState(null, '', location.pathname + location.search);
  return a;
}

async function token(): Promise<Auth | null> {
  const a = auth(); if (!a) return null;
  if (Date.now() < a.expiresAt - 60_000) return a;
  const r = await fetchImpl(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: a.refresh }),
  });
  if (!r.ok) { signOut(); return null; }
  const j = await r.json();
  const n: Auth = { ...a, access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000 };
  store.set(TOKEN_KEY, n); return n;
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const a = await token(); if (!a) throw new Error('Not signed in');
  const r = await fetchImpl(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: config.key, Authorization: `Bearer ${a.access}`, 'Content-Type': 'application/json', ...(init.prefer ? { Prefer: init.prefer } : {}) },
  });
  if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${await r.text().catch(() => '')}`.trim());
  return r.status === 204 || r.headers.get('content-length') === '0' ? null : r.json().catch(() => null);
}

export async function member(): Promise<Member | null> {
  const a = auth(); if (!a) return null;
  const rows = await rest(`dc_members?user_id=eq.${a.userId}&select=org_id,role,display_name`) as Member[] | null;
  return rows?.[0] ?? null;
}

/** Upload one closed flight: session row, then the events the server lacks, in chain order. */
export async function pushSession(s: FlightSession, events: FlightEvent[]): Promise<number> {
  await rest('dc_sessions?on_conflict=id', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({ id: s.id, vertical: s.vertical, title: s.title, source: s.source, started_at: new Date(s.startedAt).toISOString(), ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null, aircraft: s.aircraft, note: s.note ?? null }),
  });
  const last = await rest(`dc_events?session_id=eq.${encodeURIComponent(s.id)}&select=seq&order=seq.desc&limit=1`) as { seq: number }[] | null;
  const have = last?.length ? last[0].seq + 1 : 0;
  const ordered = [...events].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  if (ordered.some(e => !e.hash)) throw new Error('Record was made before signing; it cannot be uploaded as evidence');
  const rows = ordered.slice(have).map((e, i) => ({ session_id: s.id, seq: have + i, t: e.t, severity: e.severity, kind: e.kind, text: e.text, aircraft: e.aircraft ?? null, operator: e.operator ?? null, prev: e.prev, hash: e.hash }));
  if (rows.length) await rest('dc_events', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(rows) });
  return rows.length;
}

export async function pushHealth(h: FlightHealth) {
  await rest('dc_health?on_conflict=org_id,aircraft,started_at', {
    method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
    body: JSON.stringify({ aircraft: h.aircraft, started_at: new Date(h.startedAt).toISOString(), ended_at: new Date(h.endedAt).toISOString(), airborne_s: h.airborneS, overall: h.overall, report: h }),
  });
}

export async function pushService(r: ServiceRecord) {
  await rest('dc_service', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ aircraft: r.aircraft, t: new Date(r.t).toISOString(), note: r.note, part: r.part ?? null }) });
}

// ---- queue --------------------------------------------------------------------

type Job = { kind: 'session'; id: string } | { kind: 'health'; report: FlightHealth } | { kind: 'service'; record: ServiceRecord };

export const queue = {
  list: () => store.get<Job[]>(QUEUE_KEY, []),
  add(job: Job) { if (!enabled()) return; const q = queue.list(); if (job.kind === 'session' && q.some(j => j.kind === 'session' && j.id === job.id)) return; q.push(job); store.set(QUEUE_KEY, q); void flush(); },
  done: () => new Set(store.get<string[]>(DONE_KEY, [])),
};

let running: Promise<{ sent: number; left: number }> | null = null;
/** Send what is queued; keep what fails. Returns how many jobs went and how many are left. */
export function flush(): Promise<{ sent: number; left: number }> {
  if (running) return running;
  running = (async () => {
    let sent = 0;
    if (!enabled() || !auth()) return { sent, left: queue.list().length };
    const left: Job[] = [];
    const done = queue.done();
    for (const job of queue.list()) {
      try {
        if (job.kind === 'session') {
          const s = await recordDb.getSession(job.id);
          if (!s || s.sample) continue;                      // deleted locally, or demo content: nothing to send
          await pushSession(s, await recordDb.eventsFor(s.id));
          done.add(s.id);
        } else if (job.kind === 'health') { if (!job.report.sample) await pushHealth(job.report); }
        else if (!job.record.sample) await pushService(job.record);
        sent++;
      } catch { left.push(job); }
    }
    store.set(QUEUE_KEY, left); store.set(DONE_KEY, [...done]);
    return { sent, left: left.length };
  })().finally(() => { running = null; });
  return running;
}

if (typeof window !== 'undefined') window.addEventListener('online', () => { void flush(); });
