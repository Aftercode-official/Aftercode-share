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
      and profile_user_id = new.profile_user_id;
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
