alter table public.projects
  alter column scratch_project_id drop not null,
  add column if not exists asset_path text,
  add constraint projects_source_check
    check (
      (scratch_project_id is not null and asset_path is null)
      or (scratch_project_id is null and asset_path is not null)
    ),
  add constraint projects_asset_owner_path_check
    check (asset_path is null or asset_path like user_id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', true, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Users can upload own project files" on storage.objects;
create policy "Users can upload own project files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own project files" on storage.objects;
create policy "Users can delete own project files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
