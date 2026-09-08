-- 0023_marketing_compliance_guard.sql
--
-- A marketing email may not leave this system unless a person can get off the
-- list from inside it. US CAN-SPAM asks for two things in every commercial
-- message: a working opt-out, and a real postal address. Both are cheap to
-- add and expensive to omit, and the failure is silent - nothing breaks, the
-- mail just goes out non-compliant.
--
-- 0016 put the owner's approval in the database rather than in code, on the
-- reasoning that a rule worth having is worth enforcing where every path meets.
-- Same reasoning here. The owner portal composes the footer, but the portal is
-- not the only thing that can queue a message: the runner does too, and if
-- autonomy is ever flipped from 'draft' to 'auto' it queues without a human in
-- the loop. A check that lives only in the portal would not be there that day.
--
-- What counts as marketing: everything the agent writes, because it exists to
-- win work. The exemption is a short allow-list of messages about something
-- already in motion - a booking the person made, an invoice they are expecting.
-- Getting that backwards is the expensive direction, so anything not on the
-- list is treated as marketing.

create or replace function public.require_marketing_compliance()
returns trigger
language plpgsql
set search_path = '' as $$
declare
  reason   text := coalesce(new.meta->>'reason', '');
  postal   text;
  consent  boolean;
begin
  -- Only outbound email, and only as it becomes sendable.
  if new.direction is distinct from 'outbound'
     or new.channel is distinct from 'email'
     or new.status not in ('queued', 'sent', 'delivered')
     or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  -- Transactional: about work already underway, and exempt.
  if reason in ('booking_confirmation', 'invoice', 'payment_receipt', 'password_reset')
     or coalesce(new.meta->>'transactional', '') = 'true' then
    return new;
  end if;

  -- Somebody who has opted out does not get marketing again, by any path.
  if new.contact_id is not null then
    select c.consent_email into consent from public.contacts c where c.id = new.contact_id;
    if consent is false then
      raise exception 'messages %: this contact has opted out of marketing email. Transactional messages (meta.reason = ''booking_confirmation'', ''invoice'', ''payment_receipt'') are still allowed.',
        new.id using errcode = 'check_violation';
    end if;
  end if;

  -- A way out, in the message itself.
  if new.body is null or new.body !~* 'unsubscribe' then
    raise exception 'messages %: marketing email must carry an unsubscribe link. The owner portal appends one on approval; this message has none.',
      new.id using errcode = 'check_violation';
  end if;

  -- A real postal address, and the one on file - not any string that happens
  -- to be there. Absent from settings means marketing email is blocked
  -- outright, which is the intended state until Otis supplies one.
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
end $$;

drop trigger if exists messages_marketing_compliance on public.messages;
create trigger messages_marketing_compliance
  before insert or update of status on public.messages
  for each row execute function public.require_marketing_compliance();
