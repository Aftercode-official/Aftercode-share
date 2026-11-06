alter table public.events
  add column if not exists banner_html text not null default ''
  check (char_length(banner_html) <= 10000);
