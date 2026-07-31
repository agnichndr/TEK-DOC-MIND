alter table public.project_agents
  drop constraint project_agents_output_type,
  add constraint project_agents_output_type check (
    output_type in ('text', 'json', 'html', 'xml', 'image')
  );

create or replace function public.save_project_agent(
  p_session_token_hash text,
  p_agent_id uuid,
  p_name text,
  p_description text,
  p_connector text,
  p_model text,
  p_output_mode text,
  p_output_type text,
  p_skills_markdown text
)
returns table (
  id uuid,
  name text,
  description text,
  connector text,
  model text,
  output_mode text,
  output_type text,
  skills_markdown text,
  created_at timestamptz,
  updated_at timestamptz
)
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
  if not found then return; end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_description, ''))) > 800
    or char_length(trim(coalesce(p_model, ''))) not between 1 and 256
    or trim(p_model) !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
    or p_output_mode is null
    or p_output_mode not in ('single', 'multiple')
    or p_output_type is null
    or p_output_type not in ('text', 'json', 'html', 'xml', 'image')
    or char_length(trim(coalesce(p_skills_markdown, ''))) not between 1 and 200000
    or not exists (
      select 1 from public.project_llm_connectors connectors
      where connectors.project_id = v_project_id
        and connectors.connector = p_connector
    )
  then raise exception 'invalid project agent input'; end if;

  return query
  insert into public.project_agents (
    id, project_id, name, description, connector, model,
    output_mode, output_type, skills_markdown
  )
  values (
    p_agent_id,
    v_project_id,
    trim(p_name),
    trim(p_description),
    p_connector,
    trim(p_model),
    p_output_mode,
    p_output_type,
    trim(p_skills_markdown)
  )
  on conflict on constraint project_agents_pkey do update set
    name = excluded.name,
    description = excluded.description,
    connector = excluded.connector,
    model = excluded.model,
    output_mode = excluded.output_mode,
    output_type = excluded.output_type,
    skills_markdown = excluded.skills_markdown
  where project_agents.project_id = v_project_id
  returning
    project_agents.id,
    project_agents.name::text,
    project_agents.description::text,
    project_agents.connector,
    project_agents.model::text,
    project_agents.output_mode,
    project_agents.output_type,
    project_agents.skills_markdown,
    project_agents.created_at,
    project_agents.updated_at;
end;
$$;
