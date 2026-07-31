create extension if not exists pgcrypto with schema extensions;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_key_hash char(64) not null unique,
  password_hash text not null,
  name varchar(80) not null,
  description varchar(500) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_length check (char_length(name) between 2 and 80),
  constraint projects_description_length check (char_length(description) <= 500),
  constraint projects_key_hash_format check (
    project_key_hash ~ '^[a-f0-9]{64}$'
  )
);

alter table public.projects enable row level security;
alter table public.projects force row level security;

revoke all on table public.projects from anon, authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create function public.create_project(
  p_name text,
  p_description text,
  p_password text,
  p_project_key_hash text
)
returns table (created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(trim(p_name)) not between 2 and 80
    or char_length(p_description) > 500
    or char_length(p_password) not between 8 and 72
    or p_project_key_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'invalid project input';
  end if;

  return query
  insert into public.projects (
    project_key_hash,
    password_hash,
    name,
    description
  )
  values (
    p_project_key_hash,
    extensions.crypt(p_password, extensions.gen_salt('bf', 12)),
    trim(p_name),
    trim(p_description)
  )
  returning projects.created_at, projects.updated_at;
end;
$$;

create function public.access_project(
  p_project_key_hash text,
  p_password text
)
returns table (
  name text,
  description text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    projects.name::text,
    projects.description::text,
    projects.created_at,
    projects.updated_at
  from public.projects
  where projects.project_key_hash = p_project_key_hash
    and projects.password_hash =
      extensions.crypt(p_password, projects.password_hash)
  limit 1;
$$;

revoke all on function public.create_project(text, text, text, text)
  from public;
revoke all on function public.access_project(text, text) from public;
grant execute on function public.create_project(text, text, text, text)
  to anon, authenticated;
grant execute on function public.access_project(text, text)
  to anon, authenticated;
