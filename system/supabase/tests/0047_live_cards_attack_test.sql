-- Attack test for migration 0047 (Live Cards). 62 checks. 55 passed on the real database on 24 Nov 2026 (rolled back). The block-list rules and 7 more checks were added after that and
-- have only been run on the local stand-in (tests/local/run.sh): 62 pass. Re-run on the real database before launch.
-- How to run without leaving anything behind: send ONE query made of
--   begin;  +  the whole of migrations/0047_live_cards.sql  +  this file
-- The last line raises an error on purpose, which rolls the whole transaction back. The error text is the result list.
-- Afterwards confirm nothing remains: no lc_ tables, functions or policies, no live-cards bucket, no lc-dryrun users.
-- Not covered here: two requests arriving at the same instant (needs two live connections; the row lock and advisory locks are in place, test at go-live),
-- and deleting stored files (Supabase blocks direct deletes in SQL; test that through the Storage API at go-live).

do $t$
declare
  r text := '';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  j jsonb; n int; cid uuid; cid2 uuid; b boolean; i int;
  base text := 'https://glzodwhyavexpuusbqjy.supabase.co/storage/v1/object/public/live-cards/';
  c1 text; c2 text; canon text;
begin
  insert into auth.users(id, instance_id, aud, role, email) values
    (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','lc-dryrun-1@example.invalid'),
    (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','lc-dryrun-2@example.invalid');
  c1 := json_build_object('sub',u1,'role','authenticated')::text;
  c2 := json_build_object('sub',u2,'role','authenticated')::text;
  canon := json_build_object('role','anon')::text;

  perform set_config('request.jwt.claims', c1, true);
  execute 'set local role authenticated';
  insert into public.lc_cards(slug, data, published) values ('dryrun-card-one', jsonb_build_object(
    'name', repeat('A', 200) || chr(10) || 'BEGIN:VCARD' || chr(8238),
    'evil', '<script>alert(1)</script>', 'showMade', false, 'accent', 'red;background:url(//evil.example)',
    'logo', jsonb_build_object('url','https://evil.example/logo.jpg','mark',true),
    'actions', jsonb_build_object('phone','+1 (281) 555-0100','email','a@b.co','website','javascript:alert(1)','facebook','https://ok.example/page',
                                  'booking','data:text/html,<script>1</script>','instagram','https://x.example/"onload="1'),
    'background', jsonb_build_object('type','video','url','https://evil.example/track.mp4','bg','url(javascript:1)','id','../../x')), true)
    returning id, data into cid, j;
  r := r || case when j->'actions'->>'website' = '' then 'PASS' else 'FAIL' end || ' javascript link removed' || E'\n';
  r := r || case when j->'actions'->>'booking' = '' then 'PASS' else 'FAIL' end || ' data link removed' || E'\n';
  r := r || case when j->'actions'->>'instagram' = '' then 'PASS' else 'FAIL' end || ' link with quote removed' || E'\n';
  r := r || case when j->'actions'->>'facebook' = 'https://ok.example/page' then 'PASS' else 'FAIL' end || ' normal link kept' || E'\n';
  r := r || case when j->'background'->>'type' = 'scene' and j->'background'->>'url' = '' then 'PASS' else 'FAIL' end || ' outside video address removed' || E'\n';
  r := r || case when j->'logo'->>'url' = '' and (j->'logo'->>'mark') = 'false' then 'PASS' else 'FAIL' end || ' outside logo address removed' || E'\n';
  r := r || case when not (j ? 'evil') then 'PASS' else 'FAIL' end || ' unknown field dropped' || E'\n';
  r := r || case when (j->>'showMade') = 'true' then 'PASS' else 'FAIL' end || ' free plan cannot hide the Meridian line' || E'\n';
  r := r || case when j->>'accent' = '#2563eb' and j->'background'->>'bg' = '#000000' and j->'background'->>'id' = 'ocean' then 'PASS' else 'FAIL' end || ' bad colours and ids reset' || E'\n';
  r := r || case when j->'actions'->>'phone' = '+12815550100' and j->'actions'->>'email' = 'a@b.co' then 'PASS' else 'FAIL' end || ' phone and email normalised' || E'\n';
  r := r || case when length(j->>'name') = 60 and position(chr(10) in j::text) = 0 and position(chr(8238) in j->>'name') = 0 then 'PASS' else 'FAIL' end || ' name trimmed, no line breaks' || E'\n';
  select owner = u1 and not blocked into b from public.lc_cards where id = cid;
  r := r || case when b then 'PASS' else 'FAIL' end || ' owner set by the server' || E'\n';

  update public.lc_cards set data = jsonb_build_object('name','Test' || chr(8238) || ' One','background', jsonb_build_object('type','video','url', base || u1 || '/bg-abc123.mp4'),
    'logo', jsonb_build_object('url', base || u2 || '/logo-abc123.jpg')) where id = cid returning data into j;
  r := r || case when j->'background'->>'type' = 'video' and j->'background'->>'url' = base || u1 || '/bg-abc123.mp4' then 'PASS' else 'FAIL' end || ' own uploaded video accepted' || E'\n';
  r := r || case when j->'logo'->>'url' = '' then 'PASS' else 'FAIL' end || ' another account''s file refused' || E'\n';
  r := r || case when j->>'name' = 'Test One' then 'PASS' else 'FAIL' end || ' hidden direction mark removed from a name' || E'\n';

  begin insert into public.lc_cards(slug, data, published, owner) values ('dryrun-x', '{"name":"x"}', false, u2); r := r || 'FAIL client set owner' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS client cannot set owner' || E'\n'; end;
  begin update public.lc_cards set blocked = true where id = cid; r := r || 'FAIL client set blocked' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS client cannot set blocked' || E'\n'; end;
  begin insert into public.lc_cards(slug, data) values ('dryrun-card-two', '{"name":"x"}'); r := r || 'FAIL second card on free plan' || E'\n';
  exception when sqlstate 'P0001' then r := r || 'PASS free plan limited to one card' || E'\n'; end;
  begin update public.lc_accounts set plan = 'pro' where user_id = u1; r := r || 'FAIL client upgraded own plan' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS client cannot change plan' || E'\n'; end;
  begin insert into public.lc_accounts(user_id, plan) values (u1, 'pro'); r := r || 'FAIL client inserted account' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS client cannot create a paid account row' || E'\n'; end;
  begin perform public.lc_clean_card('{}'::jsonb, u1, 'pro'); r := r || 'FAIL client ran internal function' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS internal functions closed' || E'\n'; end;
  begin select count(*) into n from public.lc_reports; r := r || 'FAIL client read reports' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS signed-in client cannot read reports' || E'\n'; end;
  begin select count(*) into n from public.lc_billing_events; r := r || 'FAIL client read billing' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS client cannot read billing events' || E'\n'; end;
  begin update public.lc_cards set published = true, data = '{"name":""}' where id = cid; r := r || 'FAIL published with no name' || E'\n';
  exception when sqlstate 'P0001' then r := r || 'PASS cannot publish without a name' || E'\n'; end;

  begin insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/bg-a1.mp4'); r := r || 'PASS own upload allowed' || E'\n';
  exception when others then r := r || 'FAIL own upload refused: ' || sqlerrm || E'\n'; end;
  begin insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/evil.html'); r := r || 'FAIL html upload allowed' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS other file names refused' || E'\n'; end;
  begin insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/bg-a1.svg'); r := r || 'FAIL svg upload allowed' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS svg refused' || E'\n'; end;
  begin insert into storage.objects(bucket_id, name) values ('live-cards', u2 || '/bg-a1.mp4'); r := r || 'FAIL upload into another folder' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS cannot upload into another account''s folder' || E'\n'; end;
  begin insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/sub/bg-a1.mp4'); r := r || 'FAIL nested path allowed' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS nested paths refused' || E'\n'; end;
  begin insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/../' || u2 || '/bg-a1.mp4'); r := r || 'FAIL path trick allowed' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS dot-dot path trick refused' || E'\n'; end;
  begin
    for i in 2..8 loop insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/bg-a' || i || '.mp4'); end loop;
    begin insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/bg-a9.mp4'); r := r || 'FAIL ninth file allowed' || E'\n';
    exception when insufficient_privilege then r := r || 'PASS ninth file refused (8 file cap)' || E'\n'; end;
  exception when others then r := r || 'FAIL filling to cap: ' || sqlerrm || E'\n'; end;
  begin update storage.objects set name = u1 || '/bg-zz.mp4' where bucket_id = 'live-cards' and name = u1 || '/bg-a1.mp4'; get diagnostics n = row_count;
    r := r || case when n = 0 then 'PASS' else 'FAIL' end || ' files cannot be renamed or replaced' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS files cannot be renamed or replaced' || E'\n'; end;

  perform set_config('request.jwt.claims', c2, true);
  select count(*) into n from public.lc_cards;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || ' another client cannot list cards' || E'\n';
  update public.lc_cards set data = '{"name":"hacked"}' where id = cid; get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || ' another client cannot edit the card' || E'\n';
  delete from public.lc_cards where id = cid; get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || ' another client cannot delete the card' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'live-cards';
  r := r || case when n = 0 then 'PASS' else 'FAIL' end || ' another client cannot list the files' || E'\n';
  begin insert into public.lc_cards(slug, data) values ('admin', '{"name":"x"}'); r := r || 'FAIL reserved link taken' || E'\n';
  exception when sqlstate '23505' then r := r || 'PASS reserved links refused' || E'\n'; end;
  begin insert into public.lc_cards(slug, data) values ('dryrun-card-one', '{"name":"x"}'); r := r || 'FAIL duplicate link taken' || E'\n';
  exception when unique_violation then r := r || 'PASS a link in use cannot be taken' || E'\n'; end;
  insert into public.lc_cards(slug, data, published) values ('dryrun-card-b', '{"name":"Second Person"}', false) returning id into cid2;
  r := r || case when not public.lc_slug_available('dryrun-card-one') and public.lc_slug_available('dryrun-free-name') and not public.lc_slug_available('studio') then 'PASS' else 'FAIL' end || ' link check answers correctly' || E'\n';

  execute 'reset role';
  perform set_config('request.jwt.claims', canon, true);
  execute 'set local role anon';
  begin select count(*) into n from public.lc_cards; r := r || 'FAIL visitor listed cards' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS visitor cannot list cards' || E'\n'; end;
  begin select count(*) into n from public.lc_accounts; r := r || 'FAIL visitor read accounts' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS visitor cannot read accounts' || E'\n'; end;
  begin select count(*) into n from public.lc_reports; r := r || 'FAIL visitor read reports' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS visitor cannot read reports' || E'\n'; end;
  begin insert into public.lc_reports(slug, reason) values ('x','direct'); r := r || 'FAIL visitor wrote reports directly' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS visitor cannot write reports directly' || E'\n'; end;
  begin insert into public.lc_cards(slug, data) values ('dryrun-anon', '{"name":"x"}'); r := r || 'FAIL visitor made a card' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS visitor cannot make a card' || E'\n'; end;
  begin perform public.lc_delete_account(); r := r || 'FAIL visitor ran delete account' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS visitor cannot run account deletion' || E'\n'; end;
  begin insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/bg-an.mp4'); r := r || 'FAIL visitor uploaded' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS visitor cannot upload' || E'\n'; end;
  r := r || case when public.lc_get_card('dryrun-card-one')->>'name' = 'Test One' then 'PASS' else 'FAIL' end || ' visitor opens a published card by its link' || E'\n';
  r := r || case when public.lc_get_card('dryrun-card-b') is null then 'PASS' else 'FAIL' end || ' unpublished card stays hidden' || E'\n';
  for i in 1..9 loop perform public.lc_report('dryrun-card-one', 'spam report number ' || i); end loop;
  perform public.lc_report('no-such-card-here', 'ghost report');
  perform public.lc_report('dryrun-card-one', 'x');

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.lc_reports;
  r := r || case when n = 5 then 'PASS' else 'FAIL (' || n || ')' end || ' reports throttled to 5 an hour per card' || E'\n';
  perform public.lc_set_blocked(cid, true);
  select c.blocked and a.blocked into b from public.lc_cards c join public.lc_accounts a on a.user_id = c.owner where c.id = cid;
  r := r || case when b then 'PASS' else 'FAIL' end || ' owner can take a card down (card and account blocked)' || E'\n';
  perform set_config('request.jwt.claims', canon, true); execute 'set local role anon';
  r := r || case when public.lc_get_card('dryrun-card-one') is null then 'PASS' else 'FAIL' end || ' blocked card disappears for visitors' || E'\n';
  execute 'reset role';
  perform set_config('request.jwt.claims', c1, true); execute 'set local role authenticated';
  begin update public.lc_cards set published = true, data = '{"name":"Back Again"}' where id = cid; r := r || 'FAIL blocked client saved again' || E'\n';
  exception when sqlstate 'P0001' then r := r || 'PASS blocked client cannot save or republish' || E'\n'; end;
  begin perform public.lc_set_blocked(cid, false); r := r || 'FAIL client unblocked itself' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS client cannot run the owner''s block tool' || E'\n'; end;
  begin insert into storage.objects(bucket_id, name) values ('live-cards', u1 || '/logo-blk.jpg'); r := r || 'FAIL blocked client uploaded' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS blocked client cannot upload' || E'\n'; end;
  delete from public.lc_cards where id = cid; get diagnostics n = row_count;
  begin insert into public.lc_cards(slug, data, published) values ('dryrun-fresh-start', '{"name":"Fresh Start"}', true); r := r || 'FAIL blocked client deleted the card and made a new one' || E'\n';
  exception when sqlstate 'P0001' then r := r || 'PASS blocked client cannot delete the card and start over' || E'\n'; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  -- put the card back (as the owner's tools would restore from a backup) and lift the block
  insert into public.lc_cards(id, owner, slug, data, published, blocked) values (cid, u1, 'dryrun-card-one', '{"name":"Test One"}', true, true);
  perform public.lc_set_blocked(cid, false);
  perform set_config('request.jwt.claims', canon, true); execute 'set local role anon';
  r := r || case when public.lc_get_card('dryrun-card-one')->>'name' = 'Test One' then 'PASS' else 'FAIL' end || ' owner can restore: the card is visible again' || E'\n';
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.lc_accounts set plan = 'pro' where user_id = u1;
  perform set_config('request.jwt.claims', c1, true); execute 'set local role authenticated';
  begin insert into public.lc_cards(slug, data) values ('dryrun-card-two', '{"name":"Pro Two","showMade":false}') returning data into j;
    r := r || case when (j->>'showMade') = 'false' then 'PASS' else 'FAIL' end || ' paid plan (set by owner tools) unlocks more cards and hiding the line' || E'\n';
  exception when others then r := r || 'FAIL pro second card: ' || sqlerrm || E'\n'; end;

  -- a paying account cannot delete itself while the card is still being charged
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  update public.lc_accounts set stripe_subscription_id = 'sub_dryrun' where user_id = u1;
  perform set_config('request.jwt.claims', c1, true); execute 'set local role authenticated';
  begin perform public.lc_delete_account(); r := r || 'FAIL paying account deleted itself' || E'\n';
  exception when sqlstate 'P0001' then r := r || 'PASS a paying account must cancel before it can delete itself' || E'\n'; end;
  -- a blocked account deletes itself, then tries to start over with the same email
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  perform public.lc_set_blocked(cid2, true);
  perform set_config('request.jwt.claims', c2, true); execute 'set local role authenticated';
  perform public.lc_delete_account();
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  insert into auth.users(id, instance_id, aud, role, email) values (u3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','LC-Dryrun-2@example.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub',u3,'role','authenticated')::text, true); execute 'set local role authenticated';
  begin insert into public.lc_cards(slug, data, published) values ('dryrun-came-back', '{"name":"Came Back"}', true); r := r || 'FAIL blocked person signed up again and published' || E'\n';
  exception when sqlstate 'P0001' then r := r || 'PASS a blocked person cannot start over with the same email' || E'\n'; end;
  begin select count(*) into n from public.lc_blocklist; r := r || 'FAIL client read the block list' || E'\n';
  exception when insufficient_privilege then r := r || 'PASS client cannot read the block list' || E'\n'; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  select count(*) into n from auth.users where id = u2;
  select count(*) into i from public.lc_cards where owner = u2;
  r := r || case when n = 0 and i = 0 then 'PASS' else 'FAIL' end || ' delete my account removes the login and the card' || E'\n';
  select count(*) into n from auth.users where id = u1;
  r := r || case when n = 1 then 'PASS' else 'FAIL' end || ' deleting one account leaves others alone' || E'\n';

  raise exception E'DRYRUN RESULT\n%', r;
end $t$;
