# Backups

What is backed up, where, how often, and how to get it back. Written 15 Oct 2026.

## The four copies

| What | Where the copy lives | How often | Kept |
|---|---|---|---|
| Website code and every demo | GitHub (`meridian-interface-website`), every change | Every change | Forever |
| The live website itself | Vercel keeps every deployment | Every deploy | Forever, one-click rollback |
| Database (CRM, invoices, payments, marketing, settings) | Inside Supabase, schema `backup` (`take_crm_snapshot`) | Nightly, 3:15 am Houston | 30 days, never fewer than 7 |
| Database + every stored file (photos, videos) | Otis's Mac, `~/Meridian Backups/<date>/` (`backup/offsite-backup.sh`) | Weekly, Sundays 10:00 | 8 weeks |

The nightly copy protects against a mistake: a wrong delete, a bad update. It
lives in the same Supabase project, so it would be lost with the project. The
weekly copy on the Mac is the one that survives that. Both GitHub repos are
**public**, which is why no customer data is ever backed up to GitHub.

## Status (15 Oct)

- Nightly snapshot: running since 16 Sep, 8 tables. Migration
  `supabase/migrations/0043_snapshot_everything.sql` widens it to 16 tables plus
  the list of stored files. **Not applied yet**: it needs the owner's OK (the
  Supabase connector asks for approval on any change, and it timed out
  unanswered). Apply it either way:
  - next time Claude sends it, tap **Allow** on the prompt, or
  - Supabase dashboard → SQL Editor → paste the whole file → Run.
- Weekly Mac backup: script written and tested (with stand-in tools, since this
  sandbox cannot reach the database). **Needs the one-time setup below.**

## One-time setup of the weekly Mac backup (about 5 minutes)

1. In Supabase: your project → **Connect** → **Session pooler** → copy the
   **URI** (starts `postgresql://postgres.glzodwhyavexpuusbqjy:`). Put your
   database password where it says `[YOUR-PASSWORD]`. Forgot it? Project
   Settings → Database → Reset database password (nothing on the site uses that
   password; the functions use their own keys).
2. On the Mac, in Terminal, from the repo:
   ```
   cd system/backup
   bash install-offsite-backup.sh
   ```
   It installs the Postgres tools if needed (Homebrew), asks for the address
   once (stored in the Keychain, not in a file), schedules Sundays 10:00, and
   runs the first backup immediately.
3. Check `~/Meridian Backups/` has today's folder with `database.dump`,
   `files/` and a `backup.log` that ends in `DONE`.

The Mac must be on (or wake) for the Sunday run; launchd runs a missed job at
the next wake. The log of every run is also in `~/Library/Logs/meridian-backup.log`.

## Getting something back

- **Website broken after a change:** Vercel dashboard → the project →
  Deployments → pick the last good one → **Instant Rollback**. Seconds.
- **Rows deleted or overwritten in the CRM (last 30 days):** ask Claude, or in
  the SQL editor:
  ```
  select id, taken_at, row_counts from backup.snapshots order by taken_at desc;
  select * from jsonb_populate_recordset(null::public.contacts,
                  public.read_crm_snapshot(<id>, 'contacts'));
  ```
  Restore is deliberately manual: look before you put old rows back.
- **Project lost, or older than 30 days:** the Mac copy.
  `pg_restore --list database.dump` shows what is inside; restore table by table
  with `pg_restore -d "<db url>" --data-only -t <table> database.dump`. Stored
  files are under `files/<bucket>/` with their original paths.

## Not backed up, on purpose

Platform credentials and the two-step secret (`channels`, `owner_security`):
re-entered after a disaster, never restored, so a replaced key cannot come back
from an old copy. The Mac copy keeps those tables' structure but not their rows.
Logs and counters (`agent_runs`, `tasks`, alerts, login attempts, rate limits)
rebuild themselves (the nightly copy skips them; the Mac copy includes them).

One sensitive thing IS in both copies: the `settings` table, which holds the
Anthropic key fallback and the dashboard passcode. It is needed to rebuild the
system, so it stays in. Treat `~/Meridian Backups` as private: keep FileVault
on (System Settings → Privacy & Security → FileVault), and never upload the
folder anywhere public.
