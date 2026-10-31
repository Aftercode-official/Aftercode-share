alter table public.projects
  add column if not exists view_count integer not null default 0 check (view_count >= 0);

create table if not exists public.project_view_dedup (
  project_id uuid not null references public.projects (id) on delete cascade,
  viewer_key text not null,
  last_viewed_at timestamptz not null default now(),
  primary key (project_id, viewer_key)
);

create table if not exists public.project_view_rate_limits (
  client_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.project_view_dedup enable row level security;
alter table public.project_view_rate_limits enable row level security;

create or replace function public.record_project_view(
  p_project_id uuid,
  p_viewer_key text,
  p_client_key text
)
returns table(view_count integer, counted boolean, rate_limited boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_count integer;
  v_counted boolean := false;
  v_view_count integer;
begin
  insert into public.project_view_rate_limits (client_key, window_started_at, request_count)
  values (p_client_key, pg_catalog.now(), 1)
  on conflict (client_key) do update
    set window_started_at = case
          when public.project_view_rate_limits.window_started_at <= pg_catalog.now() - interval '1 minute'
            then pg_catalog.now()
          else public.project_view_rate_limits.window_started_at
        end,
        request_count = case
          when public.project_view_rate_limits.window_started_at <= pg_catalog.now() - interval '1 minute'
            then 1
          else public.project_view_rate_limits.request_count + 1
        end
  returning public.project_view_rate_limits.request_count into v_request_count;

  if v_request_count > 120 then
    return query select 0, false, true;
    return;
  end if;

  insert into public.project_view_dedup (project_id, viewer_key, last_viewed_at)
  values (p_project_id, p_viewer_key, pg_catalog.now())
  on conflict (project_id, viewer_key) do update
    set last_viewed_at = excluded.last_viewed_at
    where public.project_view_dedup.last_viewed_at <= pg_catalog.now() - interval '24 hours'
  returning true into v_counted;

  v_counted := coalesce(v_counted, false);
  if v_counted then
    update public.projects
      set view_count = public.projects.view_count + 1
      where id = p_project_id
      returning public.projects.view_count into v_view_count;
  else
    select public.projects.view_count into v_view_count
      from public.projects
      where id = p_project_id;
  end if;

  return query select coalesce(v_view_count, 0), v_counted, false;
end;
$$;

revoke all on function public.record_project_view(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_project_view(uuid, text, text) to service_role;
