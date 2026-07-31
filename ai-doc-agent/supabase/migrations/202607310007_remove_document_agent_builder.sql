drop function if exists public.create_document_agent(
  text, text, text, text
);
drop function if exists public.list_document_agents(text);
drop function if exists public.update_document_agent(
  text, uuid, text, text, text, jsonb
);

create or replace function public.delete_project_repository_group(
  p_session_token_hash text,
  p_group_id uuid
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

  delete from public.project_repository_groups
  where project_repository_groups.id = p_group_id
    and project_repository_groups.project_id = v_project_id;
  return found;
end;
$$;

create or replace function public.delete_project_llm_connector(
  p_session_token_hash text,
  p_connector text
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

  delete from public.project_llm_connectors
  where project_llm_connectors.project_id = v_project_id
    and project_llm_connectors.connector = p_connector;
  return found;
end;
$$;

drop table if exists public.document_agents;

revoke all on function public.delete_project_repository_group(text, uuid)
  from public;
revoke all on function public.delete_project_llm_connector(text, text)
  from public;

grant execute on function public.delete_project_repository_group(text, uuid)
  to anon, authenticated;
grant execute on function public.delete_project_llm_connector(text, text)
  to anon, authenticated;
