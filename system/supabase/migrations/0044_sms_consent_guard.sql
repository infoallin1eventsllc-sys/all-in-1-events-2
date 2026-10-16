-- Text messages: no marketing text without written consent, and STOP means stop.
--
-- 0023 enforces CAN-SPAM on marketing EMAIL where every path meets (a trigger
-- on messages). Texts had no equivalent. The US TCPA makes marketing texts
-- without prior express written consent expensive (statutory damages per
-- message), and carriers block senders who ignore STOP. The Twilio adapter
-- exists (_shared/channels.ts) though no credentials are set yet, so this is
-- the moment to put the rule in, before the first text can go out.
--
-- Rules, enforced on every outbound SMS as it becomes sendable:
--   1. A contact who replied STOP gets nothing, not even transactional texts.
--      Carriers and the TCPA treat STOP as covering all messages from the
--      sender. Recorded as contacts.meta.sms_opted_out = true, NOT as
--      consent_sms = false: consent_sms is false by default for everyone
--      who simply never opted in, and those people may still receive the
--      texts they asked for (a booking confirmation).
--   2. Marketing texts need consent_sms = true: an explicit opt-in on record.
--      A phone number on a booking form is not marketing consent.
--   3. Marketing texts must tell the person how to stop ("Reply STOP").
--   Transactional texts (a booking the person made, an invoice they expect)
--   are allowed without the opt-in, as long as the person has not said STOP.
--
-- And an inbound text whose whole body is a standard opt-out word (STOP,
-- STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT) marks the contact opted out and
-- clears consent_sms, so the next outbound text is blocked by rule 1. START or
-- UNSTOP from the same person lifts the block; marketing consent is not
-- restored automatically and has to be recorded again.
create or replace function public.require_sms_consent()
returns trigger
language plpgsql
set search_path = '' as $$
declare
  reason  text := coalesce(new.meta->>'reason', '');
  consent boolean;
  opted_out boolean := false;
  transactional boolean;
begin
  if new.direction is distinct from 'outbound'
     or new.channel is distinct from 'sms'
     or new.status not in ('queued', 'sent', 'delivered')
     or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  transactional := reason in ('booking_confirmation', 'invoice', 'payment_receipt', 'password_reset')
                   or coalesce(new.meta->>'transactional', '') = 'true';

  if new.contact_id is not null then
    select c.consent_sms, coalesce(c.meta->>'sms_opted_out', '') = 'true'
      into consent, opted_out
      from public.contacts c where c.id = new.contact_id;
  end if;

  if opted_out then
    raise exception 'messages %: this contact replied STOP. No texts of any kind may be sent to them.',
      new.id using errcode = 'check_violation';
  end if;

  if transactional then
    return new;
  end if;

  if consent is distinct from true then
    raise exception 'messages %: marketing texts need written consent on record (contacts.consent_sms = true). A phone number alone is not consent.',
      new.id using errcode = 'check_violation';
  end if;

  if new.body is null or new.body !~* '\mstop\M' then
    raise exception 'messages %: a marketing text must say how to opt out, e.g. "Reply STOP to opt out".',
      new.id using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists messages_sms_consent on public.messages;
create trigger messages_sms_consent
  before insert or update of status on public.messages
  for each row execute function public.require_sms_consent();

-- Inbound opt-out and opt-in keywords.
create or replace function public.apply_sms_keywords()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
declare
  word text := upper(btrim(coalesce(new.body, '')));
begin
  if new.direction is distinct from 'inbound' or new.channel is distinct from 'sms' or new.contact_id is null then
    return new;
  end if;
  if word in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT') then
    update public.contacts
       set consent_sms = false,
           meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('sms_opted_out', true, 'sms_opted_out_at', now()),
           updated_at = now()
     where id = new.contact_id;
  elsif word in ('START', 'UNSTOP') then
    update public.contacts
       set meta = coalesce(meta, '{}'::jsonb) - 'sms_opted_out' - 'sms_opted_out_at',
           updated_at = now()
     where id = new.contact_id;
  end if;
  return new;
end $$;

revoke all on function public.apply_sms_keywords() from public, anon, authenticated;

drop trigger if exists messages_sms_keywords on public.messages;
create trigger messages_sms_keywords
  after insert on public.messages
  for each row execute function public.apply_sms_keywords();
