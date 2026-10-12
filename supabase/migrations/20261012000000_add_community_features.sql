create table if not exists public.project_likes (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_favorites (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null check (char_length(author) between 1 and 80),
  avatar_url text not null default '',
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete cascade,
  actor_name text not null check (char_length(actor_name) between 1 and 80),
  activity_type text not null check (activity_type in ('project_created', 'project_liked', 'project_commented')),
  project_id uuid references public.projects (id) on delete set null,
  project_title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  actor_name text not null check (char_length(actor_name) between 1 and 80),
  notification_type text not null check (notification_type in ('project_liked', 'project_commented')),
  project_id uuid references public.projects (id) on delete set null,
  project_title text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 120),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists activities_created_at_idx on public.activities (created_at desc);
create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists events_public_starts_at_idx
  on public.events (starts_at)
  where is_public = true;
create index if not exists project_comments_project_created_at_idx
  on public.project_comments (project_id, created_at);

alter table public.project_likes enable row level security;
alter table public.project_favorites enable row level security;
alter table public.project_comments enable row level security;
alter table public.activities enable row level security;
alter table public.notifications enable row level security;
alter table public.events enable row level security;

create or replace function public.record_project_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (actor_id, actor_name, activity_type, project_id, project_title)
  values (new.user_id, new.author, 'project_created', new.id, new.title);
  return new;
end;
$$;

create or replace function public.record_project_engagement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_owner uuid;
  project_name text;
  actor_name_value text;
  engagement_type text;
begin
  select user_id, title into project_owner, project_name
  from public.projects
  where id = new.project_id;

  select coalesce(
    nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
    split_part(email, '@', 1),
    'Aftercode user'
  ) into actor_name_value
  from auth.users
  where id = new.user_id;

  if tg_table_name = 'project_likes' then
    engagement_type := 'project_liked';
  else
    engagement_type := 'project_commented';
  end if;

  insert into public.activities (actor_id, actor_name, activity_type, project_id, project_title)
  values (new.user_id, actor_name_value, engagement_type, new.project_id, project_name);

  if project_owner <> new.user_id then
    insert into public.notifications (
      recipient_id, actor_id, actor_name, notification_type, project_id, project_title
    ) values (
      project_owner, new.user_id, actor_name_value, engagement_type, new.project_id, project_name
    );
  end if;
  return new;
end;
$$;

drop trigger if exists project_creation_activity on public.projects;
create trigger project_creation_activity
after insert on public.projects
for each row execute function public.record_project_creation();

drop trigger if exists project_like_activity on public.project_likes;
create trigger project_like_activity
after insert on public.project_likes
for each row execute function public.record_project_engagement();

drop trigger if exists project_comment_activity on public.project_comments;
create trigger project_comment_activity
after insert on public.project_comments
for each row execute function public.record_project_engagement();
