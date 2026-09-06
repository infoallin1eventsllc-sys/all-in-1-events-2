-- 0020_clipkit_channel.sql
--
-- Clipkit is the renderer behind the sizzle Otis approved on Sep 6, and the
-- one the agents now drive (_shared/clipkit.ts). Its key goes in through
-- set_channel like every other credential:
--
--   select public.set_channel('clipkit_api_key', '<key from clipkit.dev → account → API keys>');
--   select public.set_channel('clipkit_music_url', 'https://…');   -- optional soundtrack
--
-- Same guards as before: the value is never echoed, a short or spaced value
-- is refused, and clearing is an empty string.

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
    'shotstack_api_key','shotstack_env','video_music_url',
    'clipkit_api_key','clipkit_music_url'
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
