alter table public.profiles
  drop constraint if exists profiles_avatar_frame_check;

alter table public.profiles
  add constraint profiles_avatar_frame_check
  check (
    avatar_frame in ('none', 'gold', 'neon', 'pixel', 'bear')
    or avatar_frame ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

create table if not exists public.profile_decorations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  author text not null default 'Aftercode' check (char_length(author) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  image_path text not null,
  price integer not null check (price between 1 and 100000),
  created_by uuid not null references auth.users (id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists profile_decorations_active_price_idx
  on public.profile_decorations (is_active, price, created_at desc);

create table if not exists public.profile_decoration_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 500 check (balance >= 0),
  daily_claimed_at timestamptz
);

create table if not exists public.user_profile_decorations (
  user_id uuid not null references auth.users (id) on delete cascade,
  decoration_id uuid not null references public.profile_decorations (id) on delete restrict,
  purchased_at timestamptz not null default now(),
  primary key (user_id, decoration_id)
);

alter table public.profile_decorations enable row level security;
alter table public.profile_decoration_wallets enable row level security;
alter table public.user_profile_decorations enable row level security;

revoke all on table public.profile_decorations from public, anon, authenticated;
revoke all on table public.profile_decoration_wallets from public, anon, authenticated;
revoke all on table public.user_profile_decorations from public, anon, authenticated;
grant all on table public.profile_decorations to service_role;
grant all on table public.profile_decoration_wallets to service_role;
grant all on table public.user_profile_decorations to service_role;

create or replace function public.ensure_profile_decoration_wallet(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.profile_decoration_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
$$;

create or replace function public.purchase_profile_decoration(p_user_id uuid, p_decoration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price integer;
  v_balance integer;
begin
  insert into public.profile_decoration_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.profile_decoration_wallets
  where user_id = p_user_id
  for update;

  if exists (
    select 1 from public.user_profile_decorations
    where user_id = p_user_id and decoration_id = p_decoration_id
  ) then
    raise exception 'DECORATION_ALREADY_OWNED';
  end if;

  select price into v_price
  from public.profile_decorations
  where id = p_decoration_id and is_active = true;

  if v_price is null then
    raise exception 'DECORATION_NOT_AVAILABLE';
  end if;
  if v_balance < v_price then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  update public.profile_decoration_wallets
  set balance = balance - v_price
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.user_profile_decorations (user_id, decoration_id)
  values (p_user_id, p_decoration_id);

  return jsonb_build_object('balance', v_balance);
end;
$$;

create or replace function public.claim_profile_decoration_daily_credits(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.profile_decoration_wallets%rowtype;
begin
  insert into public.profile_decoration_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_wallet
  from public.profile_decoration_wallets
  where user_id = p_user_id
  for update;

  if v_wallet.daily_claimed_at > now() - interval '24 hours' then
    raise exception 'DAILY_CREDITS_ALREADY_CLAIMED';
  end if;

  update public.profile_decoration_wallets
  set balance = balance + 100, daily_claimed_at = now()
  where user_id = p_user_id
  returning * into v_wallet;

  return jsonb_build_object(
    'balance', v_wallet.balance,
    'dailyClaimedAt', v_wallet.daily_claimed_at
  );
end;
$$;

revoke all on function public.ensure_profile_decoration_wallet(uuid) from public, anon, authenticated;
revoke all on function public.purchase_profile_decoration(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_profile_decoration_daily_credits(uuid) from public, anon, authenticated;
grant execute on function public.ensure_profile_decoration_wallet(uuid) to service_role;
grant execute on function public.purchase_profile_decoration(uuid, uuid) to service_role;
grant execute on function public.claim_profile_decoration_daily_credits(uuid) to service_role;
