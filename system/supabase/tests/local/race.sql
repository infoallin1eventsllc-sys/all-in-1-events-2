-- Fixtures for the same-instant tests: one account with no card yet, and one published card owned by someone else to report.
insert into auth.users(email) values ('race@example.invalid'), ('race-target@example.invalid');
insert into public.lc_cards(owner, slug, data, published) select id, 'race-target', '{"name":"Target"}'::jsonb, true from auth.users where email = 'race-target@example.invalid';
-- An account that already has its row (paid plan, limit 5): the case where only the row lock keeps the limit.
insert into auth.users(email) values ('race-pro@example.invalid');
insert into public.lc_accounts(user_id, plan) select id, 'pro' from auth.users where email = 'race-pro@example.invalid';
