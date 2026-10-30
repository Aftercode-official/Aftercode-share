create table if not exists public.user_bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  banned_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.user_bans enable row level security;

revoke all on public.user_bans from anon, authenticated;
