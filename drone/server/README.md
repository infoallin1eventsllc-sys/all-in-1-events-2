# Server: accounts and a copy of the record the device can't clear

The console works with no server at all: every flight is recorded on the device,
chained with SHA-256 and verifiable in Records. The server adds three things:

- **Accounts and roles.** Operators sign in with an email link. Their company
  decides their role (pilot in command, visual observer, client/view-only, admin),
  and that role gates the controls in the console.
- **A copy nobody on site can erase.** Each closed flight is uploaded with its
  events. The database recomputes every event's SHA-256 link exactly as the console
  did and refuses anything that doesn't extend the chain; events can never be
  edited or deleted, not even by the database owner.
- **One fleet across devices.** Health reports and the parts log go up too.

It is a Supabase project (Postgres + Auth + a REST API). The app talks to it with
plain `fetch` (`src/sync/sync.ts`); there is no server code of ours to run.

## Set up (about 15 minutes)

1. Create a project at supabase.com (the free tier is enough to start).
2. **Database → SQL editor**: paste and run
   [`supabase/migrations/0001_drone_command.sql`](supabase/migrations/0001_drone_command.sql),
   then [`0002_tighten_writes.sql`](supabase/migrations/0002_tighten_writes.sql)
   (or `supabase db push` with the CLI from this folder). An existing project that
   already ran 0001 needs 0002 too; consoles from before it upload with an upsert that
   0002 refuses, so update the console at the same time.
3. **Authentication → Providers**: keep Email on. Under **URL configuration**, add
   the address the console is served from (e.g. `https://allin1events.com/drone/`)
   to the redirect allow-list.
4. **Authentication → Users → Invite user** for each person, then give them a
   company and a role (SQL editor):

   ```sql
   insert into public.dc_members (user_id, org_id, role, display_name)
   select id, 'a1events', 'PIC', 'Otis' from auth.users where email = 'otis@example.com';
   -- roles: PIC, OBSERVER, CLIENT, ADMIN
   ```

5. Build the console with the project's URL and anon (public) key:

   ```bash
   VITE_SYNC_URL=https://YOUR-PROJECT.supabase.co \
   VITE_SYNC_ANON_KEY=eyJ... \
   VITE_DEMO=off \
   npm run build
   ```

   `VITE_DEMO=off` turns off the portfolio sample data for a real operator install.
   The anon key is designed to be public; row-level security does the protecting.

The operator menu (app bar) now shows **Sign in**. After signing in, closed flights
upload in the background; Records shows **Copy on the server** or **Waiting to
upload** (offline uploads retry when the connection returns).

## What the database enforces

| Rule | How |
| --- | --- |
| Each company sees only its own flights, health reports and parts log | row-level security on `org_id` from `dc_members` |
| Clients read but never write | insert policies require PIC, OBSERVER or ADMIN |
| Rows are stamped with the account that uploaded them | insert policies check `uploaded_by` / `logged_by` = `auth.uid()` |
| An uploaded flight can only be closed, not rewritten | UPDATE granted on `dc_sessions (ended_at, note)` only |
| Events extend the chain, in order, with the right hash | `dc_events_chain` trigger (pgcrypto SHA-256) |
| Events are never edited or deleted | no UPDATE/DELETE grants, and a trigger that refuses it for everyone |
| A flight can't be deleted while it has events | foreign key without cascade |

All of it is tested against a real Postgres in `scripts/server.test.mjs` and, through
the app's own upload code, in `scripts/sync.test.mjs` (`npm test`).

## Not included

- The **internet relay** for flying from anywhere is separate: see
  `hardware/companion-pi/relay/`.
- Raw 1 Hz telemetry samples stay on the device (they are large); the server keeps the
  session, every event, health reports and the parts log. Add a `dc_samples` table and
  a storage bucket when you want paths on the server too.
