create table public.project_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint project_sessions_token_hash_format check (
    token_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint project_sessions_expiry_after_creation check (
    expires_at > created_at
  )
);

create index project_sessions_project_id_idx
  on public.project_sessions(project_id);
create index project_sessions_expires_at_idx
  on public.project_sessions(expires_at);

alter table public.project_sessions enable row level security;
alter table public.project_sessions force row level security;
revoke all on table public.project_sessions from anon, authenticated;

create table public.repositories (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null default 'github',
  github_repository_id text not null,
  owner varchar(100) not null,
  name varchar(100) not null,
  url varchar(300) not null,
  visibility text not null,
  purpose varchar(500) not null default '',
  default_branch varchar(255) not null,
  token_ciphertext text,
  token_nonce text,
  token_auth_tag text,
  token_key_version smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repositories_provider_github check (provider = 'github'),
  constraint repositories_visibility check (
    visibility in ('public', 'private')
  ),
  constraint repositories_owner_length check (
    char_length(owner) between 1 and 100
  ),
  constraint repositories_name_length check (
    char_length(name) between 1 and 100
  ),
  constraint repositories_url_format check (
    url ~ '^https://github\.com/[^/]+/[^/]+$'
  ),
  constraint repositories_purpose_length check (
    char_length(purpose) <= 500
  ),
  constraint repositories_private_token_required check (
    (
      visibility = 'public'
      and token_ciphertext is null
      and token_nonce is null
      and token_auth_tag is null
      and token_key_version is null
    )
    or
    (
      visibility = 'private'
      and token_ciphertext is not null
      and token_nonce is not null
      and token_auth_tag is not null
      and token_key_version is not null
    )
  )
);

create unique index repositories_project_github_id_unique
  on public.repositories(project_id, github_repository_id);
create unique index repositories_project_owner_name_unique
  on public.repositories(project_id, lower(owner), lower(name));
create index repositories_project_id_idx
  on public.repositories(project_id);

alter table public.repositories enable row level security;
alter table public.repositories force row level security;
revoke all on table public.repositories from anon, authenticated;

create trigger repositories_set_updated_at
before update on public.repositories
for each row execute function public.set_updated_at();

create function public.create_project_session(
  p_project_key_hash text,
  p_password text,
  p_session_token_hash text
)
returns table (
  project_name text,
  project_description text,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if p_project_key_hash !~ '^[a-f0-9]{64}$'
    or p_session_token_hash !~ '^[a-f0-9]{64}$'
    or char_length(p_password) not between 8 and 72
  then
    return;
  end if;

  select projects.*
  into v_project
  from public.projects
  where projects.project_key_hash = p_project_key_hash
    and projects.password_hash =
      extensions.crypt(p_password, projects.password_hash)
  limit 1;

  if not found then
    return;
  end if;

  insert into public.project_sessions (
    project_id,
    token_hash,
    expires_at
  )
  values (
    v_project.id,
    p_session_token_hash,
    v_expires_at
  );

  return query
  select
    v_project.name::text,
    v_project.description::text,
    v_project.created_at,
    v_project.updated_at,
    v_expires_at;
end;
$$;

create function public.get_project_workspace(
  p_session_token_hash text
)
returns table (
  project_name text,
  project_description text,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz
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
    projects.updated_at,
    project_sessions.expires_at
  from public.project_sessions
  join public.projects
    on projects.id = project_sessions.project_id
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
  limit 1;
$$;

create function public.list_project_repositories(
  p_session_token_hash text
)
returns table (
  id uuid,
  github_repository_id text,
  owner text,
  name text,
  url text,
  visibility text,
  purpose text,
  default_branch text,
  has_stored_token boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    repositories.id,
    repositories.github_repository_id,
    repositories.owner::text,
    repositories.name::text,
    repositories.url::text,
    repositories.visibility,
    repositories.purpose::text,
    repositories.default_branch::text,
    repositories.token_ciphertext is not null,
    repositories.created_at,
    repositories.updated_at
  from public.project_sessions
  join public.repositories
    on repositories.project_id = project_sessions.project_id
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
  order by repositories.created_at desc;
$$;

create function public.add_project_repository(
  p_session_token_hash text,
  p_repository_id uuid,
  p_github_repository_id text,
  p_owner text,
  p_name text,
  p_url text,
  p_visibility text,
  p_purpose text,
  p_default_branch text,
  p_token_ciphertext text,
  p_token_nonce text,
  p_token_auth_tag text,
  p_token_key_version smallint
)
returns table (
  id uuid,
  github_repository_id text,
  owner text,
  name text,
  url text,
  visibility text,
  purpose text,
  default_branch text,
  has_stored_token boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select project_sessions.project_id
  into v_project_id
  from public.project_sessions
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
  limit 1;

  if not found then
    return;
  end if;

  if char_length(p_github_repository_id) not between 1 and 40
    or char_length(p_owner) not between 1 and 100
    or char_length(p_name) not between 1 and 100
    or char_length(p_url) > 300
    or p_url !~ '^https://github\.com/[^/]+/[^/]+$'
    or p_visibility not in ('public', 'private')
    or char_length(p_purpose) > 500
    or char_length(p_default_branch) not between 1 and 255
    or (
      p_visibility = 'public'
      and (
        p_token_ciphertext is not null
        or p_token_nonce is not null
        or p_token_auth_tag is not null
        or p_token_key_version is not null
      )
    )
    or (
      p_visibility = 'private'
      and (
        p_token_ciphertext is null
        or p_token_nonce is null
        or p_token_auth_tag is null
        or p_token_key_version is null
      )
    )
  then
    raise exception 'invalid repository input';
  end if;

  return query
  insert into public.repositories (
    id,
    project_id,
    github_repository_id,
    owner,
    name,
    url,
    visibility,
    purpose,
    default_branch,
    token_ciphertext,
    token_nonce,
    token_auth_tag,
    token_key_version
  )
  values (
    p_repository_id,
    v_project_id,
    p_github_repository_id,
    p_owner,
    p_name,
    p_url,
    p_visibility,
    p_purpose,
    p_default_branch,
    p_token_ciphertext,
    p_token_nonce,
    p_token_auth_tag,
    p_token_key_version
  )
  returning
    repositories.id,
    repositories.github_repository_id,
    repositories.owner::text,
    repositories.name::text,
    repositories.url::text,
    repositories.visibility,
    repositories.purpose::text,
    repositories.default_branch::text,
    repositories.token_ciphertext is not null,
    repositories.created_at,
    repositories.updated_at;

  update public.projects
  set updated_at = now()
  where projects.id = v_project_id;
end;
$$;

create function public.get_repository_secret(
  p_session_token_hash text,
  p_repository_id uuid
)
returns table (
  token_ciphertext text,
  token_nonce text,
  token_auth_tag text,
  token_key_version smallint
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    repositories.token_ciphertext,
    repositories.token_nonce,
    repositories.token_auth_tag,
    repositories.token_key_version
  from public.project_sessions
  join public.repositories
    on repositories.project_id = project_sessions.project_id
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
    and repositories.id = p_repository_id
    and repositories.token_ciphertext is not null
  limit 1;
$$;

create function public.revoke_project_session(
  p_session_token_hash text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.project_sessions
  where project_sessions.token_hash = p_session_token_hash;
$$;

revoke all on function public.create_project_session(text, text, text)
  from public;
revoke all on function public.get_project_workspace(text) from public;
revoke all on function public.list_project_repositories(text) from public;
revoke all on function public.add_project_repository(
  text, uuid, text, text, text, text, text, text, text, text, text, text, smallint
) from public;
revoke all on function public.get_repository_secret(text, uuid) from public;
revoke all on function public.revoke_project_session(text) from public;

grant execute on function public.create_project_session(text, text, text)
  to anon, authenticated;
grant execute on function public.get_project_workspace(text)
  to anon, authenticated;
grant execute on function public.list_project_repositories(text)
  to anon, authenticated;
grant execute on function public.add_project_repository(
  text, uuid, text, text, text, text, text, text, text, text, text, text, smallint
) to anon, authenticated;
grant execute on function public.get_repository_secret(text, uuid)
  to anon, authenticated;
grant execute on function public.revoke_project_session(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
