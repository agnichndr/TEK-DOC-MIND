update public.project_repository_groups groups
set repositories = (
  select jsonb_agg(
    (repository - 'folderPath') ||
    jsonb_build_object(
      'selectedPaths',
      jsonb_build_array(jsonb_build_object(
        'path', coalesce(repository ->> 'folderPath', ''),
        'type', 'directory'
      ))
    )
  )
  from jsonb_array_elements(groups.repositories) repository
);

create or replace function public.save_project_repository_group(
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
  v_selected_path jsonb;
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
        repository ->> 'branch'
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

revoke all on function public.save_project_repository_group(
  text, uuid, text, text, jsonb
) from public;
grant execute on function public.save_project_repository_group(
  text, uuid, text, text, jsonb
) to anon, authenticated;
