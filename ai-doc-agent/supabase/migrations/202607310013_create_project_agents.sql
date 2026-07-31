create table public.project_agents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name varchar(120) not null,
  description varchar(800) not null default '',
  connector text not null,
  model varchar(256) not null,
  skills_markdown text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_agents_name_length check (
    char_length(name) between 2 and 120
  ),
  constraint project_agents_description_length check (
    char_length(description) <= 800
  ),
  constraint project_agents_connector_type check (
    connector in (
      'openai', 'anthropic', 'gemini', 'azure_openai', 'bedrock', 'vertex_ai'
    )
  ),
  constraint project_agents_model_length check (
    char_length(model) between 1 and 256
  ),
  constraint project_agents_model_format check (
    model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
  ),
  constraint project_agents_skills_markdown_length check (
    char_length(skills_markdown) between 1 and 200000
  ),
  constraint project_agents_project_connector_fkey
    foreign key (project_id, connector)
    references public.project_llm_connectors(project_id, connector)
    on delete no action
    deferrable initially deferred
);

create unique index project_agents_project_name_unique
  on public.project_agents(project_id, lower(name));
create index project_agents_project_id_idx
  on public.project_agents(project_id);

alter table public.project_agents enable row level security;
alter table public.project_agents force row level security;
revoke all on table public.project_agents from anon, authenticated;

create trigger project_agents_set_updated_at
before update on public.project_agents
for each row execute function public.set_updated_at();

create function public.list_project_agents(p_session_token_hash text)
returns table (
  id uuid,
  name text,
  description text,
  connector text,
  model text,
  skills_markdown text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select
    agents.id,
    agents.name::text,
    agents.description::text,
    agents.connector,
    agents.model::text,
    agents.skills_markdown,
    agents.created_at,
    agents.updated_at
  from public.project_sessions sessions
  join public.project_agents agents
    on agents.project_id = sessions.project_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  order by lower(agents.name);
$$;

create function public.save_project_agent(
  p_session_token_hash text,
  p_agent_id uuid,
  p_name text,
  p_description text,
  p_connector text,
  p_model text,
  p_skills_markdown text
)
returns table (
  id uuid,
  name text,
  description text,
  connector text,
  model text,
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
    or char_length(trim(coalesce(p_skills_markdown, ''))) not between 1 and 200000
    or not exists (
      select 1 from public.project_llm_connectors connectors
      where connectors.project_id = v_project_id
        and connectors.connector = p_connector
    )
  then raise exception 'invalid project agent input'; end if;

  return query
  insert into public.project_agents (
    id, project_id, name, description, connector, model, skills_markdown
  )
  values (
    p_agent_id,
    v_project_id,
    trim(p_name),
    trim(p_description),
    p_connector,
    trim(p_model),
    trim(p_skills_markdown)
  )
  on conflict on constraint project_agents_pkey do update set
    name = excluded.name,
    description = excluded.description,
    connector = excluded.connector,
    model = excluded.model,
    skills_markdown = excluded.skills_markdown
  where project_agents.project_id = v_project_id
  returning
    project_agents.id,
    project_agents.name::text,
    project_agents.description::text,
    project_agents.connector,
    project_agents.model::text,
    project_agents.skills_markdown,
    project_agents.created_at,
    project_agents.updated_at;
end;
$$;

create function public.delete_project_agent(
  p_session_token_hash text,
  p_agent_id uuid
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

  delete from public.project_agents
  where project_agents.id = p_agent_id
    and project_agents.project_id = v_project_id;
  return found;
end;
$$;

revoke all on function public.list_project_agents(text) from public;
revoke all on function public.save_project_agent(
  text, uuid, text, text, text, text, text
) from public;
revoke all on function public.delete_project_agent(text, uuid) from public;

grant execute on function public.list_project_agents(text)
  to anon, authenticated;
grant execute on function public.save_project_agent(
  text, uuid, text, text, text, text, text
) to anon, authenticated;
grant execute on function public.delete_project_agent(text, uuid)
  to anon, authenticated;
