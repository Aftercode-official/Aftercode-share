create table if not exists public.announcement_dismissals (
  user_id uuid not null references auth.users (id) on delete cascade,
  announcement_id bigint not null references public.announcements (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table public.announcement_dismissals enable row level security;
