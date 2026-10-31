alter table public.chat_messages
  add column if not exists reply_to_message_id uuid
  references public.chat_messages (id) on delete set null;

create index if not exists chat_messages_reply_to_message_id_idx
  on public.chat_messages (reply_to_message_id)
  where reply_to_message_id is not null;

create table if not exists public.chat_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.chat_messages (id) on delete set null,
  reported_user_id uuid references auth.users (id) on delete set null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  message_text text not null default '',
  message_author text not null default '',
  media_type text,
  status text not null default 'open' check (status in ('open', 'dismissed', 'removed')),
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists chat_message_reports_status_created_idx
  on public.chat_message_reports (status, created_at desc);

create index if not exists chat_message_reports_reporter_message_idx
  on public.chat_message_reports (reporter_id, message_id);

create unique index if not exists chat_message_reports_reporter_message_unique
  on public.chat_message_reports (reporter_id, message_id)
  where message_id is not null;

alter table public.chat_message_reports enable row level security;

revoke all on public.chat_message_reports from public, anon, authenticated;
grant all on public.chat_message_reports to service_role;
