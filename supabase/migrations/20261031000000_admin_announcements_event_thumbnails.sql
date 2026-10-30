alter table public.events add column if not exists thumbnail_url text;

alter table public.notifications add column if not exists message text not null default '';
alter table public.notifications add column if not exists thumbnail_url text;

do $migration$
declare
  events_id_type text;
  notification_event_id_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into events_id_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.events'::regclass
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  if events_id_type is null then
    raise exception 'Could not determine public.events.id type';
  end if;

  select format_type(attribute.atttypid, attribute.atttypmod)
    into notification_event_id_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.notifications'::regclass
    and attribute.attname = 'event_id'
    and not attribute.attisdropped;

  alter table public.notifications drop constraint if exists notifications_event_id_fkey;

  if notification_event_id_type is null then
    execute format('alter table public.notifications add column event_id %s', events_id_type);
  elsif notification_event_id_type <> events_id_type then
    execute format(
      'alter table public.notifications alter column event_id type %s using null::%s',
      events_id_type,
      events_id_type
    );
  end if;

  execute 'alter table public.notifications add constraint notifications_event_id_fkey '
    || 'foreign key (event_id) references public.events (id) on delete set null';
end;
$migration$;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in ('project_liked', 'project_favorited', 'project_commented', 'announcement', 'event')) not valid;

create index if not exists notifications_event_idx
  on public.notifications (event_id)
  where event_id is not null;
