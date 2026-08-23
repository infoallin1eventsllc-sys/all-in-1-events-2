-- 0010_social_card_hosting.sql
-- A public bucket for rendered social cards, plus one permission tidy-up.
--
-- Instagram does not accept image bytes; it fetches a URL we hand it, and that
-- URL must serve JPEG. The generated card was an SVG embedded as a data: URI,
-- which satisfies neither. The runner now rasterises the card and uploads it
-- here (see supabase/functions/_shared/cardhost.ts), so an Instagram post is
-- possible without the owner uploading anything.
--
-- The bucket is public on purpose: these are marketing images meant to be
-- fetched by Meta's servers and shown to strangers. Nothing private is written
-- to it. The mime allow-list keeps it to images even so.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-cards', 'social-cards', true, 5242880,
        array['image/jpeg','image/png','image/svg+xml'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Uploads come from edge functions using the service role, which bypasses RLS,
-- so no storage.objects policy is added: anonymous callers can read the public
-- URLs and write nothing.

-- ---------------------------------------------------------------------------
-- Unrelated tidy-up, found by the security advisor during this change.
--
-- prune_owner_login_attempts() is SECURITY DEFINER and was executable by anon
-- through PostgREST. It is not a throttle bypass — it only deletes rows older
-- than 24 hours, while the login throttle window is 15 minutes — but a
-- definer-rights function that deletes rows has no business being reachable by
-- anyone who has the public anon key. The pg_cron job that calls it runs as
-- the table owner and is unaffected.
-- ---------------------------------------------------------------------------
revoke execute on function public.prune_owner_login_attempts()
  from anon, authenticated, public;
