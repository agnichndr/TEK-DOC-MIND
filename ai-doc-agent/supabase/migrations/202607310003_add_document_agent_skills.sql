alter table public.document_agents
  add column skills jsonb not null default '[]'::jsonb,
  add constraint document_agents_skills_array check (
    jsonb_typeof(skills) = 'array'
    and jsonb_array_length(skills) <= 100
    and pg_column_size(skills) <= 2097152
  );

drop function public.list_document_agents(text);

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
  skills jsonb,
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
    document_agents.skills,
    document_agents.created_at,
    document_agents.updated_at
  from public.project_sessions
  join public.document_agents
    on document_agents.project_id = project_sessions.project_id
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
  order by document_agents.updated_at desc;
$$;

create function public.update_document_agent(
  p_session_token_hash text,
  p_agent_id uuid,
  p_name text,
  p_description text,
  p_repository_groups jsonb,
  p_connectors jsonb,
  p_default_connector text,
  p_skills jsonb
)
returns table (
  id uuid,
  name text,
  description text,
  repository_groups jsonb,
  connectors jsonb,
  default_connector text,
  skills jsonb,
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
  v_skill jsonb;
begin
  select project_sessions.project_id
  into v_project_id
  from public.project_sessions
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
  limit 1;

  if not found or not exists (
    select 1
    from public.document_agents
    where document_agents.id = p_agent_id
      and document_agents.project_id = v_project_id
  ) then
    return;
  end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_description, ''))) > 800
    or jsonb_typeof(p_repository_groups) is distinct from 'array'
    or jsonb_array_length(p_repository_groups) not between 1 and 20
    or jsonb_typeof(p_connectors) is distinct from 'array'
    or jsonb_array_length(p_connectors) not between 1 and 6
    or jsonb_typeof(p_skills) is distinct from 'array'
    or jsonb_array_length(p_skills) > 100
    or pg_column_size(p_skills) > 2097152
    or coalesce(p_default_connector, '') not in (
      'openai', 'anthropic', 'gemini', 'azure_openai', 'bedrock', 'vertex_ai'
    )
    or p_connectors::text ~* '"(credential|apiKey|accessToken|bearerToken|password|secretAccessKey|sessionToken|accessKeyId)"[[:space:]]*:'
  then
    raise exception 'invalid document agent input';
  end if;

  if (
    select count(distinct connector ->> 'connector')
    from jsonb_array_elements(p_connectors) connector
  ) <> jsonb_array_length(p_connectors)
    or not exists (
      select 1 from jsonb_array_elements(p_connectors) connector
      where connector ->> 'connector' = p_default_connector
    )
    or exists (
      select 1 from jsonb_array_elements(p_connectors) connector
      where jsonb_typeof(connector) is distinct from 'object'
        or connector ->> 'status' <> 'connected'
        or connector ->> 'connector' not in (
          'openai', 'anthropic', 'gemini', 'azure_openai', 'bedrock', 'vertex_ai'
        )
        or coalesce(connector ->> 'verifiedAt', '') = ''
    )
  then
    raise exception 'invalid connector input';
  end if;

  if (
    select count(distinct lower(repository_group ->> 'name'))
    from jsonb_array_elements(p_repository_groups) repository_group
  ) <> jsonb_array_length(p_repository_groups)
  then
    raise exception 'duplicate repository group name';
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

      if char_length(trim(coalesce(v_repository ->> 'branch', ''))) not between 1 and 255
        or not exists (
          select 1 from public.repositories
          where repositories.id = v_repository_id
            and repositories.project_id = v_project_id
        )
      then
        raise exception 'invalid repository reference';
      end if;
    end loop;
  end loop;

  if (
    select count(distinct lower(skill ->> 'name'))
    from jsonb_array_elements(p_skills) skill
  ) <> jsonb_array_length(p_skills)
  then
    raise exception 'duplicate skill name';
  end if;

  for v_skill in
    select value from jsonb_array_elements(p_skills)
  loop
    if jsonb_typeof(v_skill) is distinct from 'object'
      or coalesce(v_skill ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or char_length(trim(coalesce(v_skill ->> 'name', ''))) not between 1 and 120
      or char_length(trim(coalesce(v_skill ->> 'content', ''))) not between 1 and 100000
      or char_length(trim(coalesce(v_skill ->> 'model', ''))) not between 1 and 160
      or not exists (
        select 1 from jsonb_array_elements(p_connectors) connector
        where connector ->> 'connector' = v_skill ->> 'connector'
      )
      or not exists (
        select 1 from jsonb_array_elements(p_repository_groups) repository_group
        where repository_group ->> 'name' = v_skill ->> 'repositoryGroup'
      )
    then
      raise exception 'invalid skill input';
    end if;
  end loop;

  return query
  update public.document_agents
  set
    name = trim(p_name),
    description = trim(p_description),
    repository_groups = p_repository_groups,
    connectors = p_connectors,
    default_connector = p_default_connector,
    skills = p_skills
  where document_agents.id = p_agent_id
    and document_agents.project_id = v_project_id
  returning
    document_agents.id,
    document_agents.name::text,
    document_agents.description::text,
    document_agents.repository_groups,
    document_agents.connectors,
    document_agents.default_connector,
    document_agents.skills,
    document_agents.created_at,
    document_agents.updated_at;
end;
$$;

revoke all on function public.list_document_agents(text) from public;
revoke all on function public.update_document_agent(
  text, uuid, text, text, jsonb, jsonb, text, jsonb
) from public;

grant execute on function public.list_document_agents(text)
  to anon, authenticated;
grant execute on function public.update_document_agent(
  text, uuid, text, text, jsonb, jsonb, text, jsonb
) to anon, authenticated;
