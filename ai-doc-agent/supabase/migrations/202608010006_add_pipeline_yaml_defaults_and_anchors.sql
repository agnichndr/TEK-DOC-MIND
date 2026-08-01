alter table public.project_pipelines
  add column if not exists default_connector text,
  add column if not exists default_model varchar(256),
  add column if not exists yaml_definition text not null default '';

alter table public.project_pipeline_edges
  add column if not exists source_anchor text not null default 'right';

alter table public.project_pipeline_nodes
  add column if not exists output_config jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_pipeline_nodes_output_config'
      and conrelid = 'public.project_pipeline_nodes'::regclass
  ) then
    alter table public.project_pipeline_nodes
      add constraint project_pipeline_nodes_output_config check (
        output_config is null or jsonb_typeof(output_config) = 'object'
      );
  end if;
end;
$$;

with connector_choices as (
  select distinct on (pipelines.id)
    pipelines.id as pipeline_id,
    connectors.connector,
    connectors.summary ->> 'defaultModel' as default_model
  from public.project_pipelines pipelines
  join public.project_llm_connectors connectors
    on connectors.project_id = pipelines.project_id
  order by pipelines.id, connectors.created_at, connectors.connector
)
update public.project_pipelines pipelines
set default_connector = choices.connector,
    default_model = choices.default_model
from connector_choices choices
where choices.pipeline_id = pipelines.id;

update public.project_pipelines pipelines
set yaml_definition = jsonb_pretty(jsonb_build_object(
  'version', 1,
  'projectId', pipelines.project_id,
  'name', pipelines.name,
  'description', pipelines.description,
  'defaultConnector', pipelines.default_connector,
  'defaultModel', pipelines.default_model,
  'nodes', coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', nodes.id,
      'kind', nodes.node_kind,
      'agentId', nodes.agent_id,
      'position', jsonb_build_object('x', nodes.position_x, 'y', nodes.position_y),
      'output', nodes.output_config
    )) order by nodes.position_x, nodes.position_y, nodes.id)
    from public.project_pipeline_nodes nodes
    where nodes.pipeline_id = pipelines.id
  ), '[]'::jsonb),
  'edges', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', edges.id,
      'fromNodeId', edges.from_node_id,
      'toNodeId', edges.to_node_id,
      'sourceAnchor', edges.source_anchor
    ) order by edges.id)
    from public.project_pipeline_edges edges
    where edges.pipeline_id = pipelines.id
  ), '[]'::jsonb)
));

alter table public.project_pipelines
  alter column default_connector set not null,
  alter column default_model set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_pipelines_default_connector_type'
      and conrelid = 'public.project_pipelines'::regclass
  ) then
    alter table public.project_pipelines
      add constraint project_pipelines_default_connector_type check (
        default_connector in (
          'openai', 'anthropic', 'gemini', 'azure_openai', 'bedrock', 'vertex_ai'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_pipelines_default_model_length'
      and conrelid = 'public.project_pipelines'::regclass
  ) then
    alter table public.project_pipelines
      add constraint project_pipelines_default_model_length check (
        char_length(default_model) between 1 and 256
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_pipelines_yaml_length'
      and conrelid = 'public.project_pipelines'::regclass
  ) then
    alter table public.project_pipelines
      add constraint project_pipelines_yaml_length check (
        char_length(yaml_definition) between 1 and 500000
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_pipelines_default_connector_fkey'
      and conrelid = 'public.project_pipelines'::regclass
  ) then
    alter table public.project_pipelines
      add constraint project_pipelines_default_connector_fkey
        foreign key (project_id, default_connector)
        references public.project_llm_connectors(project_id, connector)
        on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_pipeline_edges_source_anchor'
      and conrelid = 'public.project_pipeline_edges'::regclass
  ) then
    alter table public.project_pipeline_edges
      add constraint project_pipeline_edges_source_anchor check (
        source_anchor in ('right', 'top', 'bottom', 'left')
      );
  end if;
end;
$$;

drop function if exists public.save_project_pipeline_with_uploads(
  text, uuid, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb
);
drop function if exists public.save_project_pipeline(text, uuid, text, text, jsonb, jsonb);
drop function if exists public.save_project_pipeline(
  text, uuid, text, text, text, text, text, jsonb, jsonb
);
drop function if exists public.list_project_pipelines(text);

create function public.list_project_pipelines(p_session_token_hash text)
returns table (
  id uuid,
  name text,
  description text,
  default_connector text,
  default_model text,
  yaml_definition text,
  nodes jsonb,
  edges jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select
    pipelines.id,
    pipelines.name::text,
    pipelines.description::text,
    pipelines.default_connector,
    pipelines.default_model::text,
    pipelines.yaml_definition,
    coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', nodes.id,
        'kind', nodes.node_kind,
        'agentId', nodes.agent_id,
        'position', jsonb_build_object('x', nodes.position_x, 'y', nodes.position_y),
        'output', nodes.output_config
      )) order by nodes.position_x, nodes.position_y, nodes.id)
      from public.project_pipeline_nodes nodes
      where nodes.pipeline_id = pipelines.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', edges.id,
        'fromNodeId', edges.from_node_id,
        'toNodeId', edges.to_node_id,
        'sourceAnchor', edges.source_anchor
      ) order by edges.id)
      from public.project_pipeline_edges edges
      where edges.pipeline_id = pipelines.id
    ), '[]'::jsonb),
    pipelines.created_at,
    pipelines.updated_at
  from public.project_sessions sessions
  join public.project_pipelines pipelines
    on pipelines.project_id = sessions.project_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  order by lower(pipelines.name);
$$;

create function public.save_project_pipeline(
  p_session_token_hash text,
  p_pipeline_id uuid,
  p_name text,
  p_description text,
  p_default_connector text,
  p_default_model text,
  p_yaml_definition text,
  p_nodes jsonb,
  p_edges jsonb
)
returns table (
  id uuid,
  name text,
  description text,
  default_connector text,
  default_model text,
  yaml_definition text,
  nodes jsonb,
  edges jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_node_count integer;
  v_reachable_count integer;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_description, ''))) > 800
    or p_default_connector not in (
      'openai', 'anthropic', 'gemini', 'azure_openai', 'bedrock', 'vertex_ai'
    )
    or char_length(trim(coalesce(p_default_model, ''))) not between 1 and 256
    or trim(coalesce(p_default_model, '')) !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
    or char_length(coalesce(p_yaml_definition, '')) not between 1 and 500000
    or jsonb_typeof(p_nodes) <> 'array'
    or jsonb_array_length(p_nodes) not between 1 and 50
    or jsonb_typeof(p_edges) <> 'array'
    or jsonb_array_length(p_edges) > 100
  then raise exception 'invalid pipeline input'; end if;

  if not exists (
    select 1 from public.project_llm_connectors connectors
    where connectors.project_id = v_project_id
      and connectors.connector = p_default_connector
  ) then raise exception 'invalid pipeline connector'; end if;

  if exists (
    select 1 from public.project_pipelines pipelines
    where pipelines.id = p_pipeline_id and pipelines.project_id <> v_project_id
  ) then raise exception 'invalid pipeline scope'; end if;

  with node_data as (
    select * from jsonb_to_recordset(p_nodes) as nodes(
      id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
      output_config jsonb
    )
  ) select count(*) into v_node_count from node_data;

  if v_node_count <> jsonb_array_length(p_nodes)
    or (select count(distinct nodes.id) from jsonb_to_recordset(p_nodes) as nodes(
      id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
      output_config jsonb
    )) <> v_node_count
    or (select count(*) from jsonb_to_recordset(p_nodes) as nodes(
      id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
      output_config jsonb
    ) where nodes.node_kind = 'source') <> 1
    or exists (
      select 1 from jsonb_to_recordset(p_nodes) as nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
        output_config jsonb
      )
      where nodes.id is null or nodes.node_kind not in ('source', 'agent')
        or nodes.position_x not between 0 and 4000
        or nodes.position_y not between 0 and 4000
        or (nodes.node_kind = 'source' and nodes.agent_id is not null)
        or (nodes.node_kind = 'agent' and nodes.agent_id is null)
        or (
          nodes.output_config is not null and (
            jsonb_typeof(nodes.output_config) <> 'object'
            or coalesce(nodes.output_config ->> 'parentPath', '') !~ '^/'
            or nodes.output_config ->> 'parentPath' ~ '(^|/)\.\.(/|$)'
            or char_length(coalesce(nodes.output_config ->> 'parentPath', '')) > 512
            or char_length(coalesce(nodes.output_config ->> 'fileName', '')) not between 1 and 255
            or nodes.output_config ->> 'fileName' ~ '[/\\]'
            or nodes.output_config ->> 'fileType' not in (
              'html', 'xml', 'md', 'txt', 'json', 'png', 'jpeg', 'mermaid',
              'yml', 'yaml', 'odt', 'rtf', 'docx', 'pdf', 'csv', 'svg'
            )
          )
        )
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_nodes) as nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
        output_config jsonb
      )
      left join public.project_agents agents
        on agents.id = nodes.agent_id and agents.project_id = v_project_id
      where nodes.node_kind = 'agent' and agents.id is null
    )
  then raise exception 'invalid pipeline nodes'; end if;

  if (select count(distinct edges.id) from jsonb_to_recordset(p_edges) as edges(
      id uuid, from_node_id uuid, to_node_id uuid, source_anchor text
    )) <> jsonb_array_length(p_edges)
    or (select count(*) from jsonb_to_recordset(p_edges) as edges(
      id uuid, from_node_id uuid, to_node_id uuid, source_anchor text
    )) <> (select count(distinct (edges.from_node_id, edges.to_node_id))
      from jsonb_to_recordset(p_edges) as edges(
        id uuid, from_node_id uuid, to_node_id uuid, source_anchor text
      ))
    or exists (
      select 1
      from jsonb_to_recordset(p_edges) as edge_data(
        id uuid, from_node_id uuid, to_node_id uuid, source_anchor text
      )
      left join jsonb_to_recordset(p_nodes) as source_nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
        output_config jsonb
      ) on source_nodes.id = edge_data.from_node_id
      left join jsonb_to_recordset(p_nodes) as target_nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
        output_config jsonb
      ) on target_nodes.id = edge_data.to_node_id
      where edge_data.id is null or source_nodes.id is null or target_nodes.id is null
        or target_nodes.node_kind = 'source'
        or edge_data.from_node_id = edge_data.to_node_id
        or edge_data.source_anchor not in ('right', 'top', 'bottom', 'left')
    )
  then raise exception 'invalid pipeline edges'; end if;

  with recursive
    node_data as (
      select * from jsonb_to_recordset(p_nodes) as nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
        output_config jsonb
      )
    ),
    edge_data as (
      select * from jsonb_to_recordset(p_edges) as edges(
        id uuid, from_node_id uuid, to_node_id uuid, source_anchor text
      )
    ),
    reachable(node_id) as (
      select nodes.id from node_data nodes where nodes.node_kind = 'source'
      union
      select edges.to_node_id from reachable
      join edge_data edges on edges.from_node_id = reachable.node_id
    )
  select count(*) into v_reachable_count from reachable;

  if v_reachable_count <> v_node_count then
    raise exception 'pipeline contains unreachable nodes';
  end if;

  if exists (
    with recursive
      edge_data as (
        select * from jsonb_to_recordset(p_edges) as edges(
          id uuid, from_node_id uuid, to_node_id uuid, source_anchor text
        )
      ),
      reachable_pairs(from_node_id, to_node_id) as (
        select edges.from_node_id, edges.to_node_id from edge_data edges
        union
        select reachable_pairs.from_node_id, edges.to_node_id
        from reachable_pairs join edge_data edges
          on edges.from_node_id = reachable_pairs.to_node_id
      )
    select 1 from reachable_pairs
    where reachable_pairs.from_node_id = reachable_pairs.to_node_id
  ) then raise exception 'pipeline contains a cycle'; end if;

  insert into public.project_pipelines (
    id, project_id, name, description, default_connector, default_model,
    yaml_definition
  ) values (
    p_pipeline_id, v_project_id, trim(p_name), trim(coalesce(p_description, '')),
    p_default_connector, trim(p_default_model), p_yaml_definition
  )
  on conflict on constraint project_pipelines_pkey do update set
    name = excluded.name,
    description = excluded.description,
    default_connector = excluded.default_connector,
    default_model = excluded.default_model,
    yaml_definition = excluded.yaml_definition
  where project_pipelines.project_id = v_project_id;

  delete from public.project_pipeline_nodes nodes
  where nodes.pipeline_id = p_pipeline_id;

  insert into public.project_pipeline_nodes (
    pipeline_id, id, node_kind, agent_id, position_x, position_y, output_config
  )
  select p_pipeline_id, nodes.id, nodes.node_kind, nodes.agent_id,
    nodes.position_x, nodes.position_y, nodes.output_config
  from jsonb_to_recordset(p_nodes) as nodes(
    id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer,
    output_config jsonb
  );

  insert into public.project_pipeline_edges (
    pipeline_id, id, from_node_id, to_node_id, source_anchor
  )
  select p_pipeline_id, edges.id, edges.from_node_id, edges.to_node_id,
    edges.source_anchor
  from jsonb_to_recordset(p_edges) as edges(
    id uuid, from_node_id uuid, to_node_id uuid, source_anchor text
  );

  return query
  select listed.*
  from public.list_project_pipelines(p_session_token_hash) listed
  where listed.id = p_pipeline_id;
end;
$$;

revoke all on function public.list_project_pipelines(text) from public;
revoke all on function public.save_project_pipeline(
  text, uuid, text, text, text, text, text, jsonb, jsonb
) from public;

grant execute on function public.list_project_pipelines(text) to anon, authenticated;
grant execute on function public.save_project_pipeline(
  text, uuid, text, text, text, text, text, jsonb, jsonb
) to anon, authenticated;

drop function if exists public.get_project_workspace(text);

create function public.get_project_workspace(p_session_token_hash text)
returns table (
  project_id uuid,
  project_name text,
  project_description text,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select
    projects.id,
    projects.name::text,
    projects.description::text,
    projects.created_at,
    projects.updated_at,
    project_sessions.expires_at
  from public.project_sessions
  join public.projects on projects.id = project_sessions.project_id
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
  limit 1;
$$;

revoke all on function public.get_project_workspace(text) from public;
grant execute on function public.get_project_workspace(text) to anon, authenticated;
