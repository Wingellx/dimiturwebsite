-- Storage buckets.
--
-- `references` is private: a client's reference images are their own idea for
-- their own body, and there is no reason for them to sit on a public URL that
-- anyone can enumerate. The admin page reads them through short-lived signed
-- URLs generated on the server.
--
-- `portfolio` is public, because that is the whole point of a portfolio.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'references',
  'references',
  false,
  10485760, -- 10MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio',
  'portfolio',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read on the portfolio bucket only. Uploads to both buckets happen
-- server-side on the service role, so no insert policy is granted to anon.
drop policy if exists "public read portfolio objects" on storage.objects;
create policy "public read portfolio objects" on storage.objects
  for select using (bucket_id = 'portfolio');
