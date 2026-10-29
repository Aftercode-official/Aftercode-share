alter table public.chat_messages
  add column if not exists media_path text,
  add column if not exists media_type text;

alter table public.chat_messages
  drop constraint if exists chat_messages_text_check;

alter table public.chat_messages
  add constraint chat_messages_text_check check (
    char_length(text) between 1 and 1000
    or (char_length(text) = 0 and media_path is not null)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view community chat media" on storage.objects;
create policy "Anyone can view community chat media"
  on storage.objects for select
  using (bucket_id = 'chat-media');

drop policy if exists "Users can upload own community chat media" on storage.objects;
create policy "Users can upload own community chat media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own community chat media" on storage.objects;
create policy "Users can delete own community chat media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
