-- The approved product reel cannot be written broken.
--
-- settings.video_scenes holds the product scenes of the reel Otis approved,
-- and every agent video is built from it. It is data, and data gets
-- overwritten - it was, once, mid-session, by a bad export. Nothing noticed:
-- the builder checked that the scene list was not empty but not that the
-- scenes had anything in them, and the next step after that check is a POST
-- that spends render credits on a frame with nothing drawn in it.
--
-- The renderer-side guard lives in _shared/clipkit.ts (sceneSetProblem). This
-- is the same check one layer down, where the damage would be done: a write
-- that would leave the agents with no reel to render is refused outright, so
-- the bad row never exists to be read. Structure only - it says nothing about
-- which scenes the reel should contain, so approving a new reel stays a
-- one-statement job.
-- search_path is pinned empty (everything here is pg_catalog or NEW), so the
-- trigger cannot be steered by a caller's search_path. Not SECURITY DEFINER:
-- it needs no privileges of its own.
create or replace function public.validate_video_scenes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s jsonb;
  i int := 0;
  where_ text;
begin
  if new.key is distinct from 'video_scenes' then
    return new;
  end if;

  if jsonb_typeof(new.value->'scenes') is distinct from 'array'
     or jsonb_array_length(new.value->'scenes') = 0 then
    raise exception 'video_scenes: no scenes - the agents would have no reel to render';
  end if;

  if jsonb_typeof(new.value->'fonts') is distinct from 'array'
     or jsonb_array_length(new.value->'fonts') = 0 then
    raise exception 'video_scenes: no fonts - the reel would render in a fallback face';
  end if;

  for s in select * from jsonb_array_elements(new.value->'scenes') loop
    i := i + 1;
    where_ := coalesce(nullif(s->>'id', ''), 'scene ' || i);

    if coalesce(s->>'id', '') = '' then
      raise exception 'video_scenes: scene % has no id', i;
    end if;

    if jsonb_typeof(s->'length') is distinct from 'number'
       or (s->>'length')::numeric <= 0
       or jsonb_typeof(s->'start') is distinct from 'number' then
      raise exception 'video_scenes: % has no usable time window', where_;
    end if;

    if s->'group'->>'type' is distinct from 'group' then
      raise exception 'video_scenes: % has no group', where_;
    end if;

    if jsonb_typeof(s->'group'->'elements') is distinct from 'array'
       or jsonb_array_length(s->'group'->'elements') = 0 then
      raise exception 'video_scenes: % has an empty group - nothing would be drawn', where_;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists settings_validate_video_scenes on public.settings;
create trigger settings_validate_video_scenes
  before insert or update on public.settings
  for each row execute function public.validate_video_scenes();
