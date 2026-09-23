import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { recorder } from '../record/recorder';

/**
 * Who is at the controls.
 *
 * Part 107 puts one person in command. The console knows three roles:
 *   PIC       remote pilot in command: may command the aircraft
 *   OBSERVER  visual observer / crew: sees everything, may only hit Abort
 *   CLIENT    the client or venue watching: view only
 * The operator is stamped on every recorded event, so the record says who
 * gave each command. With the server configured (docs/COMPLETION.md) the name
 * comes from a signed-in account; on its own, the console keeps it per device.
 */

export type Role = 'PIC' | 'OBSERVER' | 'CLIENT';
export const ROLE_LABEL: Record<Role, string> = { PIC: 'Pilot in command', OBSERVER: 'Visual observer', CLIENT: 'Client (view only)' };

export interface Operator { name: string; role: Role }

interface Api extends Operator {
  set: (o: Operator) => void;
  /** May send commands to the aircraft (or the simulation). */
  canCommand: boolean;
  /** May abort: pilot or observer. */
  canAbort: boolean;
}

const KEY = 'drone-command-operator';
const Ctx = createContext<Api | null>(null);

export const OperatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [op, setOp] = useState<Operator>(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v?.name && v?.role) return v; } catch { /* first run */ }
    return { name: 'Demo pilot', role: 'PIC' };
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(op)); } catch { /* private mode */ }
    recorder.setOperator(`${op.name} · ${ROLE_LABEL[op.role].toLowerCase()}`);
  }, [op]);
  const api = useMemo<Api>(() => ({ ...op, set: setOp, canCommand: op.role === 'PIC', canAbort: op.role !== 'CLIENT' }), [op]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

/** Safe outside the provider (tests, isolated renders): acts as a pilot in command. */
export function useOperator(): Api {
  return useContext(Ctx) ?? { name: 'Pilot', role: 'PIC', set: () => {}, canCommand: true, canAbort: true };
}
