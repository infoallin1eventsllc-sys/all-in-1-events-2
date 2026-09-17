-- The marketing-compliance gate also sits on messages, with its own list of
-- transactional reasons. The booking alert was not on it, so the alert would
-- have been refused for lacking an unsubscribe link and a postal address --
-- CAN-SPAM requirements for commercial mail sent to a recipient, which an
-- internal note from the studio to its own address is not.
--
-- Found by testing rather than by reading: the first end-to-end run of the
-- alert failed on this trigger, not the price one.
--
-- Exempt, with the same condition as the price rule: only when the recipient
-- really is the address in settings.owner_notify. Addressed anywhere else it
-- is ordinary mail and every requirement applies.
create or replace function public.require_marketing_compliance()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  reason   text := coalesce(new.meta->>'reason', '');
  postal   text;
  consent  boolean;
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
    select c.consent_email into consent from public.contacts c where c.id = new.contact_id;
    if consent is false then
      raise exception 'messages %: this contact has opted out of marketing email. Transactional messages (meta.reason = ''booking_confirmation'', ''invoice'', ''payment_receipt'') are still allowed.',
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
