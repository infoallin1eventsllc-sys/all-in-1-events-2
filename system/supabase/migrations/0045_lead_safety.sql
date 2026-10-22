-- Lead safety: a daily ceiling on AI follow-ups, and marketing email as a real
-- opt-in. From the 22 Oct security review, items A and F.
--
-- A. Every new email address on the booking form queued a follow_up_lead task,
--    and every one of those is a Claude call. intake caps callers per address
--    per hour, but an address is cheap to change, so fake bookings could run
--    the Anthropic bill up with no ceiling. The cap lives here, on the tasks
--    table, rather than in intake, because the orchestrator queues the same
--    task for any lead without one: a cap in intake alone would be undone on
--    the next planning run. Past the cap the task is not created (the lead is
--    still saved, and the owner can reply by hand) and System Health says so.
--    Tunable without a deploy:
--      update settings set value = value || '{"followups_per_day": 40}'
--       where key = 'intake_limits';
--
-- F. A booking set consent_email = true for anyone who typed an address. That
--    is not consent, and the marketing gate read consent_email = false as
--    "unsubscribed", so the two meanings were one column. They are split:
--      * email_opted_out_at  - set by the unsubscribe link. Blocks every
--                              non-transactional email, replies included.
--      * consent_email       - a recorded opt-in. Needed for marketing that
--                              is not a reply to the person's own enquiry.
--    A reply to their own enquiry (lead_follow_up, saved_list_reply) needs no
--    opt-in: they asked. It still carries the unsubscribe link and postal
--    address, and it still stops the moment they unsubscribe.
--
-- The five existing contacts all got consent_email = true from the old
-- default; none ever ticked anything. They are reset to false, and what they
-- had is kept in meta.consent_email_reset so this can be undone row by row.

-- ---------------------------------------------------------------- F ------
alter table public.contacts add column if not exists email_opted_out_at timestamptz;

comment on column public.contacts.email_opted_out_at is
  'When this contact used the unsubscribe link. Set: no marketing email of any kind, replies to their enquiry included. Transactional mail (booking confirmation, invoice, receipt) is unaffected.';
comment on column public.contacts.consent_email is
  'A recorded opt-in to marketing email. False by default; a booking is not consent. Replies to the contact''s own enquiry do not need it.';

update public.contacts
   set consent_email = false,
       meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('consent_email_reset', jsonb_build_object(
         'at', now(), 'was', true,
         'why', 'Set by the old booking-form default, not by the person. Reset by 0045 (22 Oct 2026).'))
 where consent_email is true
   and coalesce(meta->'consent_recorded'->>'email', '') <> 'true';

create or replace function public.require_marketing_compliance()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  reason     text := coalesce(new.meta->>'reason', '');
  postal     text;
  consent    boolean;
  opted_out  timestamptz;
  owner_addr text;
begin
  if new.direction is distinct from 'outbound'
     or new.channel is distinct from 'email'
     or new.status not in ('queued', 'sent', 'delivered')
     or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  if reason in ('booking_confirmation', 'invoice', 'payment_receipt', 'password_reset')
     or coalesce(new.meta->>'transactional', '') = 'true' then
    return new;
  end if;

  -- Internal alert to the studio's own address: not marketing, not to a
  -- contact who could have opted out of anything.
  if reason = 'owner_booking_alert' then
    select s.value->>'email' into owner_addr
      from public.settings s where s.key = 'owner_notify';
    if owner_addr is not null
       and lower(coalesce(new.to_addr, '')) = lower(owner_addr) then
      return new;
    end if;
  end if;

  if new.contact_id is not null then
    select c.consent_email, c.email_opted_out_at into consent, opted_out
      from public.contacts c where c.id = new.contact_id;
    if opted_out is not null then
      raise exception 'messages %: this contact has opted out of marketing email. Transactional messages (meta.reason = ''booking_confirmation'', ''invoice'', ''payment_receipt'') are still allowed.',
        new.id using errcode = 'check_violation';
    end if;
    if reason not in ('lead_follow_up', 'saved_list_reply') and consent is distinct from true then
      raise exception 'messages %: this contact never opted in to marketing email. A reply to their own enquiry (lead_follow_up, saved_list_reply) does not need it; this message is not one.',
        new.id using errcode = 'check_violation';
    end if;
  end if;

  if new.body is null or new.body !~* 'unsubscribe' then
    raise exception 'messages %: marketing email must carry an unsubscribe link. The owner portal appends one on approval; this message has none.',
      new.id using errcode = 'check_violation';
  end if;

  select btrim(coalesce(s.value->>'postal_address', '')) into postal
    from public.settings s where s.key = 'business_profile';

  if coalesce(postal, '') = '' then
    raise exception 'messages %: no postal address is configured, so marketing email cannot be sent. Set settings.business_profile -> postal_address to a real mailing address. Transactional messages are not affected.',
      new.id using errcode = 'check_violation';
  end if;

  if position(postal in new.body) = 0 then
    raise exception 'messages %: marketing email must show the postal address on file. Expected to find it in the body and did not.',
      new.id using errcode = 'check_violation';
  end if;

  return new;
end $function$;

-- ---------------------------------------------------------------- A ------
update public.settings
   set value = value || '{"followups_per_day": 25}'::jsonb
 where key = 'intake_limits' and not (value ? 'followups_per_day');

create or replace function public.cap_lead_followups()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  cap_n integer;
  n     integer;
begin
  -- One at a time, so two parallel bookings cannot both read "one left".
  perform pg_advisory_xact_lock(hashtext('cap_lead_followups'));

  select case when (s.value->>'followups_per_day') ~ '^\d+$'
              then (s.value->>'followups_per_day')::integer end
    into cap_n
    from public.settings s where s.key = 'intake_limits';
  cap_n := coalesce(cap_n, 25);

  select count(*) into n
    from public.tasks t
   where t.type = 'follow_up_lead' and t.created_at > now() - interval '24 hours';

  if n >= cap_n then
    perform public.raise_alert(
      'followup_cap', 'warning',
      'Daily limit on AI follow-ups reached',
      n || ' follow-ups were drafted in the last 24 hours, the limit is ' || cap_n
        || '. New leads are still saved; their follow-up is not drafted until the count drops. '
        || 'Many at once usually means fake bookings. If they are real, raise intake_limits.followups_per_day.',
      'intake', jsonb_build_object('limit', cap_n, 'last_24h', n));
    return null;  -- skip this row; the lead itself is untouched
  end if;
  return new;
end $function$;

revoke all on function public.cap_lead_followups() from public, anon, authenticated;

create or replace trigger tasks_cap_lead_followups
  before insert on public.tasks
  for each row when (new.type = 'follow_up_lead')
  execute function public.cap_lead_followups();
