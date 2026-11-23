-- Pictures on posts from the app (owner, 2026-11-22: "posters should also be able to post images").
--   post-images bucket: public to read; signed-in members upload only into their own folder (<user id>/...),
--   jpg/png/webp up to 5 MB. Used for community post covers, job pictures and place photos.
--   (Event pictures keep going through the event-save function into event-images, as on the website.)
--   listings.image_url: a picture for a job post.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Post images: public read" on storage.objects;
create policy "Post images: public read" on storage.objects for select to public
  using (bucket_id = 'post-images');

drop policy if exists "Post images: members upload to their own folder" on storage.objects;
create policy "Post images: members upload to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text
              and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp']));

alter table public.listings add column if not exists image_url text;
alter table public.listings drop constraint if exists listings_image_url_http;
alter table public.listings add constraint listings_image_url_http check (image_url is null or image_url ~* '^https://');

-- Check: expect 1 bucket and 2 policies
select (select count(*) from storage.buckets where id = 'post-images') as bucket,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'Post images:%') as policies;
