create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0 check (count >= 0),
  reset_at timestamptz not null
);

create index if not exists rate_limits_reset_at_idx
  on public.rate_limits (reset_at);

alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limits(p_rules jsonb)
returns table(allowed boolean, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule jsonb;
  v_key text;
  v_max_requests integer;
  v_window_seconds integer;
  v_count integer;
  v_reset_at timestamptz;
  v_allowed boolean := true;
  v_remaining integer := 2147483647;
  v_retry_after integer := 0;
begin
  if jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Rate limit rules must be an array.';
  end if;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    v_key := v_rule ->> 'key';
    v_max_requests := (v_rule ->> 'maxRequests')::integer;
    v_window_seconds := (v_rule ->> 'windowSeconds')::integer;
    if v_key is null or char_length(v_key) > 240
      or v_max_requests < 1 or v_max_requests > 1000000
      or v_window_seconds < 1 or v_window_seconds > 86400 then
      raise exception 'Invalid rate limit rule.';
    end if;

    insert into public.rate_limits as current_limit (key, count, reset_at)
    values (v_key, 1, pg_catalog.now() + pg_catalog.make_interval(secs => v_window_seconds))
    on conflict (key) do update
      set count = case
            when current_limit.reset_at <= pg_catalog.now() then 1
            else current_limit.count + 1
          end,
          reset_at = case
            when current_limit.reset_at <= pg_catalog.now()
              then pg_catalog.now() + pg_catalog.make_interval(secs => v_window_seconds)
            else current_limit.reset_at
          end
    returning current_limit.count, current_limit.reset_at into v_count, v_reset_at;

    if v_count > v_max_requests then
      v_allowed := false;
      v_remaining := 0;
      v_retry_after := greatest(
        v_retry_after,
        ceil(extract(epoch from (v_reset_at - pg_catalog.now())))::integer
      );
    else
      v_remaining := least(v_remaining, v_max_requests - v_count);
    end if;
  end loop;

  if v_remaining = 2147483647 then
    v_remaining := 0;
  end if;
  return query select v_allowed, v_remaining, v_retry_after;
end;
$$;

revoke all on table public.rate_limits from public, anon, authenticated;
revoke all on function public.consume_rate_limits(jsonb) from public, anon, authenticated;
grant execute on function public.consume_rate_limits(jsonb) to service_role;

create or replace function public.enforce_storage_upload_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_key text;
  v_limit integer;
  v_count integer;
begin
  if new.bucket_id = 'chat-media' then
    v_limit := 12;
  elsif new.bucket_id = 'project-files' then
    v_limit := 6;
  else
    return new;
  end if;

  v_user_id := (storage.foldername(new.name))[1]::uuid;
  v_key := 'storage-upload:' || new.bucket_id || ':' || v_user_id::text;
  insert into public.rate_limits as current_limit (key, count, reset_at)
  values (v_key, 1, pg_catalog.now() + interval '1 minute')
  on conflict (key) do update
    set count = case
          when current_limit.reset_at <= pg_catalog.now() then 1
          else current_limit.count + 1
        end,
        reset_at = case
          when current_limit.reset_at <= pg_catalog.now()
            then pg_catalog.now() + interval '1 minute'
          else current_limit.reset_at
        end
  returning current_limit.count into v_count;

  if v_count > v_limit then
    raise exception 'Upload request limit exceeded. Try again shortly.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_storage_upload_rate_limit() from public, anon, authenticated;

drop trigger if exists enforce_storage_upload_rate_limit on storage.objects;
create trigger enforce_storage_upload_rate_limit
before insert on storage.objects
for each row execute function public.enforce_storage_upload_rate_limit();
