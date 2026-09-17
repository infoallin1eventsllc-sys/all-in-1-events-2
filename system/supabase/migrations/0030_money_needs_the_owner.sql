-- Money in an outbound message always stops for the owner.
--
-- Otis, 17 Sep 2026:
--   "The agent has to prompt me for approval to send anything when it comes to
--    prices, to clients or customers. I approve what the agent can and can't do."
--
-- The existing gate already required meta.approved_by = 'owner' before anything
-- outbound could be sent. It carried one deliberate exemption, `auto_transactional`:
-- a fixed template the system emits about something already in motion, so that
-- somebody booking at 11pm gets an acknowledgement instead of silence.
--
-- The hole was in that exemption's reason list. It included 'invoice' and
-- 'payment_receipt' — the two that are ENTIRELY about money — so a row marked
-- automatic with one of those reasons could carry a figure to a client with no
-- owner approval at all. That is the exact case Otis is ruling on.
--
-- This narrows the exemption rather than removing it: an automatic message may
-- still go without approval, but NOT if it contains a money figure. The
-- acknowledgement email keeps working because it names no price (verified 17
-- Sep, when the line claiming prices were published on the site was removed).
--
-- Why in the database and not in the runner's prompt: a prompt is a request, and
-- a model can be talked out of a request by text a stranger put in a form. This
-- is a constraint. It holds whether the message came from the agent, the runner,
-- a future Stripe flow, a script, or a mistake — and it holds if autonomy is
-- ever switched from "draft" to "auto", which is one word in one settings row.
--
-- payment_receipt is the single exemption kept, and it is deliberate: a receipt
-- records money the CLIENT has already chosen to pay. It is not the studio
-- proposing a price, which is the decision Otis is reserving. Nothing emits it
-- today (Stripe is not connected), so it costs nothing to leave open and would
-- be a silent breakage to close.

create or replace function public.money_mentioned(p_subject text, p_body text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_subject, '') || ' ' || coalesce(p_body, '')
         ~* '([$£€]\s*[0-9])|([0-9]\s*(dollars|usd)\M)'
$$;

comment on function public.money_mentioned(text, text) is
  'True when a message names a currency figure. Used by require_owner_approval to force owner sign-off on anything priced. Deliberately errs toward catching too much: a false positive costs one approval click, a false negative sends a price to a client unreviewed.';

create or replace function public.require_owner_approval()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  stamped boolean := coalesce(new.meta->>'approved_by', '') = 'owner';
  -- A fixed template the system emits about something already in motion.
  -- NOTE: 'invoice' and 'booking_confirmation' were removed from the money-free
  -- path below; see the money guard. 'payment_receipt' remains, because it
  -- records a payment the client already made rather than proposing a price.
  auto_transactional boolean :=
    coalesce(new.meta->>'automatic', '') = 'true'
    and coalesce(new.meta->>'reason', '') in
        ('booking_confirmation', 'invoice', 'payment_receipt', 'password_reset');
  -- The new constraint. An automatic template that names a figure is no longer
  -- automatic as far as this gate is concerned.
  carries_money boolean := public.money_mentioned(new.subject, new.body);
  money_exempt boolean := coalesce(new.meta->>'reason', '') = 'payment_receipt';
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
end $function$;
