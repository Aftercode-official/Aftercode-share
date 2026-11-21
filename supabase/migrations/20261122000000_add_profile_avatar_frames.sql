alter table public.profiles
  add column if not exists avatar_frame text not null default 'none'
  check (avatar_frame in ('none', 'gold', 'neon', 'pixel', 'bear'));
