-- Close the open door on the scheduled functions.
--
-- orchestrator / runner / report verify a JWT, but the public anon key
-- satisfies that — and the anon key ships in every browser bundle by design.
-- Once the system can publish to real channels or spend against a real API
-- key, "anyone with the anon key can trigger a run" is a spend problem.
--
-- The shared secret lives in settings (RLS deny-by-default; service-role
-- only). The functions compare it against the x-run-secret header; the
-- cron-side caller below sends it. Rotating it is one UPDATE — no redeploy.

insert into settings(key, value, updated_at)
values ('run_secret', jsonb_build_object('value', encode(extensions.gen_random_bytes(24), 'hex')), now())
on conflict (key) do nothing;  -- never clobber an existing secret on re-run

create or replace function public.invoke_edge(fn text, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'net', 'vault'
as $function$
declare tok text; rs text; req bigint;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'marketing_invoke_token';
  select value->>'value' into rs from public.settings where key = 'run_secret';
  select net.http_post(
    url := 'https://glzodwhyavexpuusbqjy.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || tok,
      'x-run-secret', coalesce(rs, '')
    ),
    body := body
  ) into req;
  return req;
end $function$;

-- Same posture as before: this helper is for the cron jobs, not for clients.
revoke all on function public.invoke_edge(text, jsonb) from public, anon, authenticated;
