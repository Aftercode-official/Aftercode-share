create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null check (char_length(author) between 1 and 80),
  avatar_url text not null default '',
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;

create policy "Anyone can read global chat messages"
  on public.chat_messages for select using (true);

create policy "Signed-in users can send global chat messages"
  on public.chat_messages for insert to authenticated
  with check (auth.uid() = user_id);
