import React, { useEffect, useRef, useState } from 'react';
import { UserRound, Check, Mail, LogOut, CloudUpload } from 'lucide-react';
import * as sync from '../sync/sync';
import { useOperator, ROLE_LABEL, type Role } from './operator';

/** App-bar control: who is operating, and in which role. */
export const OperatorMenu: React.FC = () => {
  const op = useOperator();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(op.name);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setName(op.name), [op.name]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const initials = op.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const tone = op.role === 'PIC' ? 'bg-ink text-surface' : op.role === 'OBSERVER' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-2';
  const save = (role: Role = op.role) => op.set({ name: name.trim() || 'Operator', role });
  // Server accounts: the company decides name and role.
  const [acct, setAcct] = useState<sync.Member | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!sync.enabled() || !sync.auth()) return;
    sync.member().then(m => {
      if (!m) return;
      setAcct(m);
      op.set({ name: m.display_name, role: m.role === 'ADMIN' ? 'PIC' : m.role });
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const locked = !!acct;
  const sendLink = async () => {
    try { await sync.requestLink(email.trim()); setNote('Check your email for the sign-in link.'); }
    catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div ref={ref} className="relative">
      <button id="operator-menu" onClick={() => setOpen(o => !o)} aria-expanded={open} title={`${op.name} · ${ROLE_LABEL[op.role]}`}
        className="inline-flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-lg border border-line text-[12px] font-medium text-ink-2 hover:text-ink">
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-semibold ${tone}`}>{initials}</span>
        <span className="hidden xl:inline">{op.role === 'PIC' ? 'Pilot' : op.role === 'OBSERVER' ? 'Observer' : 'View only'}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Operator" className="fixed left-3 right-3 top-[108px] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[300px] rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-[0_12px_40px_rgba(16,24,40,0.14)] z-50">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-ink"><UserRound className="w-4 h-4 text-ink-3" />Operator</div>
          <label className="mt-2 block text-[11px] text-ink-3">Name on the record
            <input value={name} disabled={locked} onChange={e => setName(e.target.value)} onBlur={() => save()} onKeyDown={e => { if (e.key === 'Enter') save(); }}
              className="mt-1 w-full h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink" />
          </label>
          <div className="mt-3 text-[11px] text-ink-3">Role</div>
          <ul className="mt-1 space-y-1">
            {(['PIC', 'OBSERVER', 'CLIENT'] as Role[]).map(r => (
              <li key={r}>
                <button onClick={() => save(r)} aria-pressed={op.role === r} disabled={locked && op.role !== r}
                  className={`w-full flex items-start gap-2 rounded-lg px-2 py-1.5 text-left ${op.role === r ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                  <Check className={`w-4 h-4 mt-0.5 shrink-0 ${op.role === r ? 'text-accent' : 'text-transparent'}`} />
                  <span>
                    <span className="block text-[13px] font-medium text-ink">{ROLE_LABEL[r]}</span>
                    <span className="block text-[11px] text-ink-3">{r === 'PIC' ? 'Commands the aircraft. One per flight (Part 107).' : r === 'OBSERVER' ? 'Sees everything; can only abort or bring aircraft home.' : 'Watches the operation; cannot command anything.'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-3">Every recorded event carries this name, so the record shows who gave each command.{locked ? ' Name and role come from your company account.' : ''}</p>
          {sync.enabled() && (
            <div className="mt-3 pt-3 border-t border-line">
              {sync.auth() ? (
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex items-center gap-1.5 text-ink-2 min-w-0"><CloudUpload className="w-4 h-4 text-ok shrink-0" /><span className="truncate">{sync.auth()?.email ?? 'Signed in'}{acct ? ` · ${acct.org_id}` : ''}</span></span>
                  <button onClick={() => { sync.signOut(); setAcct(null); setNote('Signed out.'); }} className="inline-flex items-center gap-1 text-ink-3 hover:text-ink"><LogOut className="w-3.5 h-3.5" />Sign out</button>
                </div>
              ) : (
                <div>
                  <div className="text-[12px] text-ink-2">Sign in so flights are kept on the company server.</div>
                  <div className="mt-1.5 flex gap-1.5">
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="flex-1 min-w-0 h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink" />
                    <button onClick={sendLink} disabled={!email.includes('@')} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-accent text-accent-ink text-[12px] font-medium disabled:opacity-40"><Mail className="w-3.5 h-3.5" />Send link</button>
                  </div>
                </div>
              )}
              {note && <div className="mt-1.5 text-[11px] text-ink-3">{note}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
