-- Kat Coin & Missions with Anti-Spam & Anti-Cheat

create table if not exists public.kat_coin_mission_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mission_key text not null check (char_length(mission_key) between 1 and 64),
  period_key text not null check (char_length(period_key) between 1 and 32),
  reward integer not null check (reward > 0),
  claimed_at timestamptz not null default now(),
  constraint kat_coin_mission_claims_unique unique (user_id, mission_key, period_key)
);

create table if not exists public.kat_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists kat_coin_claims_user_period_idx
  on public.kat_coin_mission_claims (user_id, period_key);
create index if not exists kat_coin_ledger_user_idx
  on public.kat_coin_ledger (user_id, created_at desc);

alter table public.kat_coin_mission_claims enable row level security;
alter table public.kat_coin_ledger enable row level security;

revoke all on table public.kat_coin_mission_claims from public, anon, authenticated;
revoke all on table public.kat_coin_ledger from public, anon, authenticated;
grant all on table public.kat_coin_mission_claims to service_role;
grant all on table public.kat_coin_ledger to service_role;

create or replace function public.get_kat_coin_missions_status(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today text;
  v_today_start timestamptz;
  v_balance integer;
  v_likes_count integer := 0;
  v_chats_count integer := 0;
  v_favs_count integer := 0;
  v_publish_count integer := 0;
  v_has_profile boolean := false;
  v_claims record;
  v_missions jsonb := '[]'::jsonb;
  v_daily_checkin_claimed boolean := false;
  v_daily_like_claimed boolean := false;
  v_daily_chat_claimed boolean := false;
  v_daily_fav_claimed boolean := false;
  v_daily_publish_claimed boolean := false;
  v_milestone_profile_claimed boolean := false;
begin
  perform public.ensure_profile_decoration_wallet(p_user_id);

  select balance into v_balance
  from public.profile_decoration_wallets
  where user_id = p_user_id;

  v_today := to_char(pg_catalog.now() at time zone 'utc', 'YYYY-MM-DD');
  v_today_start := (pg_catalog.now() at time zone 'utc')::date;

  -- Read claimed missions
  select
    bool_or(mission_key = 'daily_checkin' and period_key = v_today) as c_checkin,
    bool_or(mission_key = 'daily_like' and period_key = v_today) as c_like,
    bool_or(mission_key = 'daily_chat' and period_key = v_today) as c_chat,
    bool_or(mission_key = 'daily_fav' and period_key = v_today) as c_fav,
    bool_or(mission_key = 'daily_publish' and period_key = v_today) as c_publish,
    bool_or(mission_key = 'milestone_profile' and period_key = 'lifetime') as c_profile
  into
    v_daily_checkin_claimed,
    v_daily_like_claimed,
    v_daily_chat_claimed,
    v_daily_fav_claimed,
    v_daily_publish_claimed,
    v_milestone_profile_claimed
  from public.kat_coin_mission_claims
  where user_id = p_user_id and (period_key = v_today or period_key = 'lifetime');

  v_daily_checkin_claimed := coalesce(v_daily_checkin_claimed, false);
  v_daily_like_claimed := coalesce(v_daily_like_claimed, false);
  v_daily_chat_claimed := coalesce(v_daily_chat_claimed, false);
  v_daily_fav_claimed := coalesce(v_daily_fav_claimed, false);
  v_daily_publish_claimed := coalesce(v_daily_publish_claimed, false);
  v_milestone_profile_claimed := coalesce(v_milestone_profile_claimed, false);

  -- Real progress calculations directly from database
  select coalesce(count(distinct project_id), 0) into v_likes_count
  from public.project_likes
  where user_id = p_user_id and created_at >= v_today_start;

  select coalesce(count(*), 0) into v_chats_count
  from public.chat_messages
  where user_id = p_user_id and created_at >= v_today_start;

  select coalesce(count(distinct project_id), 0) into v_favs_count
  from public.project_favorites
  where user_id = p_user_id and created_at >= v_today_start;

  select coalesce(count(*), 0) into v_publish_count
  from public.projects
  where user_id = p_user_id and created_at >= v_today_start;

  select exists(
    select 1 from public.profiles
    where user_id = p_user_id
      and bio is not null and char_length(trim(bio)) > 0
      and avatar_url is not null and char_length(trim(avatar_url)) > 0
  ) into v_has_profile;

  -- Build missions list
  v_missions := jsonb_build_array(
    jsonb_build_object(
      'key', 'daily_checkin',
      'title', 'Điểm danh hàng ngày',
      'titleEn', 'Daily Check-in',
      'description', 'Đăng nhập và nhận Kat Coin mỗi ngày.',
      'type', 'daily',
      'reward', 100,
      'progress', 1,
      'target', 1,
      'completed', true,
      'claimed', v_daily_checkin_claimed
    ),
    jsonb_build_object(
      'key', 'daily_like',
      'title', 'Thả tim dự án',
      'titleEn', 'Spread the Love',
      'description', 'Thả tim cho 2 dự án bạn yêu thích hôm nay.',
      'type', 'daily',
      'reward', 40,
      'progress', least(v_likes_count, 2),
      'target', 2,
      'completed', v_likes_count >= 2,
      'claimed', v_daily_like_claimed
    ),
    jsonb_build_object(
      'key', 'daily_chat',
      'title', 'Giao lưu cộng đồng',
      'titleEn', 'Community Chatter',
      'description', 'Gửi ít nhất 2 tin nhắn trong phòng Chat hôm nay.',
      'type', 'daily',
      'reward', 30,
      'progress', least(v_chats_count, 2),
      'target', 2,
      'completed', v_chats_count >= 2,
      'claimed', v_daily_chat_claimed
    ),
    jsonb_build_object(
      'key', 'daily_fav',
      'title', 'Bộ sưu tập yêu thích',
      'titleEn', 'Favorite a Project',
      'description', 'Lưu 1 dự án xuất sắc vào danh sách yêu thích hôm nay.',
      'type', 'daily',
      'reward', 30,
      'progress', least(v_favs_count, 1),
      'target', 1,
      'completed', v_favs_count >= 1,
      'claimed', v_daily_fav_claimed
    ),
    jsonb_build_object(
      'key', 'daily_publish',
      'title', 'Nhà sáng tạo chăm chỉ',
      'titleEn', 'Publish a Project',
      'description', 'Đăng tải 1 dự án mới hôm nay lên Aftercode.',
      'type', 'daily',
      'reward', 150,
      'progress', least(v_publish_count, 1),
      'target', 1,
      'completed', v_publish_count >= 1,
      'claimed', v_daily_publish_claimed
    ),
    jsonb_build_object(
      'key', 'milestone_profile',
      'title', 'Hoàn thiện hồ sơ',
      'titleEn', 'Profile Pioneer',
      'description', 'Cập nhật ảnh đại diện và tiểu sử cá nhân.',
      'type', 'milestone',
      'reward', 80,
      'progress', case when v_has_profile then 1 else 0 end,
      'target', 1,
      'completed', v_has_profile,
      'claimed', v_milestone_profile_claimed
    )
  );

  return jsonb_build_object(
    'balance', coalesce(v_balance, 0),
    'missions', v_missions
  );
end;
$$;

create or replace function public.claim_kat_coin_mission(p_user_id uuid, p_mission_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today text;
  v_today_start timestamptz;
  v_period_key text;
  v_reward integer;
  v_balance integer;
  v_eligible boolean := false;
  v_count integer := 0;
begin
  perform public.ensure_profile_decoration_wallet(p_user_id);

  v_today := to_char(pg_catalog.now() at time zone 'utc', 'YYYY-MM-DD');
  v_today_start := (pg_catalog.now() at time zone 'utc')::date;

  if p_mission_key in ('daily_checkin', 'daily_like', 'daily_chat', 'daily_fav', 'daily_publish') then
    v_period_key := v_today;
  elsif p_mission_key in ('milestone_profile') then
    v_period_key := 'lifetime';
  else
    raise exception 'INVALID_MISSION_KEY';
  end if;

  -- Check if already claimed
  if exists (
    select 1 from public.kat_coin_mission_claims
    where user_id = p_user_id and mission_key = p_mission_key and period_key = v_period_key
  ) then
    raise exception 'MISSION_ALREADY_CLAIMED';
  end if;

  -- Server-side validation of mission requirements
  if p_mission_key = 'daily_checkin' then
    v_eligible := true;
    v_reward := 100;
  elsif p_mission_key = 'daily_like' then
    select coalesce(count(distinct project_id), 0) into v_count
    from public.project_likes
    where user_id = p_user_id and created_at >= v_today_start;
    v_eligible := (v_count >= 2);
    v_reward := 40;
  elsif p_mission_key = 'daily_chat' then
    select coalesce(count(*), 0) into v_count
    from public.chat_messages
    where user_id = p_user_id and created_at >= v_today_start;
    v_eligible := (v_count >= 2);
    v_reward := 30;
  elsif p_mission_key = 'daily_fav' then
    select coalesce(count(distinct project_id), 0) into v_count
    from public.project_favorites
    where user_id = p_user_id and created_at >= v_today_start;
    v_eligible := (v_count >= 1);
    v_reward := 30;
  elsif p_mission_key = 'daily_publish' then
    select coalesce(count(*), 0) into v_count
    from public.projects
    where user_id = p_user_id and created_at >= v_today_start;
    v_eligible := (v_count >= 1);
    v_reward := 150;
  elsif p_mission_key = 'milestone_profile' then
    select exists(
      select 1 from public.profiles
      where user_id = p_user_id
        and bio is not null and char_length(trim(bio)) > 0
        and avatar_url is not null and char_length(trim(avatar_url)) > 0
    ) into v_eligible;
    v_reward := 80;
  end if;

  if not v_eligible then
    raise exception 'MISSION_NOT_COMPLETED';
  end if;

  -- Lock wallet row to prevent concurrent race condition exploits
  select balance into v_balance
  from public.profile_decoration_wallets
  where user_id = p_user_id
  for update;

  -- Record claim
  insert into public.kat_coin_mission_claims (user_id, mission_key, period_key, reward)
  values (p_user_id, p_mission_key, v_period_key, v_reward);

  -- Credit wallet
  update public.profile_decoration_wallets
  set balance = balance + v_reward,
      daily_claimed_at = case when p_mission_key = 'daily_checkin' then pg_catalog.now() else daily_claimed_at end
  where user_id = p_user_id
  returning balance into v_balance;

  -- Record audit ledger entry
  insert into public.kat_coin_ledger (user_id, amount, balance_after, reason)
  values (p_user_id, v_reward, v_balance, 'mission:' || p_mission_key || ':' || v_period_key);

  return jsonb_build_object(
    'success', true,
    'missionKey', p_mission_key,
    'reward', v_reward,
    'balance', v_balance
  );
end;
$$;

revoke all on function public.get_kat_coin_missions_status(uuid) from public, anon, authenticated;
revoke all on function public.claim_kat_coin_mission(uuid, text) from public, anon, authenticated;
grant execute on function public.get_kat_coin_missions_status(uuid) to service_role;
grant execute on function public.claim_kat_coin_mission(uuid, text) to service_role;
