-- 0019_motion_library.sql
--
-- The motion pipeline (system/motion) is now the source of marketing media.
-- Otis rejected 25 of the text-card drafts and approved the rendered sizzle,
-- so the library grows a kind (image / video), a poster, and a description
-- the agents can choose from — the runner picks a library piece for every
-- video and every post instead of writing a Shotstack script or a
-- typographic card first.
--
-- Files reach the bucket through the `media` edge function, which fetches a
-- URL server-side (this sandbox cannot reach Supabase storage directly) and
-- records the asset here.

alter table public.media_assets
  add column if not exists kind text not null default 'image'
    check (kind in ('image', 'video')),
  add column if not exists poster_url text,
  add column if not exists description text,
  add column if not exists meta jsonb not null default '{}',
  add column if not exists approved_by text;

comment on column public.media_assets.description is
  'What the piece shows and who it is for, in plain words — the agents choose by reading this.';
comment on column public.media_assets.meta is
  'aspect ("16:9" / "9:16" / "1:1"), duration_s, width, height, bytes, sha256, source (motion template).';
comment on column public.media_assets.approved_by is
  '"owner" once Otis has approved the piece itself; only approved pieces are offered to the agents.';

create index if not exists media_assets_kind_idx on public.media_assets (kind);
