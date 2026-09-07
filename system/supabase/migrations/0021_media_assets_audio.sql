-- 0021_media_assets_audio.sql
--
-- Music lives in the library too. Clipkit's cloud renderer stalled at 99%
-- on a track served from Clipkit's own anonymous asset store, and finished
-- in three minutes without it — so soundtracks are copied into our bucket
-- (`media` function, kind 'audio') and referenced from there. Audio rows are
-- never offered to the agents as content pieces (library.ts filters them).
alter table public.media_assets drop constraint if exists media_assets_kind_check;
alter table public.media_assets add constraint media_assets_kind_check check (kind in ('image', 'video', 'audio'));
