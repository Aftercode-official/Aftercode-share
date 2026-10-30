create or replace function public.replace_global_announcement(
  p_created_by uuid,
  p_title text,
  p_message text
)
returns public.announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  new_announcement public.announcements;
begin
  if p_created_by <> '5c7667c5-7119-44fc-bd62-28ba3d4507d0'::uuid then
    raise exception 'Only the Aftercode administrator can send announcements.';
  end if;

  delete from public.announcements;

  insert into public.announcements (created_by, title, message)
  values (p_created_by, p_title, p_message)
  returning * into new_announcement;

  return new_announcement;
end;
$$;

revoke all on function public.replace_global_announcement(uuid, text, text) from public, anon, authenticated;
grant execute on function public.replace_global_announcement(uuid, text, text) to service_role;
