create function public.update_project_repository(
  p_session_token_hash text,
  p_repository_id uuid,
  p_purpose text
)
returns table (
  id uuid,
  github_repository_id text,
  owner text,
  name text,
  url text,
  visibility text,
  purpose text,
  default_branch text,
  has_stored_token boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  if char_length(coalesce(p_purpose, '')) > 500 then
    raise exception 'invalid repository purpose';
  end if;

  select sessions.project_id
  into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now();

  if v_project_id is null then
    return;
  end if;

  return query
  update public.repositories repositories
  set purpose = trim(coalesce(p_purpose, '')),
      updated_at = now()
  where repositories.id = p_repository_id
    and repositories.project_id = v_project_id
  returning
    repositories.id,
    repositories.github_repository_id,
    repositories.owner,
    repositories.name,
    repositories.url,
    repositories.visibility::text,
    repositories.purpose,
    repositories.default_branch,
    repositories.token_ciphertext is not null,
    repositories.created_at,
    repositories.updated_at;
end;
$$;

revoke all on function public.update_project_repository(text, uuid, text)
  from public;
grant execute on function public.update_project_repository(text, uuid, text)
  to anon, authenticated;
