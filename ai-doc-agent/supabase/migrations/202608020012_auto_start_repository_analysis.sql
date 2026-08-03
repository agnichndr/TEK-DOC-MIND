alter table public.project_actions
  drop constraint project_actions_state_check;

alter table public.project_actions
  add column stage text not null default 'REPOSITORY_ANALYSIS',
  add column repository_analysis_state text not null default 'QUEUED',
  add column repository_group_snapshot jsonb,
  add column pipeline_snapshot jsonb,
  add column overview text,
  add column code_languages jsonb not null default '[]'::jsonb,
  add column global_context jsonb,
  add column global_context_blob_name varchar(1024),
  add column global_context_url varchar(2048),
  add column action_version integer not null default 1,
  add column error_message varchar(500),
  add column started_at timestamptz,
  add column repository_analysis_completed_at timestamptz,
  add constraint project_actions_state_check check (
    state in ('NEW', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED')
  ),
  add constraint project_actions_stage_check check (
    stage in ('REPOSITORY_ANALYSIS', 'PIPELINE_PENDING', 'COMPLETE', 'FAILED')
  ),
  add constraint project_actions_repository_analysis_state_check check (
    repository_analysis_state in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')
  ),
  add constraint project_actions_code_languages_array check (
    jsonb_typeof(code_languages) = 'array'
  ),
  add constraint project_actions_global_context_object check (
    global_context is null or jsonb_typeof(global_context) = 'object'
  ),
  add constraint project_actions_action_version_positive check (action_version > 0),
  add constraint project_actions_overview_length check (
    overview is null or char_length(overview) <= 6000
  );

update public.project_actions actions
set
  repository_group_snapshot = jsonb_build_object(
    'id', groups.id,
    'repositoryMode', groups.repository_mode,
    'name', groups.name,
    'description', groups.description,
    'repositories', groups.repositories
  ),
  pipeline_snapshot = jsonb_build_object(
    'id', pipelines.id,
    'name', pipelines.name,
    'description', pipelines.description,
    'defaultConnector', pipelines.default_connector,
    'defaultModel', pipelines.default_model,
    'nodes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', nodes.id,
          'kind', nodes.node_kind,
          'position', jsonb_build_object('x', nodes.position_x, 'y', nodes.position_y),
          'inputMediaUrls', nodes.input_media_urls
        ) || case
          when nodes.agent_id is not null then jsonb_build_object('agentId', nodes.agent_id)
          else '{}'::jsonb
        end || case
          when nodes.output_config is not null then jsonb_build_object('output', nodes.output_config)
          else '{}'::jsonb
        end
        order by nodes.id
      )
      from public.project_pipeline_nodes nodes
      where nodes.pipeline_id = pipelines.id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', edges.id,
          'fromNodeId', edges.from_node_id,
          'toNodeId', edges.to_node_id,
          'sourceAnchor', edges.source_anchor
        )
        order by edges.id
      )
      from public.project_pipeline_edges edges
      where edges.pipeline_id = pipelines.id
    ), '[]'::jsonb)
  )
from public.project_repository_groups groups,
     public.project_pipelines pipelines
where groups.project_id = actions.project_id
  and groups.id = actions.repository_group_id
  and pipelines.project_id = actions.project_id
  and pipelines.id = actions.pipeline_id;

alter table public.project_actions
  alter column repository_group_snapshot set not null,
  alter column pipeline_snapshot set not null;

drop function public.list_project_actions(text);
create function public.list_project_actions(p_session_token_hash text)
returns table (
  id uuid,
  repository_group_id uuid,
  repository_group_name text,
  pipeline_id uuid,
  pipeline_name text,
  action_type text,
  state text,
  stage text,
  repository_analysis_state text,
  overview text,
  code_languages jsonb,
  global_context_blob_name text,
  global_context_url text,
  action_version integer,
  error_message text,
  started_at timestamptz,
  repository_analysis_completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select
    actions.id,
    actions.repository_group_id,
    (actions.repository_group_snapshot ->> 'name')::text,
    actions.pipeline_id,
    (actions.pipeline_snapshot ->> 'name')::text,
    actions.action_type,
    actions.state,
    actions.stage,
    actions.repository_analysis_state,
    actions.overview,
    actions.code_languages,
    actions.global_context_blob_name::text,
    actions.global_context_url::text,
    actions.action_version,
    actions.error_message::text,
    actions.started_at,
    actions.repository_analysis_completed_at,
    actions.created_at,
    actions.updated_at
  from public.project_sessions sessions
  join public.project_actions actions
    on actions.project_id = sessions.project_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  order by actions.created_at desc, actions.id;
$$;

drop function public.create_project_document_action(text, uuid, uuid);
create function public.create_project_document_action(
  p_session_token_hash text,
  p_repository_group_id uuid,
  p_pipeline_id uuid
)
returns table (
  id uuid,
  repository_group_id uuid,
  repository_group_name text,
  pipeline_id uuid,
  pipeline_name text,
  action_type text,
  state text,
  stage text,
  repository_analysis_state text,
  overview text,
  code_languages jsonb,
  global_context_blob_name text,
  global_context_url text,
  action_version integer,
  error_message text,
  started_at timestamptz,
  repository_analysis_completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_action_id uuid;
  v_repository_group_snapshot jsonb;
  v_pipeline_snapshot jsonb;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  select jsonb_build_object(
    'id', groups.id,
    'repositoryMode', groups.repository_mode,
    'name', groups.name,
    'description', groups.description,
    'repositories', groups.repositories
  ) into v_repository_group_snapshot
  from public.project_repository_groups groups
  where groups.id = p_repository_group_id
    and groups.project_id = v_project_id;
  if not found then raise exception 'invalid project action references'; end if;

  select jsonb_build_object(
    'id', pipelines.id,
    'name', pipelines.name,
    'description', pipelines.description,
    'defaultConnector', pipelines.default_connector,
    'defaultModel', pipelines.default_model,
    'nodes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', nodes.id,
          'kind', nodes.node_kind,
          'position', jsonb_build_object('x', nodes.position_x, 'y', nodes.position_y),
          'inputMediaUrls', nodes.input_media_urls
        ) || case
          when nodes.agent_id is not null then jsonb_build_object('agentId', nodes.agent_id)
          else '{}'::jsonb
        end || case
          when nodes.output_config is not null then jsonb_build_object('output', nodes.output_config)
          else '{}'::jsonb
        end
        order by nodes.id
      )
      from public.project_pipeline_nodes nodes
      where nodes.pipeline_id = pipelines.id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', edges.id,
          'fromNodeId', edges.from_node_id,
          'toNodeId', edges.to_node_id,
          'sourceAnchor', edges.source_anchor
        )
        order by edges.id
      )
      from public.project_pipeline_edges edges
      where edges.pipeline_id = pipelines.id
    ), '[]'::jsonb)
  ) into v_pipeline_snapshot
  from public.project_pipelines pipelines
  where pipelines.id = p_pipeline_id
    and pipelines.project_id = v_project_id;
  if not found then raise exception 'invalid project action references'; end if;

  insert into public.project_actions (
    project_id,
    repository_group_id,
    pipeline_id,
    action_type,
    state,
    stage,
    repository_analysis_state,
    repository_group_snapshot,
    pipeline_snapshot,
    started_at
  ) values (
    v_project_id,
    p_repository_group_id,
    p_pipeline_id,
    'CREATE',
    'RUNNING',
    'REPOSITORY_ANALYSIS',
    'QUEUED',
    v_repository_group_snapshot,
    v_pipeline_snapshot,
    now()
  )
  returning project_actions.id into v_action_id;

  update public.projects
  set updated_at = now()
  where projects.id = v_project_id;

  return query
  select *
  from public.list_project_actions(p_session_token_hash) listed
  where listed.id = v_action_id;
end;
$$;

create function public.claim_project_action_repository_analysis(
  p_session_token_hash text,
  p_action_id uuid
)
returns table (
  action_id uuid,
  action_version integer,
  project_id uuid,
  project_name text,
  repository_group_snapshot jsonb,
  pipeline_snapshot jsonb
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

  return query
  with claimed as (
    update public.project_actions actions
    set repository_analysis_state = 'RUNNING', updated_at = now()
    where actions.id = p_action_id
      and actions.project_id = v_project_id
      and actions.state = 'RUNNING'
      and actions.stage = 'REPOSITORY_ANALYSIS'
      and actions.repository_analysis_state = 'QUEUED'
    returning actions.*
  )
  select
    claimed.id,
    claimed.action_version,
    claimed.project_id,
    projects.name::text,
    claimed.repository_group_snapshot,
    claimed.pipeline_snapshot
  from claimed
  join public.projects projects on projects.id = claimed.project_id;
end;
$$;

create function public.complete_project_action_repository_analysis(
  p_session_token_hash text,
  p_action_id uuid,
  p_overview text,
  p_code_languages jsonb,
  p_global_context jsonb,
  p_global_context_blob_name text,
  p_global_context_url text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_updated boolean;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return false; end if;

  if trim(coalesce(p_overview, '')) = ''
    or char_length(p_overview) > 6000
    or jsonb_typeof(p_code_languages) is distinct from 'array'
    or jsonb_typeof(p_global_context) is distinct from 'object'
    or octet_length(p_global_context::text) > 2000000
    or p_global_context::text ~* '"(credential|apiKey|accessToken|bearerToken|password|secretAccessKey|sessionToken|accessKeyId)"[[:space:]]*:'
    or trim(coalesce(p_global_context_blob_name, '')) !~ '/Actions/[0-9a-f-]+/v[1-9][0-9]*/Global_Context\.md$'
    or trim(coalesce(p_global_context_url, '')) !~ '^https://'
  then
    raise exception 'invalid repository analysis result';
  end if;

  update public.project_actions actions
  set
    repository_analysis_state = 'SUCCEEDED',
    stage = 'PIPELINE_PENDING',
    overview = trim(p_overview),
    code_languages = p_code_languages,
    global_context = p_global_context,
    global_context_blob_name = p_global_context_blob_name,
    global_context_url = p_global_context_url,
    error_message = null,
    repository_analysis_completed_at = now(),
    updated_at = now()
  where actions.id = p_action_id
    and actions.project_id = v_project_id
    and actions.state = 'RUNNING'
    and actions.stage = 'REPOSITORY_ANALYSIS'
    and actions.repository_analysis_state = 'RUNNING';
  v_updated := found;
  return v_updated;
end;
$$;

create function public.fail_project_action_repository_analysis(
  p_session_token_hash text,
  p_action_id uuid,
  p_error_message text
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_updated boolean;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return false; end if;

  update public.project_actions actions
  set
    state = 'FAILED',
    stage = 'FAILED',
    repository_analysis_state = 'FAILED',
    error_message = left(trim(coalesce(p_error_message, 'Repository analysis failed.')), 500),
    updated_at = now()
  where actions.id = p_action_id
    and actions.project_id = v_project_id
    and actions.repository_analysis_state in ('QUEUED', 'RUNNING');
  v_updated := found;
  return v_updated;
end;
$$;

revoke all on function public.list_project_actions(text) from public;
revoke all on function public.create_project_document_action(text, uuid, uuid) from public;
revoke all on function public.claim_project_action_repository_analysis(text, uuid) from public;
revoke all on function public.complete_project_action_repository_analysis(
  text, uuid, text, jsonb, jsonb, text, text
) from public;
revoke all on function public.fail_project_action_repository_analysis(text, uuid, text) from public;

grant execute on function public.list_project_actions(text) to anon, authenticated;
grant execute on function public.create_project_document_action(text, uuid, uuid) to anon, authenticated;
grant execute on function public.claim_project_action_repository_analysis(text, uuid) to anon, authenticated;
grant execute on function public.complete_project_action_repository_analysis(
  text, uuid, text, jsonb, jsonb, text, text
) to anon, authenticated;
grant execute on function public.fail_project_action_repository_analysis(text, uuid, text) to anon, authenticated;
