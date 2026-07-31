create table public.project_repository_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name varchar(100) not null,
  description varchar(500) not null default '',
  repositories jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_repository_groups_repositories_array check (
    jsonb_typeof(repositories) = 'array'
    and jsonb_array_length(repositories) between 1 and 200
  )
);

create unique index project_repository_groups_project_name_unique
  on public.project_repository_groups(project_id, lower(name));
create index project_repository_groups_project_id_idx
  on public.project_repository_groups(project_id);

alter table public.project_repository_groups enable row level security;
alter table public.project_repository_groups force row level security;
revoke all on table public.project_repository_groups from anon, authenticated;

create trigger project_repository_groups_set_updated_at
before update on public.project_repository_groups
for each row execute function public.set_updated_at();

create table public.project_llm_connectors (
  project_id uuid not null references public.projects(id) on delete cascade,
  connector text not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, connector),
  constraint project_llm_connectors_type check (
    connector in (
      'openai', 'anthropic', 'gemini', 'azure_openai', 'bedrock', 'vertex_ai'
    )
  ),
  constraint project_llm_connectors_no_secrets check (
    summary::text !~* '"(credential|apiKey|accessToken|bearerToken|password|secretAccessKey|sessionToken|accessKeyId)"[[:space:]]*:'
  )
);

alter table public.project_llm_connectors enable row level security;
alter table public.project_llm_connectors force row level security;
revoke all on table public.project_llm_connectors from anon, authenticated;

create trigger project_llm_connectors_set_updated_at
before update on public.project_llm_connectors
for each row execute function public.set_updated_at();

create or replace function public.delete_project_repository(
  p_session_token_hash text,
  p_repository_id uuid,
  p_repository_name text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_deleted_id uuid;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return false; end if;

  if exists (
    select 1
    from public.project_repository_groups groups
    cross join lateral jsonb_array_elements(groups.repositories) repository
    where groups.project_id = v_project_id
      and repository ->> 'repositoryId' = p_repository_id::text
  ) then return false; end if;

  delete from public.repositories
  where repositories.id = p_repository_id
    and repositories.project_id = v_project_id
    and repositories.name = p_repository_name
  returning repositories.id into v_deleted_id;
  if v_deleted_id is null then return false; end if;

  update public.projects set updated_at = now()
  where projects.id = v_project_id;
  return true;
end;
$$;

insert into public.project_repository_groups (
  id, project_id, name, description, repositories
)
select
  gen_random_uuid(),
  source.project_id,
  source.repository_group ->> 'name',
  coalesce(source.repository_group ->> 'description', ''),
  (
    select jsonb_agg(
      repository || jsonb_build_object('folderPath', '', 'logicalContext', '')
    )
    from jsonb_array_elements(source.repository_group -> 'repositories') repository
  )
from (
  select distinct on (
    document_agents.project_id,
    lower(repository_group ->> 'name')
  )
    document_agents.project_id,
    repository_group
  from public.document_agents
  cross join lateral jsonb_array_elements(
    document_agents.repository_groups
  ) repository_group
  order by
    document_agents.project_id,
    lower(repository_group ->> 'name'),
    document_agents.updated_at desc
) source
where jsonb_array_length(source.repository_group -> 'repositories') > 0;

insert into public.project_llm_connectors (
  project_id, connector, summary
)
select
  source.project_id,
  source.connector ->> 'connector',
  source.connector
from (
  select distinct on (
    document_agents.project_id,
    connector ->> 'connector'
  )
    document_agents.project_id,
    connector
  from public.document_agents
  cross join lateral jsonb_array_elements(document_agents.connectors) connector
  order by
    document_agents.project_id,
    connector ->> 'connector',
    document_agents.updated_at desc
) source;

update public.document_agents agent
set skills = coalesce((
  select jsonb_agg(
    (skill - 'repositoryGroup') ||
    jsonb_build_object('repositoryGroupId', repository_group.id)
  )
  from jsonb_array_elements(agent.skills) skill
  join public.project_repository_groups repository_group
    on repository_group.project_id = agent.project_id
   and repository_group.name = skill ->> 'repositoryGroup'
), '[]'::jsonb);

drop function public.create_document_agent(text, text, text, jsonb, jsonb, text);
drop function public.list_document_agents(text);
drop function public.update_document_agent(
  text, uuid, text, text, jsonb, jsonb, text, jsonb
);

alter table public.document_agents
  drop constraint document_agents_repository_groups_array,
  drop constraint document_agents_connectors_array,
  drop constraint document_agents_no_connector_secrets,
  drop column repository_groups,
  drop column connectors;

create function public.list_project_repository_groups(p_session_token_hash text)
returns table (
  id uuid,
  name text,
  description text,
  repositories jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select
    groups.id,
    groups.name::text,
    groups.description::text,
    groups.repositories,
    groups.created_at,
    groups.updated_at
  from public.project_sessions sessions
  join public.project_repository_groups groups
    on groups.project_id = sessions.project_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  order by lower(groups.name);
$$;

create function public.save_project_repository_group(
  p_session_token_hash text,
  p_group_id uuid,
  p_name text,
  p_description text,
  p_repositories jsonb
)
returns table (
  id uuid,
  name text,
  description text,
  repositories jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_repository jsonb;
  v_repository_id uuid;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  if char_length(trim(coalesce(p_name, ''))) not between 1 and 100
    or char_length(trim(coalesce(p_description, ''))) > 500
    or jsonb_typeof(p_repositories) is distinct from 'array'
    or jsonb_array_length(p_repositories) not between 1 and 200
    or (
      select count(distinct concat(
        repository ->> 'repositoryId', ':',
        repository ->> 'branch', ':',
        repository ->> 'folderPath'
      ))
      from jsonb_array_elements(p_repositories) repository
    ) <> jsonb_array_length(p_repositories)
  then
    raise exception 'invalid repository group input';
  end if;

  for v_repository in select value from jsonb_array_elements(p_repositories)
  loop
    begin
      v_repository_id := (v_repository ->> 'repositoryId')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid repository reference';
    end;

    if jsonb_typeof(v_repository) is distinct from 'object'
      or char_length(trim(coalesce(v_repository ->> 'branch', ''))) not between 1 and 255
      or char_length(coalesce(v_repository ->> 'folderPath', '')) > 1024
      or coalesce(v_repository ->> 'folderPath', '') ~ '(^/|/$|(^|/)\.\.?(/|$))'
      or position(chr(92) in coalesce(v_repository ->> 'folderPath', '')) > 0
      or char_length(coalesce(v_repository ->> 'logicalContext', '')) > 1000
      or not exists (
        select 1 from public.repositories repositories
        where repositories.id = v_repository_id
          and repositories.project_id = v_project_id
      )
    then
      raise exception 'invalid repository reference';
    end if;
  end loop;

  return query
  insert into public.project_repository_groups (
    id, project_id, name, description, repositories
  )
  values (
    p_group_id, v_project_id, trim(p_name), trim(p_description), p_repositories
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    repositories = excluded.repositories
  where project_repository_groups.project_id = v_project_id
  returning
    project_repository_groups.id,
    project_repository_groups.name::text,
    project_repository_groups.description::text,
    project_repository_groups.repositories,
    project_repository_groups.created_at,
    project_repository_groups.updated_at;
end;
$$;

create function public.delete_project_repository_group(
  p_session_token_hash text,
  p_group_id uuid
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return false; end if;

  if exists (
    select 1
    from public.document_agents agents
    cross join lateral jsonb_array_elements(agents.skills) skill
    where agents.project_id = v_project_id
      and skill ->> 'repositoryGroupId' = p_group_id::text
  ) then return false; end if;

  delete from public.project_repository_groups
  where project_repository_groups.id = p_group_id
    and project_repository_groups.project_id = v_project_id;
  return found;
end;
$$;

create function public.list_project_llm_connectors(p_session_token_hash text)
returns table (
  connector text,
  summary jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select connectors.connector, connectors.summary,
    connectors.created_at, connectors.updated_at
  from public.project_sessions sessions
  join public.project_llm_connectors connectors
    on connectors.project_id = sessions.project_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  order by connectors.created_at;
$$;

create function public.save_project_llm_connector(
  p_session_token_hash text,
  p_connector text,
  p_summary jsonb
)
returns table (
  connector text,
  summary jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_verified_at timestamptz;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  begin
    v_verified_at := (p_summary ->> 'verifiedAt')::timestamptz;
  exception when invalid_datetime_format then
    raise exception 'invalid connector verification time';
  end;

  if p_connector not in (
      'openai', 'anthropic', 'gemini', 'azure_openai', 'bedrock', 'vertex_ai'
    )
    or jsonb_typeof(p_summary) is distinct from 'object'
    or p_summary ->> 'connector' <> p_connector
    or p_summary ->> 'status' <> 'connected'
    or v_verified_at is null
    or p_summary::text ~* '"(credential|apiKey|accessToken|bearerToken|password|secretAccessKey|sessionToken|accessKeyId)"[[:space:]]*:'
    or not coalesce((
      (p_connector = 'openai'
        and p_summary ->> 'authenticationMethod' in ('api_key', 'access_token'))
      or (p_connector = 'anthropic'
        and p_summary ->> 'authenticationMethod' in ('api_key', 'bearer_token'))
      or (p_connector = 'gemini'
        and p_summary ->> 'authenticationMethod' in (
          'standard_api_key', 'authorization_api_key'
        ))
      or (p_connector = 'azure_openai'
        and p_summary ->> 'authenticationMethod' in ('api_key', 'entra_token')
        and char_length(p_summary ->> 'endpoint') between 1 and 512)
      or (p_connector = 'bedrock'
        and p_summary ->> 'authenticationMethod' = 'aws_access_keys'
        and char_length(p_summary ->> 'region') between 1 and 32)
      or (p_connector = 'vertex_ai'
        and p_summary ->> 'authenticationMethod' = 'oauth_access_token'
        and char_length(p_summary ->> 'projectId') between 1 and 63
        and char_length(p_summary ->> 'location') between 1 and 64)
    ), false)
  then raise exception 'invalid connector input'; end if;

  return query
  insert into public.project_llm_connectors (project_id, connector, summary)
  values (v_project_id, p_connector, p_summary)
  on conflict (project_id, connector) do update
    set summary = excluded.summary
  returning
    project_llm_connectors.connector,
    project_llm_connectors.summary,
    project_llm_connectors.created_at,
    project_llm_connectors.updated_at;
end;
$$;

create function public.delete_project_llm_connector(
  p_session_token_hash text,
  p_connector text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return false; end if;

  if exists (
    select 1 from public.document_agents agents
    where agents.project_id = v_project_id
      and (
        agents.default_connector = p_connector
        or exists (
          select 1 from jsonb_array_elements(agents.skills) skill
          where skill ->> 'connector' = p_connector
        )
      )
  ) then return false; end if;

  delete from public.project_llm_connectors
  where project_llm_connectors.project_id = v_project_id
    and project_llm_connectors.connector = p_connector;
  return found;
end;
$$;

create function public.create_document_agent(
  p_session_token_hash text,
  p_name text,
  p_description text,
  p_default_connector text
)
returns table (
  id uuid, name text, description text, default_connector text,
  skills jsonb, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare v_project_id uuid;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_description, ''))) > 800
    or not exists (
      select 1 from public.project_llm_connectors connectors
      where connectors.project_id = v_project_id
        and connectors.connector = p_default_connector
    )
  then raise exception 'invalid document agent input'; end if;

  return query insert into public.document_agents (
    project_id, name, description, default_connector
  ) values (
    v_project_id, trim(p_name), trim(p_description), p_default_connector
  )
  returning document_agents.id, document_agents.name::text,
    document_agents.description::text, document_agents.default_connector,
    document_agents.skills, document_agents.created_at,
    document_agents.updated_at;
end;
$$;

create function public.list_document_agents(p_session_token_hash text)
returns table (
  id uuid, name text, description text, default_connector text,
  skills jsonb, created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select agents.id, agents.name::text, agents.description::text,
    agents.default_connector, agents.skills, agents.created_at, agents.updated_at
  from public.project_sessions sessions
  join public.document_agents agents on agents.project_id = sessions.project_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  order by agents.updated_at desc;
$$;

create function public.update_document_agent(
  p_session_token_hash text,
  p_agent_id uuid,
  p_name text,
  p_description text,
  p_default_connector text,
  p_skills jsonb
)
returns table (
  id uuid, name text, description text, default_connector text,
  skills jsonb, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_skill jsonb;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_description, ''))) > 800
    or jsonb_typeof(p_skills) is distinct from 'array'
    or jsonb_array_length(p_skills) > 100
    or pg_column_size(p_skills) > 2097152
    or not exists (
      select 1 from public.project_llm_connectors connectors
      where connectors.project_id = v_project_id
        and connectors.connector = p_default_connector
    )
  then raise exception 'invalid document agent input'; end if;

  if (
    select count(distinct lower(skill ->> 'name'))
    from jsonb_array_elements(p_skills) skill
  ) <> jsonb_array_length(p_skills)
  then raise exception 'duplicate skill name'; end if;

  for v_skill in select value from jsonb_array_elements(p_skills)
  loop
    if jsonb_typeof(v_skill) is distinct from 'object'
      or coalesce(v_skill ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or char_length(trim(coalesce(v_skill ->> 'name', ''))) not between 1 and 120
      or char_length(trim(coalesce(v_skill ->> 'content', ''))) not between 1 and 100000
      or char_length(trim(coalesce(v_skill ->> 'model', ''))) not between 1 and 160
      or not exists (
        select 1 from public.project_llm_connectors connectors
        where connectors.project_id = v_project_id
          and connectors.connector = v_skill ->> 'connector'
      )
      or not exists (
        select 1 from public.project_repository_groups groups
        where groups.project_id = v_project_id
          and groups.id::text = v_skill ->> 'repositoryGroupId'
      )
    then raise exception 'invalid skill input'; end if;
  end loop;

  return query update public.document_agents
  set name = trim(p_name), description = trim(p_description),
    default_connector = p_default_connector, skills = p_skills
  where document_agents.id = p_agent_id
    and document_agents.project_id = v_project_id
  returning document_agents.id, document_agents.name::text,
    document_agents.description::text, document_agents.default_connector,
    document_agents.skills, document_agents.created_at,
    document_agents.updated_at;
end;
$$;

revoke all on function public.list_project_repository_groups(text) from public;
revoke all on function public.save_project_repository_group(
  text, uuid, text, text, jsonb
) from public;
revoke all on function public.delete_project_repository_group(text, uuid) from public;
revoke all on function public.list_project_llm_connectors(text) from public;
revoke all on function public.save_project_llm_connector(text, text, jsonb) from public;
revoke all on function public.delete_project_llm_connector(text, text) from public;
revoke all on function public.create_document_agent(text, text, text, text) from public;
revoke all on function public.list_document_agents(text) from public;
revoke all on function public.update_document_agent(
  text, uuid, text, text, text, jsonb
) from public;

grant execute on function public.list_project_repository_groups(text) to anon, authenticated;
grant execute on function public.save_project_repository_group(
  text, uuid, text, text, jsonb
) to anon, authenticated;
grant execute on function public.delete_project_repository_group(text, uuid) to anon, authenticated;
grant execute on function public.list_project_llm_connectors(text) to anon, authenticated;
grant execute on function public.save_project_llm_connector(text, text, jsonb) to anon, authenticated;
grant execute on function public.delete_project_llm_connector(text, text) to anon, authenticated;
grant execute on function public.create_document_agent(text, text, text, text) to anon, authenticated;
grant execute on function public.list_document_agents(text) to anon, authenticated;
grant execute on function public.update_document_agent(
  text, uuid, text, text, text, jsonb
) to anon, authenticated;
