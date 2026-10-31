create sequence if not exists public.projects_project_number_seq;

alter table public.projects
  add column if not exists project_number bigint;

with numbered_projects as (
  select
    id,
    row_number() over (order by created_at asc, id asc)
      + (select coalesce(max(project_number), 0) from public.projects) as project_number
  from public.projects
  where project_number is null
)
update public.projects as projects
set project_number = numbered_projects.project_number
from numbered_projects
where projects.id = numbered_projects.id;

select setval(
  'public.projects_project_number_seq',
  coalesce(max(project_number), 1),
  max(project_number) is not null
)
from public.projects;

alter table public.projects
  alter column project_number set default nextval('public.projects_project_number_seq'),
  alter column project_number set not null;

alter sequence public.projects_project_number_seq
  owned by public.projects.project_number;

create unique index if not exists projects_project_number_key
  on public.projects (project_number);
