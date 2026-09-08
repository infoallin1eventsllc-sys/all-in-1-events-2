-- 0024_transactional_ack_exemption.sql
--
-- A bug that would have appeared on the day SendGrid was connected, and not one
-- day earlier.
--
-- `intake` sends the booking acknowledgement and then records it, with status
-- 'sent' when a provider accepted it. 0016 refuses any outbound message reaching
-- 'sent' without meta.approved_by = 'owner'. The acknowledgement has no such
-- stamp, and should not: nobody approves it, that is the point of it.
--
-- Today SendGrid is unconfigured, so the row is written as 'draft' and the
-- trigger never fires. Connect a key and the sequence becomes: SendGrid accepts
-- the mail, the client receives it, the insert is refused, and the refusal is
-- swallowed by the try/catch that exists so a mail outage cannot fail a
-- booking. The email arrives and no record of it exists.
--
-- Then it gets worse. The duplicate guard works by looking for a recent
-- messages row with reason = 'booking_confirmation'. If the row is never
-- written, the guard never finds anything, and a client who submits the form
-- twice gets two emails. The safety net and the thing it protects fail
-- together, silently, in production.
--
-- The fix belongs here rather than in intake, because the rule is here. 0016
-- exists to stop the AGENT publishing unreviewed: "every piece of content and
-- every message the system writes". The acknowledgement is not that. It is a
-- fixed template, checked into this repo, that promises nothing and states only
-- what is already true - and the alternative it replaced was a client who books
-- at 11pm hearing nothing until morning.
--
-- The exemption is deliberately narrow, so it cannot become the loophole that
-- swallows the rule. It needs BOTH:
--   * meta.automatic = 'true' - set in exactly one place in the codebase, and
--     never by anything the model produces; and
--   * a reason on the transactional allow-list.
-- An agent-written draft has neither. A message that claims to be automatic
-- while carrying a marketing reason still hits the wall.
--
-- Everything else about 0016 is unchanged, including every rule for
-- content_items.

create or replace function public.require_owner_approval()
returns trigger
language plpgsql set search_path to 'public' as $$
declare
  stamped boolean := coalesce(new.meta->>'approved_by', '') = 'owner';
  -- A fixed template the system emits about something already in motion.
  auto_transactional boolean :=
    coalesce(new.meta->>'automatic', '') = 'true'
    and coalesce(new.meta->>'reason', '') in
        ('booking_confirmation', 'invoice', 'payment_receipt', 'password_reset');
begin
  if tg_table_name = 'content_items' then
    if new.status in ('approved', 'scheduled', 'published')
       and (tg_op = 'INSERT' or old.status is distinct from new.status or old.status not in ('approved','scheduled','published'))
       and not stamped then
      raise exception 'content_items %: status % requires owner approval (meta.approved_by = ''owner''). Nothing is released without it.',
        new.id, new.status using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'messages' then
    if new.direction = 'outbound' and new.status in ('queued', 'sent', 'delivered')
       and (tg_op = 'INSERT' or old.status is distinct from new.status)
       and old.status is distinct from 'sent'
       and not stamped
       and not auto_transactional then
      raise exception 'messages %: status % requires owner approval (meta.approved_by = ''owner''). Nothing is sent without it.',
        new.id, new.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
