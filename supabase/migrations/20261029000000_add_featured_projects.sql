alter table public.projects
  add column if not exists is_featured boolean not null default false;

create index if not exists projects_featured_created_at_idx
  on public.projects (created_at desc)
  where is_public = true and is_featured = true;
