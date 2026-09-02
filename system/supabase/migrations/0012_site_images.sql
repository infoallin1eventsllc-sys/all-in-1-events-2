-- Owner-managed site images, published rather than remembered.
--
-- Photo Control in the owner portal let Otis swap any portfolio or hero image
-- and told him "the live site now shows it." It did not. Overrides were written
-- to localStorage, so the change existed in exactly one browser: not on his
-- phone, not for a single visitor, and not after clearing site data. The
-- message was the worst part — a swap that silently applies to nobody is
-- discovered at the moment it matters, in front of a client.
--
-- Two pieces here. A settings row holds the id -> url map, read by the public
-- site. A public storage bucket holds files uploaded through the portal, so an
-- upload becomes a CDN URL instead of a megabyte of base64 that every visitor
-- would download inside the settings payload.

insert into public.settings (key, value)
values ('image_overrides', '{}'::jsonb)
on conflict (key) do nothing;

-- Public read, because the site is public. Writes never happen from a browser:
-- the owner function holds the service-role key and is the only writer, so no
-- insert/update policy is granted to anon or authenticated at all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-images',
  'site-images',
  true,
  8 * 1024 * 1024,                       -- a photograph, not a video
  array['image/png','image/jpeg','image/webp','image/avif','image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'site-images public read'
  ) then
    create policy "site-images public read"
      on storage.objects for select
      to public
      using (bucket_id = 'site-images');
  end if;
end $$;
