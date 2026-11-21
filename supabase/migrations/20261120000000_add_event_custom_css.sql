alter table public.events
  add column if not exists custom_css text not null default '';
