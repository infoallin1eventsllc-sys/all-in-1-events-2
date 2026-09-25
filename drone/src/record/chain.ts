/**
 * Tamper-evident record: every event is chained to the one before it.
 *
 *   hash[i] = SHA-256( hash[i-1] | session | t | severity | kind | text | aircraft | operator )
 *
 * Changing, deleting or reordering any entry after the flight breaks every hash
 * from that point on, so the Records screen can say "verified" or name the first
 * entry that no longer matches. It is evidence, not secrecy: anyone can recompute
 * the chain, which is the point (an insurer or investigator can check it).
 * Accounts and a server copy (see docs) stop someone deleting the whole record.
 */

export interface Chainable { id?: number; sessionId: string; t: number; severity: string; kind: string; text: string; aircraft?: string; operator?: string; prev?: string; hash?: string }

export const GENESIS = '0'.repeat(64);

const enc = new TextEncoder();
async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

const payload = (e: Chainable, prev: string) =>
  [prev, e.sessionId, e.t, e.severity, e.kind, e.text, e.aircraft ?? '', e.operator ?? ''].join('|');

/** Stamp `events` in order, continuing from `prev`. Returns the new chain head. */
export async function stamp(events: Chainable[], prev = GENESIS): Promise<string> {
  let head = prev;
  for (const e of events) { e.prev = head; e.hash = await sha256(payload(e, head)); head = e.hash; }
  return head;
}

export interface ChainCheck { status: 'VERIFIED' | 'BROKEN' | 'UNSIGNED'; checked: number; brokenAt?: number }

/** Recompute the chain over a session's events in recorded order. */
export async function verify(events: Chainable[]): Promise<ChainCheck> {
  const signed = events.filter(e => e.hash);
  if (signed.length === 0) return { status: 'UNSIGNED', checked: 0 };
  // Recorded order is storage order (auto-increment id), not display order by time.
  const ordered = [...events].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  let head = GENESIS;
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i];
    if (!e.hash || e.prev !== head || (await sha256(payload(e, head))) !== e.hash) return { status: 'BROKEN', checked: i, brokenAt: i };
    head = e.hash;
  }
  return { status: 'VERIFIED', checked: ordered.length };
}
