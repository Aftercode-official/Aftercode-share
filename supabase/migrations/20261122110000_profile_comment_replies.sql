alter table public.profile_comments
  add column if not exists parent_id uuid references public.profile_comments (id) on delete cascade;

create index if not exists profile_comments_parent_created_idx
  on public.profile_comments (parent_id, created_at asc)
  where parent_id is not null;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'project_liked', 'project_favorited', 'project_commented', 'profile_commented',
    'profile_comment_replied', 'announcement', 'event', 'follow'
  )) not valid;

create or replace function public.notify_profile_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_recipient uuid := new.profile_user_id;
  notification_kind text := 'profile_commented';
begin
  if new.parent_id is not null then
    select user_id into notification_recipient
    from public.profile_comments
    where id = new.parent_id
      and profile_user_id = new.profile_user_id
      and parent_id is null;
    notification_kind := 'profile_comment_replied';
  end if;

  if notification_recipient is not null and notification_recipient <> new.user_id then
    insert into public.notifications (
      recipient_id, actor_id, actor_name, actor_avatar, notification_type,
      project_id, project_title, message
    ) values (
      notification_recipient, new.user_id, new.author, new.avatar_url,
      notification_kind, null, null, new.text
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_profile_comment() from public, anon, authenticated;
