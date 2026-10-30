alter table public.projects
  add column if not exists thumbnail_url text;
