-- Where the studio's own booking alert is sent. Kept in settings rather than
-- an env secret so it can be changed with one UPDATE and no redeploy, and so
-- the trigger below can check it.
insert into public.settings (key, value)
values ('owner_notify', jsonb_build_object(
  'email', 'otis@meridianinterface.com',
  '_why', 'Where a new booking alert goes. Change the address here; nothing needs redeploying. This address is also what makes the alert exempt from the price rule in require_owner_approval -- a message to any other address is not.'
))
on conflict (key) do nothing;

-- The approval trigger refuses any outbound message that names a figure unless
-- the owner stamped it. That rule exists to stop a price reaching a CLIENT
-- without Otis deciding it.
--
-- The booking alert is the opposite case: it goes to Otis and nobody else, and
-- if a client typed a budget into their note he should see it rather than have
-- the alert silently refused. So it is exempt -- but the exemption is tied to
-- the fact that justifies it. It applies only when the recipient really is the
-- owner's address from settings.owner_notify. A message carrying this reason
-- addressed anywhere else gets no exemption at all and is gated like any other.
create or replace function require_owner_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  stamped boolean := coalesce(new.meta->>'approved_by', '') = 'owner';
  reason text := coalesce(new.meta->>'reason', '');
  auto_transactional boolean :=
    coalesce(new.meta->>'automatic', '') = 'true'
    and reason in ('booking_confirmation', 'invoice', 'payment_receipt',
                   'password_reset', 'owner_booking_alert');
  money_exempt boolean;
  carries_money boolean;
  owner_addr text;
begin
  if tg_table_name = 'content_items' then
    if new.status in ('approved', 'scheduled', 'published')
       and (tg_op = 'INSERT' or old.status is distinct from new.status or old.status not in ('approved','scheduled','published'))
       and not stamped then
      raise exception 'content_items %: status % requires owner approval (meta.approved_by = ''owner''). Nothing is released without it.',
        new.id, new.status using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'messages' then
    select value->>'email' into owner_addr from public.settings where key = 'owner_notify';

    money_exempt := reason = 'payment_receipt'
      or (reason = 'owner_booking_alert'
          and owner_addr is not null
          and lower(coalesce(new.to_addr, '')) = lower(owner_addr));

    carries_money := public.money_mentioned(new.subject, new.body);

    if new.direction = 'outbound' and new.status in ('queued', 'sent', 'delivered')
       and (tg_op = 'INSERT' or old.status is distinct from new.status)
       and old.status is distinct from 'sent'
       and not stamped
       and not (auto_transactional and (not carries_money or money_exempt)) then
      if carries_money and not money_exempt then
        raise exception 'messages %: this message names a price, and pricing is decided by Meridian Interface staff. It needs owner approval (meta.approved_by = ''owner'') before it can be sent, however it was generated.',
          new.id using errcode = 'check_violation';
      end if;
      raise exception 'messages %: status % requires owner approval (meta.approved_by = ''owner''). Nothing is sent without it.',
        new.id, new.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;
