-- Stop anyone listing the files in the two public buckets.
--
-- A public bucket serves every file by its URL with no policy at all; that is
-- how the website shows these images and videos. These two SELECT policies
-- added something else: anyone holding the public anon key could call the
-- storage list endpoint and enumerate every file name, including uploads
-- never linked from the site. Nothing reads these buckets through the API
-- with the anon key (the site goes through site-images, which uses the
-- service role), so removing them changes nothing that works.
drop policy if exists "site-images public read" on storage.objects;
drop policy if exists "social-videos public read" on storage.objects;
