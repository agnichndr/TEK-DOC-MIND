create table public.project_pipelines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name varchar(120) not null,
  description varchar(800) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_pipelines_name_length check (
    char_length(name) between 2 and 120
  ),
  constraint project_pipelines_description_length check (
    char_length(description) <= 800
  )
);

create unique index project_pipelines_project_name_unique
  on public.project_pipelines(project_id, lower(name));

create table public.project_pipeline_nodes (
  pipeline_id uuid not null
    references public.project_pipelines(id) on delete cascade,
  id uuid not null,
  node_kind text not null,
  agent_id uuid references public.project_agents(id) on delete cascade,
  position_x integer not null,
  position_y integer not null,
  primary key (pipeline_id, id),
  constraint project_pipeline_nodes_kind check (
    node_kind in ('source', 'agent')
  ),
  constraint project_pipeline_nodes_agent_shape check (
    (node_kind = 'source' and agent_id is null)
    or (node_kind = 'agent' and agent_id is not null)
  ),
  constraint project_pipeline_nodes_position check (
    position_x between 0 and 4000 and position_y between 0 and 4000
  )
);

create unique index project_pipeline_nodes_one_source
  on public.project_pipeline_nodes(pipeline_id)
  where node_kind = 'source';

create table public.project_pipeline_edges (
  pipeline_id uuid not null
    references public.project_pipelines(id) on delete cascade,
  id uuid not null,
  from_node_id uuid not null,
  to_node_id uuid not null,
  primary key (pipeline_id, id),
  constraint project_pipeline_edges_unique_path
    unique (pipeline_id, from_node_id, to_node_id),
  constraint project_pipeline_edges_not_self check (
    from_node_id <> to_node_id
  ),
  constraint project_pipeline_edges_from_fkey
    foreign key (pipeline_id, from_node_id)
    references public.project_pipeline_nodes(pipeline_id, id)
    on delete cascade,
  constraint project_pipeline_edges_to_fkey
    foreign key (pipeline_id, to_node_id)
    references public.project_pipeline_nodes(pipeline_id, id)
    on delete cascade
);

alter table public.project_pipelines enable row level security;
alter table public.project_pipelines force row level security;
alter table public.project_pipeline_nodes enable row level security;
alter table public.project_pipeline_nodes force row level security;
alter table public.project_pipeline_edges enable row level security;
alter table public.project_pipeline_edges force row level security;

revoke all on table public.project_pipelines from anon, authenticated;
revoke all on table public.project_pipeline_nodes from anon, authenticated;
revoke all on table public.project_pipeline_edges from anon, authenticated;

create function public.delete_pipeline_node_descendants()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.node_kind = 'agent' then
    with recursive reachable(node_id) as (
      select nodes.id
      from public.project_pipeline_nodes nodes
      where nodes.pipeline_id = old.pipeline_id
        and nodes.node_kind = 'source'
        and nodes.id <> old.id
      union
      select edges.to_node_id
      from reachable
      join public.project_pipeline_edges edges
        on edges.pipeline_id = old.pipeline_id
       and edges.from_node_id = reachable.node_id
      where edges.to_node_id <> old.id
    )
    delete from public.project_pipeline_nodes nodes
    where nodes.pipeline_id = old.pipeline_id
      and nodes.node_kind = 'agent'
      and nodes.id <> old.id
      and nodes.id not in (select reachable.node_id from reachable);
  end if;
  return old;
end;
$$;

revoke all on function public.delete_pipeline_node_descendants() from public;

create trigger project_pipeline_nodes_delete_descendants
before delete on public.project_pipeline_nodes
for each row execute function public.delete_pipeline_node_descendants();

create trigger project_pipelines_set_updated_at
before update on public.project_pipelines
for each row execute function public.set_updated_at();

create function public.list_project_pipelines(p_session_token_hash text)
returns table (
  id uuid,
  name text,
  description text,
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
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', nodes.id,
          'kind', nodes.node_kind,
          'agentId', nodes.agent_id,
          'position', jsonb_build_object(
            'x', nodes.position_x,
            'y', nodes.position_y
          )
        ) order by nodes.position_x, nodes.position_y, nodes.id
      )
      from public.project_pipeline_nodes nodes
      where nodes.pipeline_id = pipelines.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', edges.id,
          'fromNodeId', edges.from_node_id,
          'toNodeId', edges.to_node_id
        ) order by edges.id
      )
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
  p_nodes jsonb,
  p_edges jsonb
)
returns table (
  id uuid,
  name text,
  description text,
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
    or jsonb_typeof(p_nodes) <> 'array'
    or jsonb_array_length(p_nodes) not between 1 and 50
    or jsonb_typeof(p_edges) <> 'array'
    or jsonb_array_length(p_edges) > 100
  then raise exception 'invalid pipeline input'; end if;

  if exists (
    select 1 from public.project_pipelines pipelines
    where pipelines.id = p_pipeline_id
      and pipelines.project_id <> v_project_id
  ) then raise exception 'invalid pipeline scope'; end if;

  with node_data as (
    select * from jsonb_to_recordset(p_nodes) as nodes(
      id uuid,
      node_kind text,
      agent_id uuid,
      position_x integer,
      position_y integer
    )
  )
  select count(*) into v_node_count from node_data;

  if v_node_count <> jsonb_array_length(p_nodes)
    or (select count(distinct nodes.id) from jsonb_to_recordset(p_nodes) as nodes(
      id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer
    )) <> v_node_count
    or (select count(*) from jsonb_to_recordset(p_nodes) as nodes(
      id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer
    ) where nodes.node_kind = 'source') <> 1
    or exists (
      select 1 from jsonb_to_recordset(p_nodes) as nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer
      )
      where nodes.id is null
        or nodes.node_kind not in ('source', 'agent')
        or nodes.position_x not between 0 and 4000
        or nodes.position_y not between 0 and 4000
        or (nodes.node_kind = 'source' and nodes.agent_id is not null)
        or (nodes.node_kind = 'agent' and nodes.agent_id is null)
    )
    or exists (
      select 1
      from jsonb_to_recordset(p_nodes) as nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer
      )
      left join public.project_agents agents
        on agents.id = nodes.agent_id
       and agents.project_id = v_project_id
      where nodes.node_kind = 'agent' and agents.id is null
    )
  then raise exception 'invalid pipeline nodes'; end if;

  if (select count(distinct edges.id) from jsonb_to_recordset(p_edges) as edges(
      id uuid, from_node_id uuid, to_node_id uuid
    )) <> jsonb_array_length(p_edges)
    or (select count(*) from jsonb_to_recordset(p_edges) as edges(
      id uuid, from_node_id uuid, to_node_id uuid
    )) <> (select count(distinct (edges.from_node_id, edges.to_node_id))
      from jsonb_to_recordset(p_edges) as edges(
        id uuid, from_node_id uuid, to_node_id uuid
      ))
    or exists (
      select 1
      from jsonb_to_recordset(p_edges) as edge_data(
        id uuid, from_node_id uuid, to_node_id uuid
      )
      left join jsonb_to_recordset(p_nodes) as source_nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer
      ) on source_nodes.id = edge_data.from_node_id
      left join jsonb_to_recordset(p_nodes) as target_nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer
      ) on target_nodes.id = edge_data.to_node_id
      where edge_data.id is null
        or source_nodes.id is null
        or target_nodes.id is null
        or target_nodes.node_kind = 'source'
        or edge_data.from_node_id = edge_data.to_node_id
    )
  then raise exception 'invalid pipeline edges'; end if;

  with recursive
    node_data as (
      select * from jsonb_to_recordset(p_nodes) as nodes(
        id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer
      )
    ),
    edge_data as (
      select * from jsonb_to_recordset(p_edges) as edges(
        id uuid, from_node_id uuid, to_node_id uuid
      )
    ),
    reachable(node_id) as (
      select nodes.id from node_data nodes where nodes.node_kind = 'source'
      union
      select edges.to_node_id
      from reachable
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
          id uuid, from_node_id uuid, to_node_id uuid
        )
      ),
      reachable_pairs(from_node_id, to_node_id) as (
        select edges.from_node_id, edges.to_node_id
        from edge_data edges
        union
        select reachable_pairs.from_node_id, edges.to_node_id
        from reachable_pairs
        join edge_data edges
          on edges.from_node_id = reachable_pairs.to_node_id
      )
    select 1
    from reachable_pairs
    where reachable_pairs.from_node_id = reachable_pairs.to_node_id
  ) then raise exception 'pipeline contains a cycle'; end if;

  insert into public.project_pipelines (
    id, project_id, name, description
  ) values (
    p_pipeline_id, v_project_id, trim(p_name), trim(coalesce(p_description, ''))
  )
  on conflict on constraint project_pipelines_pkey do update set
    name = excluded.name,
    description = excluded.description
  where project_pipelines.project_id = v_project_id;

  delete from public.project_pipeline_nodes nodes
  where nodes.pipeline_id = p_pipeline_id;

  insert into public.project_pipeline_nodes (
    pipeline_id, id, node_kind, agent_id, position_x, position_y
  )
  select
    p_pipeline_id,
    nodes.id,
    nodes.node_kind,
    nodes.agent_id,
    nodes.position_x,
    nodes.position_y
  from jsonb_to_recordset(p_nodes) as nodes(
    id uuid, node_kind text, agent_id uuid, position_x integer, position_y integer
  );

  insert into public.project_pipeline_edges (
    pipeline_id, id, from_node_id, to_node_id
  )
  select
    p_pipeline_id,
    edges.id,
    edges.from_node_id,
    edges.to_node_id
  from jsonb_to_recordset(p_edges) as edges(
    id uuid, from_node_id uuid, to_node_id uuid
  );

  return query
  select
    pipelines.id,
    pipelines.name::text,
    pipelines.description::text,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', result_nodes.id,
          'kind', result_nodes.node_kind,
          'agentId', result_nodes.agent_id,
          'position', jsonb_build_object(
            'x', result_nodes.position_x,
            'y', result_nodes.position_y
          )
        ) order by result_nodes.position_x, result_nodes.position_y, result_nodes.id
      )
      from public.project_pipeline_nodes result_nodes
      where result_nodes.pipeline_id = pipelines.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', result_edges.id,
          'fromNodeId', result_edges.from_node_id,
          'toNodeId', result_edges.to_node_id
        ) order by result_edges.id
      )
      from public.project_pipeline_edges result_edges
      where result_edges.pipeline_id = pipelines.id
    ), '[]'::jsonb),
    pipelines.created_at,
    pipelines.updated_at
  from public.project_pipelines pipelines
  where pipelines.id = p_pipeline_id
    and pipelines.project_id = v_project_id;
end;
$$;

create function public.delete_project_pipeline(
  p_session_token_hash text,
  p_pipeline_id uuid
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

  delete from public.project_pipelines pipelines
  where pipelines.id = p_pipeline_id
    and pipelines.project_id = v_project_id;
  return found;
end;
$$;

revoke all on function public.list_project_pipelines(text) from public;
revoke all on function public.save_project_pipeline(
  text, uuid, text, text, jsonb, jsonb
) from public;
revoke all on function public.delete_project_pipeline(text, uuid) from public;

grant execute on function public.list_project_pipelines(text)
  to anon, authenticated;
grant execute on function public.save_project_pipeline(
  text, uuid, text, text, jsonb, jsonb
) to anon, authenticated;
grant execute on function public.delete_project_pipeline(text, uuid)
  to anon, authenticated;
