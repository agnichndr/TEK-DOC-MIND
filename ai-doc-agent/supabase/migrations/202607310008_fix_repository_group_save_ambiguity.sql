create or replace function public.save_project_repository_group(
  p_session_token_hash text,
  p_group_id uuid,
  p_repository_mode text,
  p_name text,
  p_description text,
  p_repositories jsonb
)
returns table (
  id uuid,
  repository_mode text,
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
  v_repositories jsonb;
  v_repository jsonb;
  v_repository_id uuid;
  v_selected_path jsonb;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  if coalesce(p_repository_mode, '') not in ('all', 'selected')
    or char_length(trim(coalesce(p_name, ''))) not between 1 and 100
    or char_length(trim(coalesce(p_description, ''))) > 500
  then
    raise exception 'invalid repository group input';
  end if;

  if p_repository_mode = 'all' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'repositoryId', repositories.id,
        'branch', repositories.default_branch,
        'selectedPaths', jsonb_build_array(
          jsonb_build_object('path', '', 'type', 'directory')
        ),
        'logicalContext', ''
      )
      order by lower(repositories.owner), lower(repositories.name)
    ), '[]'::jsonb)
    into v_repositories
    from public.repositories
    where repositories.project_id = v_project_id;
  else
    v_repositories := p_repositories;
  end if;

  if jsonb_typeof(v_repositories) is distinct from 'array'
    or jsonb_array_length(v_repositories) not between 1 and 200
    or (
      select count(distinct concat(
        repository ->> 'repositoryId', ':',
        repository ->> 'branch'
      ))
      from jsonb_array_elements(v_repositories) repository
    ) <> jsonb_array_length(v_repositories)
  then
    raise exception 'invalid repository group input';
  end if;

  for v_repository in select value from jsonb_array_elements(v_repositories)
  loop
    begin
      v_repository_id := (v_repository ->> 'repositoryId')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid repository reference';
    end;

    if jsonb_typeof(v_repository) is distinct from 'object'
      or char_length(trim(coalesce(v_repository ->> 'branch', ''))) not between 1 and 255
      or char_length(coalesce(v_repository ->> 'logicalContext', '')) > 1000
      or jsonb_typeof(v_repository -> 'selectedPaths') is distinct from 'array'
      or jsonb_array_length(v_repository -> 'selectedPaths') not between 1 and 500
      or (
        select count(distinct selected_path ->> 'path')
        from jsonb_array_elements(v_repository -> 'selectedPaths') selected_path
      ) <> jsonb_array_length(v_repository -> 'selectedPaths')
      or not exists (
        select 1 from public.repositories repositories
        where repositories.id = v_repository_id
          and repositories.project_id = v_project_id
          and (
            p_repository_mode = 'selected'
            or repositories.default_branch = v_repository ->> 'branch'
          )
      )
    then
      raise exception 'invalid repository reference';
    end if;

    for v_selected_path in
      select value
      from jsonb_array_elements(v_repository -> 'selectedPaths')
    loop
      if jsonb_typeof(v_selected_path) is distinct from 'object'
        or coalesce(v_selected_path ->> 'type', '') not in ('file', 'directory')
        or char_length(coalesce(v_selected_path ->> 'path', '')) > 1024
        or coalesce(v_selected_path ->> 'path', '') ~ '(^/|/$|(^|/)\.\.?(/|$))'
        or position(chr(92) in coalesce(v_selected_path ->> 'path', '')) > 0
      then
        raise exception 'invalid repository path selection';
      end if;
    end loop;
  end loop;

  insert into public.project_repository_groups (
    id, project_id, repository_mode, name, description, repositories
  )
  values (
    p_group_id,
    v_project_id,
    p_repository_mode,
    trim(p_name),
    trim(p_description),
    v_repositories
  )
  on conflict on constraint project_repository_groups_pkey do update set
    repository_mode = excluded.repository_mode,
    name = excluded.name,
    description = excluded.description,
    repositories = excluded.repositories
  where project_repository_groups.project_id = v_project_id;

  return query
  select
    groups.id,
    groups.repository_mode,
    groups.name::text,
    groups.description::text,
    case
      when groups.repository_mode = 'all' then (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'repositoryId', repositories.id,
            'branch', repositories.default_branch,
            'selectedPaths', jsonb_build_array(
              jsonb_build_object('path', '', 'type', 'directory')
            ),
            'logicalContext', ''
          )
          order by lower(repositories.owner), lower(repositories.name)
        ), '[]'::jsonb)
        from public.repositories
        where repositories.project_id = v_project_id
      )
      else groups.repositories
    end,
    groups.created_at,
    groups.updated_at
  from public.project_repository_groups groups
  where groups.id = p_group_id
    and groups.project_id = v_project_id;
end;
$$;

revoke all on function public.save_project_repository_group(
  text, uuid, text, text, text, jsonb
) from public;

grant execute on function public.save_project_repository_group(
  text, uuid, text, text, text, jsonb
) to anon, authenticated;
