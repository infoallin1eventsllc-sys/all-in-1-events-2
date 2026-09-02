-- 0015_video_and_platform_credentials.sql
--
-- Short-form video and the credentials for posting it.
--
-- Two things. A public bucket for rendered clips and their poster frames —
-- TikTok, Instagram and LinkedIn all fetch or are handed the file by URL, and
-- the renderer's own URLs expire, so the copy we publish from has to be ours.
-- And a guarded setter for channel credentials, because the two ways of
-- entering a secret on this project (the Secrets form, a raw UPDATE in the SQL
-- editor) have each failed several times for the same reason: nothing checked
-- that what arrived was the thing intended. This one checks.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-videos',
  'social-videos',
  true,
  64 * 1024 * 1024,                      -- a 20-second 1080x1920 clip is 3-8 MB
  array['video/mp4','image/jpeg']
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
      and policyname = 'social-videos public read'
  ) then
    create policy "social-videos public read"
      on storage.objects for select
      to public
      using (bucket_id = 'social-videos');
  end if;
end $$;

insert into public.settings (key, value)
values ('channels', '{}'::jsonb)
on conflict (key) do nothing;

-- One credential at a time, by name, with the value checked for the shape of
-- the mistake it is most likely to be. Returns a sentence either way; never
-- the value.
create or replace function public.set_channel(p_key text, p_value text)
returns text
language plpgsql security definer set search_path to 'public' as $$
declare
  v text := coalesce(p_value, '');
  allowed text[] := array[
    'webhook_url','webhook_secret',
    'meta_page_id','meta_page_token','meta_ig_user_id',
    'linkedin_org_urn','linkedin_token','linkedin_version',
    'tiktok_client_key','tiktok_client_secret','tiktok_refresh_token','tiktok_privacy',
    'shotstack_api_key','shotstack_env','video_music_url'
  ];
begin
  if p_key is null or not (p_key = any(allowed)) then
    return 'REFUSED: "' || coalesce(p_key, '') || '" is not a channel setting. One of: ' || array_to_string(allowed, ', ') || '.';
  end if;
  v := btrim(v);
  if v = '' then
    update settings set value = value - p_key, updated_at = now() where key = 'channels';
    return 'Cleared ' || p_key || '.';
  end if;
  if v ~ '\s' then
    return 'REFUSED: the value for ' || p_key || ' contains a space or line break. Nothing was saved.';
  end if;
  if p_key like '%_url' and v !~ '^https://' then
    return 'REFUSED: ' || p_key || ' must start with https://. Nothing was saved.';
  end if;
  if p_key = 'linkedin_org_urn' and v !~ '^urn:li:organization:\d+$' then
    return 'REFUSED: linkedin_org_urn looks like urn:li:organization:12345678. Nothing was saved.';
  end if;
  if p_key = 'shotstack_env' and v not in ('stage','v1') then
    return 'REFUSED: shotstack_env is "stage" (sandbox, watermarked) or "v1" (production). Nothing was saved.';
  end if;
  if p_key = 'tiktok_privacy' and v not in ('PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','FOLLOWER_OF_CREATOR','SELF_ONLY') then
    return 'REFUSED: tiktok_privacy is PUBLIC_TO_EVERYONE, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR or SELF_ONLY. Nothing was saved.';
  end if;
  if p_key like '%token' or p_key like '%secret' or p_key like '%_key' then
    if length(v) < 16 then
      return 'REFUSED: ' || p_key || ' is only ' || length(v) || ' characters; a credential is longer than that. Was the name pasted instead of the value?';
    end if;
  end if;

  update settings
     set value = value || jsonb_build_object(p_key, v), updated_at = now()
   where key = 'channels';

  return 'Saved ' || p_key || ': ' || length(v) || ' characters, starts ' || left(v, 6) || ', ends ' || right(v, 4) || '.';
end $$;

revoke all on function public.set_channel(text, text) from public, anon, authenticated;
