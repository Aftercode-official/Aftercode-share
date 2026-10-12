create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  author text not null check (char_length(author) between 1 and 80),
  scratch_project_id text not null check (scratch_project_id ~ '^[0-9]{1,20}$'),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null check (char_length(category) between 1 and 60),
  tags text[] not null default '{}'
    check (cardinality(tags) <= 10),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_public_created_at_idx
  on public.projects (created_at desc)
  where is_public = true;

create index if not exists projects_user_id_created_at_idx
  on public.projects (user_id, created_at desc);

alter table public.projects enable row level security;

create policy "Anyone can read public projects"
  on public.projects
  for select
  using (is_public);

create policy "Owners can read their projects"
  on public.projects
  for select
  to authenticated
  using (auth.uid() = user_id);
