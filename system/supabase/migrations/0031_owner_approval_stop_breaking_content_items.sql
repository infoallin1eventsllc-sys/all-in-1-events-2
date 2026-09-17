-- 0030 put money_mentioned(new.subject, new.body) in the DECLARE block. Postgres
-- evaluates every initializer on every call, before any branch runs, and
-- content_items has no `subject` column -- it has `title`. So the trigger threw
-- on ANY insert or status change to content_items, which is the whole content
-- pipeline: nothing could be drafted, approved or rejected. The money check
-- belongs inside the messages branch, where `subject` actually exists.
--
-- Caught by an update to content_items failing with
--   record "new" has no field "subject"
-- ten days after 0030 went in. Nothing had written to that table since.
create or replace function require_owner_approval()
returns trigger
language plpgsql
as $$
declare
  stamped boolean := coalesce(new.meta->>'approved_by', '') = 'owner';
  auto_transactional boolean :=
    coalesce(new.meta->>'automatic', '') = 'true'
    and coalesce(new.meta->>'reason', '') in
        ('booking_confirmation', 'invoice', 'payment_receipt', 'password_reset');
  money_exempt boolean := coalesce(new.meta->>'reason', '') = 'payment_receipt';
  carries_money boolean;
begin
  if tg_table_name = 'content_items' then
    if new.status in ('approved', 'scheduled', 'published')
       and (tg_op = 'INSERT' or old.status is distinct from new.status or old.status not in ('approved','scheduled','published'))
       and not stamped then
      raise exception 'content_items %: status % requires owner approval (meta.approved_by = ''owner''). Nothing is released without it.',
        new.id, new.status using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'messages' then
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
