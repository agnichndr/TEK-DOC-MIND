alter table public.project_repository_groups
  add constraint project_repository_groups_project_id_id_key
  unique (project_id, id);

alter table public.project_pipelines
  add constraint project_pipelines_project_id_id_key
  unique (project_id, id);

create table public.project_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  repository_group_id uuid not null,
  pipeline_id uuid not null,
  action_type text not null default 'CREATE',
  state text not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_actions_repository_group_fkey
    foreign key (project_id, repository_group_id)
    references public.project_repository_groups(project_id, id)
    on delete cascade,
  constraint project_actions_pipeline_fkey
    foreign key (project_id, pipeline_id)
    references public.project_pipelines(project_id, id)
    on delete cascade,
  constraint project_actions_type_check check (action_type = 'CREATE'),
  constraint project_actions_state_check check (state = 'NEW')
);

create index project_actions_project_created_idx
  on public.project_actions(project_id, created_at desc);
create index project_actions_repository_group_idx
  on public.project_actions(project_id, repository_group_id);
create index project_actions_pipeline_idx
  on public.project_actions(project_id, pipeline_id);

alter table public.project_actions enable row level security;
alter table public.project_actions force row level security;
revoke all on table public.project_actions from anon, authenticated;

create trigger project_actions_set_updated_at
before update on public.project_actions
for each row execute function public.set_updated_at();

create function public.list_project_actions(p_session_token_hash text)
returns table (
  id uuid,
  repository_group_id uuid,
  repository_group_name text,
  pipeline_id uuid,
  pipeline_name text,
  action_type text,
  state text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select
    actions.id,
    actions.repository_group_id,
    groups.name::text,
    actions.pipeline_id,
    pipelines.name::text,
    actions.action_type,
    actions.state,
    actions.created_at,
    actions.updated_at
  from public.project_sessions sessions
  join public.project_actions actions
    on actions.project_id = sessions.project_id
  join public.project_repository_groups groups
    on groups.project_id = actions.project_id
   and groups.id = actions.repository_group_id
  join public.project_pipelines pipelines
    on pipelines.project_id = actions.project_id
   and pipelines.id = actions.pipeline_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  order by actions.created_at desc, actions.id;
$$;

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
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_action_id uuid;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  if not exists (
    select 1
    from public.project_repository_groups groups
    where groups.id = p_repository_group_id
      and groups.project_id = v_project_id
  ) or not exists (
    select 1
    from public.project_pipelines pipelines
    where pipelines.id = p_pipeline_id
      and pipelines.project_id = v_project_id
  ) then
    raise exception 'invalid project action references';
  end if;

  insert into public.project_actions (
    project_id,
    repository_group_id,
    pipeline_id,
    action_type,
    state
  ) values (
    v_project_id,
    p_repository_group_id,
    p_pipeline_id,
    'CREATE',
    'NEW'
  )
  returning project_actions.id into v_action_id;

  update public.projects
  set updated_at = now()
  where projects.id = v_project_id;

  return query
  select
    actions.id,
    actions.repository_group_id,
    groups.name::text,
    actions.pipeline_id,
    pipelines.name::text,
    actions.action_type,
    actions.state,
    actions.created_at,
    actions.updated_at
  from public.project_actions actions
  join public.project_repository_groups groups
    on groups.project_id = actions.project_id
   and groups.id = actions.repository_group_id
  join public.project_pipelines pipelines
    on pipelines.project_id = actions.project_id
   and pipelines.id = actions.pipeline_id
  where actions.id = v_action_id
    and actions.project_id = v_project_id;
end;
$$;

revoke all on function public.list_project_actions(text) from public;
revoke all on function public.create_project_document_action(
  text, uuid, uuid
) from public;

grant execute on function public.list_project_actions(text)
  to anon, authenticated;
grant execute on function public.create_project_document_action(
  text, uuid, uuid
) to anon, authenticated;
