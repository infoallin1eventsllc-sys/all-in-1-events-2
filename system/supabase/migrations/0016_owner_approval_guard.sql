-- 0016_owner_approval_guard.sql
--
-- Nothing reaches the public without the owner's approval. Stated by Otis on
-- Sep 2 as a rule for every piece of content and every message the system
-- writes, and enforced here rather than trusted to code: a content item cannot
-- become approved, scheduled or published, and a message cannot be queued or
-- sent, unless its meta carries approved_by = 'owner'. The owner portal and
-- the CLI set that stamp when he clicks approve; nothing else does. A future
-- "auto" mode, a bug, or a well-meaning script hits this wall and fails loudly.
--
-- Items that were already published are left alone: the guard is about what
-- happens from here.

create or replace function public.require_owner_approval()
returns trigger
language plpgsql as $$
declare
  stamped boolean := coalesce(new.meta->>'approved_by', '') = 'owner';
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
       and not stamped then
      raise exception 'messages %: status % requires owner approval (meta.approved_by = ''owner''). Nothing is sent without it.',
        new.id, new.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists content_items_owner_approval on public.content_items;
create trigger content_items_owner_approval
  before insert or update of status on public.content_items
  for each row execute function public.require_owner_approval();

drop trigger if exists messages_owner_approval on public.messages;
create trigger messages_owner_approval
  before insert or update of status on public.messages
  for each row execute function public.require_owner_approval();

-- The setting says the same thing the trigger enforces.
update public.settings
   set value = value || '{"autonomy": "draft"}'::jsonb, updated_at = now()
 where key = 'agent';
