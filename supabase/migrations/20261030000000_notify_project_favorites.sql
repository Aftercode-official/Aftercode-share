alter table public.activities drop constraint if exists activities_activity_type_check;
alter table public.activities add constraint activities_activity_type_check
  check (activity_type in ('project_created', 'project_liked', 'project_favorited', 'project_commented')) not valid;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in ('project_liked', 'project_favorited', 'project_commented')) not valid;

alter table public.notifications add column if not exists actor_avatar text not null default '';
alter table public.activities add column if not exists actor_avatar text not null default '';

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
  actor_avatar_value text;
  engagement_type text;
begin
  select user_id, title into project_owner, project_name
  from public.projects
  where id = new.project_id;

  select coalesce(
    nullif(btrim(raw_user_meta_data ->> 'display_name'), ''),
    split_part(email, '@', 1),
    'Aftercode user'
  ), coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture', '')
  into actor_name_value, actor_avatar_value
  from auth.users
  where id = new.user_id;

  if tg_table_name = 'project_likes' then
    engagement_type := 'project_liked';
  elsif tg_table_name = 'project_favorites' then
    engagement_type := 'project_favorited';
  else
    engagement_type := 'project_commented';
  end if;

  insert into public.activities (actor_id, actor_name, actor_avatar, activity_type, project_id, project_title)
  values (new.user_id, actor_name_value, actor_avatar_value, engagement_type, new.project_id, project_name);

  if project_owner <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, actor_name, actor_avatar, notification_type, project_id, project_title)
    values (project_owner, new.user_id, actor_name_value, actor_avatar_value, engagement_type, new.project_id, project_name);
  end if;
  return new;
end;
$$;

drop trigger if exists project_favorite_activity on public.project_favorites;
create trigger project_favorite_activity
after insert on public.project_favorites
for each row execute function public.record_project_engagement();
