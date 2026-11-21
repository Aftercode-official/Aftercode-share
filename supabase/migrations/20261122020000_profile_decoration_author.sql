alter table public.profile_decorations
  add column if not exists author text not null default 'Aftercode';

alter table public.profile_decorations
  drop constraint if exists profile_decorations_author_check;

alter table public.profile_decorations
  add constraint profile_decorations_author_check
  check (char_length(author) between 1 and 60);
