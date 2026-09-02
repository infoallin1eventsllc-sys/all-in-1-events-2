-- A second place the Anthropic key may live.
--
-- The edge secret stays preferred and nothing changes when it is set correctly.
-- This exists because that field can silently keep an old value: this project
-- produced placeholder copy for two weeks with a 16-character string in it, and
-- repeated saves through the dashboard did not change it. Diagnosing that took
-- a deployed probe, because the pipeline swallowed the 401 and carried on.
--
-- The run secret already lives here for the same reason — one UPDATE rotates
-- it, with no redeploy. Service-role only, behind the same deny-by-default RLS
-- as every other table.
insert into public.settings (key, value)
values ('anthropic', jsonb_build_object('api_key', ''))
on conflict (key) do nothing;

-- Setting it by hand means pasting a long secret into a SQL string, where a
-- stray quote or a wrapped line silently stores the wrong thing. This validates
-- the shape and refuses anything that is not a key, so a mistake is immediate
-- and loud rather than a 401 discovered a fortnight later. It returns the
-- length and the non-secret prefix so the operator can confirm what landed
-- without reading the value back.
create or replace function public.set_anthropic_key(p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := btrim(coalesce(p_key, ''));
begin
  if k = '' then
    update public.settings set value = jsonb_build_object('api_key', ''), updated_at = now()
     where key = 'anthropic';
    return 'Cleared. The agents will fall back to placeholder text.';
  end if;

  if k !~ '^sk-ant-' then
    return 'REFUSED: a key starts with sk-ant-. Nothing was saved.';
  end if;
  if length(k) < 40 then
    return format('REFUSED: that is %s characters; a key is about 100. Nothing was saved.', length(k));
  end if;
  if k ~ '\s' then
    return 'REFUSED: that value contains a space or newline. Nothing was saved.';
  end if;

  update public.settings
     set value = jsonb_build_object('api_key', k), updated_at = now()
   where key = 'anthropic';

  return format('Saved. %s characters, starts %s, ends %s.',
                length(k), left(k, 11), right(k, 4));
end $$;

-- security definer, so it must never be callable by a browser role.
revoke execute on function public.set_anthropic_key(text) from public, anon, authenticated;
