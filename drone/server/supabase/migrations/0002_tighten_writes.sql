-- Drone Command: tighter writes (applies on top of 0001).
--
--   * who uploaded a row is the signed-in account, not whatever the client sends:
--     the insert policies now check uploaded_by / logged_by = auth.uid()
--   * a session row, once uploaded, can only be closed: crew may change ended_at
--     and note, nothing else (not its id, title, time, org, uploader or chain head;
--     chain_head moves only through the security-definer dc_events_head trigger)
--
-- Supabase grants anon and authenticated ALL on new public tables by default, so
-- revoke table-wide UPDATE/DELETE explicitly before granting the two columns.
-- The console closes a session with insert-if-absent + PATCH (src/sync/sync.ts),
-- which needs only these column grants.

drop policy if exists dc_sessions_write on public.dc_sessions;
create policy dc_sessions_write on public.dc_sessions for insert
  with check (org_id = public.dc_org() and uploaded_by = auth.uid() and public.dc_role() in ('PIC', 'OBSERVER', 'ADMIN'));

drop policy if exists dc_health_write on public.dc_health;
create policy dc_health_write on public.dc_health for insert
  with check (org_id = public.dc_org() and uploaded_by = auth.uid() and public.dc_role() in ('PIC', 'OBSERVER', 'ADMIN'));

drop policy if exists dc_service_write on public.dc_service;
create policy dc_service_write on public.dc_service for insert
  with check (org_id = public.dc_org() and logged_by = auth.uid() and public.dc_role() in ('PIC', 'OBSERVER', 'ADMIN'));

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke update, delete, truncate on public.dc_sessions, public.dc_events, public.dc_health, public.dc_service, public.dc_members from %I', r);
    end if;
  end loop;
end $$;

grant update (ended_at, note) on public.dc_sessions to authenticated;
