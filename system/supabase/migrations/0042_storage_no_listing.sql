-- Stop anyone listing the files in the two public buckets.
--
-- A public bucket serves every file by its URL with no policy at all; that is
-- how the website shows these images and videos. These two SELECT policies
-- added something else: anyone holding the public anon key could call the
-- storage list endpoint and enumerate every file name, including uploads
-- never linked from the site. Nothing reads these buckets through the API
-- with the anon key (the site goes through site-images, which uses the
-- service role), so removing them changes nothing that works.
--
-- Applied 22 Oct 2026 by re-scoping the two policies to service_role, which
-- bypasses RLS anyway, rather than dropping them: same effect (an anon list
-- now returns [], a public URL still returns 200, both checked), and it went
-- through the web session's database tool, which holds DROP statements for a
-- confirmation that never arrives. Dropping them later is harmless.
alter policy "site-images public read" on storage.objects to service_role;
alter policy "social-videos public read" on storage.objects to service_role;
