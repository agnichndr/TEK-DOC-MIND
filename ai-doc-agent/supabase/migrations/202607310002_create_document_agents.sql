create table public.document_agents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name varchar(120) not null,
  description varchar(800) not null default '',
  repository_groups jsonb not null,
  connectors jsonb not null,
  default_connector text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_agents_name_length check (
    char_length(name) between 2 and 120
  ),
  constraint document_agents_description_length check (
    char_length(description) <= 800
  ),
  constraint document_agents_repository_groups_array check (
    jsonb_typeof(repository_groups) = 'array'
    and jsonb_array_length(repository_groups) between 1 and 20
  ),
  constraint document_agents_connectors_array check (
    jsonb_typeof(connectors) = 'array'
    and jsonb_array_length(connectors) between 1 and 6
  ),
  constraint document_agents_default_connector check (
    default_connector in (
      'openai',
      'anthropic',
      'gemini',
      'azure_openai',
      'bedrock',
      'vertex_ai'
    )
  ),
  constraint document_agents_no_connector_secrets check (
    connectors::text !~* '"(credential|apiKey|accessToken|bearerToken|password|secretAccessKey|sessionToken|accessKeyId)"[[:space:]]*:'
  )
);

create unique index document_agents_project_name_unique
  on public.document_agents(project_id, lower(name));
create index document_agents_project_id_idx
  on public.document_agents(project_id);

alter table public.document_agents enable row level security;
alter table public.document_agents force row level security;
revoke all on table public.document_agents from anon, authenticated;

create trigger document_agents_set_updated_at
before update on public.document_agents
for each row execute function public.set_updated_at();

create function public.create_document_agent(
  p_session_token_hash text,
  p_name text,
  p_description text,
  p_repository_groups jsonb,
  p_connectors jsonb,
  p_default_connector text
)
returns table (
  id uuid,
  name text,
  description text,
  repository_groups jsonb,
  connectors jsonb,
  default_connector text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_group jsonb;
  v_repository jsonb;
  v_repository_id uuid;
  v_connector jsonb;
  v_connector_count integer;
  v_verified_at timestamptz;
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

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_description, ''))) > 800
    or jsonb_typeof(p_repository_groups) is distinct from 'array'
    or jsonb_array_length(p_repository_groups) not between 1 and 20
    or jsonb_typeof(p_connectors) is distinct from 'array'
    or jsonb_array_length(p_connectors) not between 1 and 6
    or coalesce(p_default_connector, '') not in (
      'openai',
      'anthropic',
      'gemini',
      'azure_openai',
      'bedrock',
      'vertex_ai'
    )
    or p_connectors::text ~* '"(credential|apiKey|accessToken|bearerToken|password|secretAccessKey|sessionToken|accessKeyId)"[[:space:]]*:'
  then
    raise exception 'invalid document agent input';
  end if;

  for v_group in
    select value from jsonb_array_elements(p_repository_groups)
  loop
    if jsonb_typeof(v_group) is distinct from 'object'
      or char_length(trim(coalesce(v_group ->> 'name', ''))) not between 1 and 100
      or char_length(trim(coalesce(v_group ->> 'description', ''))) > 500
      or jsonb_typeof(v_group -> 'repositories') is distinct from 'array'
      or jsonb_array_length(v_group -> 'repositories') > 200
    then
      raise exception 'invalid repository group input';
    end if;

    for v_repository in
      select value from jsonb_array_elements(v_group -> 'repositories')
    loop
      begin
        v_repository_id := (v_repository ->> 'repositoryId')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'invalid repository reference';
      end;

      if jsonb_typeof(v_repository) is distinct from 'object'
        or char_length(trim(coalesce(v_repository ->> 'branch', ''))) not between 1 and 255
        or not exists (
          select 1
          from public.repositories
          where repositories.id = v_repository_id
            and repositories.project_id = v_project_id
        )
      then
        raise exception 'invalid repository reference';
      end if;
    end loop;
  end loop;

  select count(distinct connector ->> 'connector')
  into v_connector_count
  from jsonb_array_elements(p_connectors) connector;

  if v_connector_count <> jsonb_array_length(p_connectors)
    or not exists (
      select 1
      from jsonb_array_elements(p_connectors) connector
      where connector ->> 'connector' = p_default_connector
    )
    or exists (
      select 1
      from jsonb_array_elements(p_connectors) connector
      where jsonb_typeof(connector) is distinct from 'object'
        or coalesce(connector ->> 'status', '') <> 'connected'
        or not coalesce((
          (connector ->> 'connector' = 'openai'
            and connector ->> 'authenticationMethod' in ('api_key', 'access_token'))
          or (connector ->> 'connector' = 'anthropic'
            and connector ->> 'authenticationMethod' in ('api_key', 'bearer_token'))
          or (connector ->> 'connector' = 'gemini'
            and connector ->> 'authenticationMethod' in (
              'standard_api_key',
              'authorization_api_key'
            ))
          or (connector ->> 'connector' = 'azure_openai'
            and connector ->> 'authenticationMethod' in ('api_key', 'entra_token')
            and char_length(connector ->> 'endpoint') between 1 and 512)
          or (connector ->> 'connector' = 'bedrock'
            and connector ->> 'authenticationMethod' = 'aws_access_keys'
            and char_length(connector ->> 'region') between 1 and 32)
          or (connector ->> 'connector' = 'vertex_ai'
            and connector ->> 'authenticationMethod' = 'oauth_access_token'
            and char_length(connector ->> 'projectId') between 1 and 63
            and char_length(connector ->> 'location') between 1 and 64)
        ), false)
    )
  then
    raise exception 'invalid connector input';
  end if;

  for v_connector in
    select value from jsonb_array_elements(p_connectors)
  loop
    begin
      v_verified_at := (v_connector ->> 'verifiedAt')::timestamptz;
    exception
      when invalid_datetime_format then
        raise exception 'invalid connector verification time';
    end;

    if v_verified_at is null then
      raise exception 'invalid connector verification time';
    end if;
  end loop;

  return query
  insert into public.document_agents (
    project_id,
    name,
    description,
    repository_groups,
    connectors,
    default_connector
  )
  values (
    v_project_id,
    trim(p_name),
    trim(p_description),
    p_repository_groups,
    p_connectors,
    p_default_connector
  )
  returning
    document_agents.id,
    document_agents.name::text,
    document_agents.description::text,
    document_agents.repository_groups,
    document_agents.connectors,
    document_agents.default_connector,
    document_agents.created_at,
    document_agents.updated_at;
end;
$$;

create function public.list_document_agents(
  p_session_token_hash text
)
returns table (
  id uuid,
  name text,
  description text,
  repository_groups jsonb,
  connectors jsonb,
  default_connector text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    document_agents.id,
    document_agents.name::text,
    document_agents.description::text,
    document_agents.repository_groups,
    document_agents.connectors,
    document_agents.default_connector,
    document_agents.created_at,
    document_agents.updated_at
  from public.project_sessions
  join public.document_agents
    on document_agents.project_id = project_sessions.project_id
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
  order by document_agents.created_at desc;
$$;

revoke all on function public.create_document_agent(
  text, text, text, jsonb, jsonb, text
) from public;
revoke all on function public.list_document_agents(text) from public;

grant execute on function public.create_document_agent(
  text, text, text, jsonb, jsonb, text
) to anon, authenticated;
grant execute on function public.list_document_agents(text)
  to anon, authenticated;
