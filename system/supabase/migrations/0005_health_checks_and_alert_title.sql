-- Two defects found by a system diagnostic, plus the checks that would have
-- caught them.

-- 1. `linkedin` and `webhook` had no department. Migration 0003 mapped an
--    explicit list of keys, which silently drops anything added to `channels`
--    between that list being written and the migration running. An orphan is
--    invisible in the department inventory, so a channel can exist and simply
--    never be shown.
update public.channels set department = 'publishing_social'
  where key in ('linkedin','webhook') and department is null;

-- 2. raise_alert refreshed severity, detail and meta on a repeat, but not
--    title — the field shown in a list, and therefore the one most people
--    read. The approval-backlog alert read "6 drafts waiting on you" while the
--    detail underneath it, correctly updated, described a larger backlog. An
--    alert that contradicts itself teaches people to distrust all of them.
create or replace function public.raise_alert(
  p_code text, p_severity text, p_title text, p_detail text,
  p_component text, p_meta jsonb default '{}'::jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.system_alerts (code, severity, title, detail, component, meta)
  values (p_code, p_severity, p_title, p_detail, p_component, p_meta)
  on conflict (code) where resolved_at is null
  do update set
    last_seen  = now(),
    seen_count = public.system_alerts.seen_count + 1,
    severity   = excluded.severity,
    title      = excluded.title,   -- was missing; see above
    detail     = excluded.detail,
    meta       = excluded.meta;
end $function$;

revoke all on function public.raise_alert(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.raise_alert(text, text, text, text, text, jsonb)
  to service_role;

-- 3. check_system_health gains two checks so neither class of problem is
--    silent again: orphaned channels (info — nothing broken, but the inventory
--    is incomplete, which is worse than obviously empty because it looks
--    finished) and an empty Brand Brain for the active brand (warning — drafts
--    silently revert to the one-line voice hint the Brand Brain replaced).
--    The full function body is applied live; see the applied migration
--    `fix_orphan_channels_and_detect_them` for the complete definition.
