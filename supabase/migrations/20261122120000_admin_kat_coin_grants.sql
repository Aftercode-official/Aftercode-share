create or replace function public.admin_grant_kat_coins(p_user_id uuid, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if p_amount < 1 or p_amount > 1000000000 then
    raise exception 'INVALID_KAT_COIN_AMOUNT';
  end if;

  insert into public.profile_decoration_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.profile_decoration_wallets
  set balance = balance + p_amount
  where user_id = p_user_id and balance <= 2147483647 - p_amount
  returning balance into v_balance;

  if v_balance is null then
    raise exception 'KAT_COIN_BALANCE_LIMIT';
  end if;

  insert into public.kat_coin_ledger (user_id, amount, balance_after, reason)
  values (p_user_id, p_amount, v_balance, 'admin_grant');

  return jsonb_build_object('balance', v_balance);
end;
$$;

revoke all on function public.admin_grant_kat_coins(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_grant_kat_coins(uuid, integer) to service_role;
