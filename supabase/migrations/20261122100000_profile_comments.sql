create table if not exists public.profile_comments (
  id uuid primary key default gen_random_uuid(),
  profile_user_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null check (char_length(author) between 1 and 80),
  avatar_url text not null default '',
  text text not null check (char_length(text) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists profile_comments_profile_created_idx
  on public.profile_comments (profile_user_id, created_at desc);

alter table public.profile_comments enable row level security;
revoke all on table public.profile_comments from public, anon, authenticated;
grant all on table public.profile_comments to service_role;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'project_liked', 'project_favorited', 'project_commented', 'profile_commented',
    'announcement', 'event', 'follow'
  )) not valid;

create or replace function public.notify_profile_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_user_id <> new.user_id then
    insert into public.notifications (
      recipient_id, actor_id, actor_name, actor_avatar, notification_type,
      project_id, project_title, message
    ) values (
      new.profile_user_id, new.user_id, new.author, new.avatar_url,
      'profile_commented', null, null, new.text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_profile_comment() from public, anon, authenticated;

drop trigger if exists profile_comment_notification on public.profile_comments;
create trigger profile_comment_notification
after insert on public.profile_comments
for each row execute function public.notify_profile_comment();
