create function public.delete_project_repository(
  p_session_token_hash text,
  p_repository_id uuid,
  p_repository_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_deleted_id uuid;
begin
  select project_sessions.project_id
  into v_project_id
  from public.project_sessions
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
  limit 1;

  if not found then
    return false;
  end if;

  delete from public.repositories
  where repositories.id = p_repository_id
    and repositories.project_id = v_project_id
    and repositories.name = p_repository_name
  returning repositories.id into v_deleted_id;

  if v_deleted_id is null then
    return false;
  end if;

  update public.projects
  set updated_at = now()
  where projects.id = v_project_id;

  return true;
end;
$$;

create function public.delete_project(
  p_session_token_hash text,
  p_project_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select projects.id
  into v_project_id
  from public.project_sessions
  join public.projects
    on projects.id = project_sessions.project_id
  where project_sessions.token_hash = p_session_token_hash
    and project_sessions.expires_at > now()
    and projects.name = p_project_name
  limit 1;

  if not found then
    return false;
  end if;

  delete from public.projects
  where projects.id = v_project_id;

  return found;
end;
$$;

revoke all on function public.delete_project_repository(text, uuid, text)
  from public;
revoke all on function public.delete_project(text, text) from public;

grant execute on function public.delete_project_repository(text, uuid, text)
  to anon, authenticated;
grant execute on function public.delete_project(text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
