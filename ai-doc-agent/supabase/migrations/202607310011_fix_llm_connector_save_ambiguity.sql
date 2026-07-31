create or replace function public.save_project_llm_connector(
  p_session_token_hash text,
  p_connector text,
  p_summary jsonb,
  p_credential_ciphertext text,
  p_credential_nonce text,
  p_credential_auth_tag text,
  p_credential_key_version integer
)
returns table (
  connector text,
  summary jsonb,
  credential_ciphertext text,
  credential_nonce text,
  credential_auth_tag text,
  credential_key_version smallint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_project_id uuid;
  v_verified_at timestamptz;
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  begin
    v_verified_at := (p_summary ->> 'verifiedAt')::timestamptz;
  exception when invalid_datetime_format then
    raise exception 'invalid connector verification time';
  end;

  if p_connector not in (
      'openai', 'anthropic', 'gemini', 'azure_openai', 'bedrock', 'vertex_ai'
    )
    or jsonb_typeof(p_summary) is distinct from 'object'
    or p_summary ->> 'connector' <> p_connector
    or p_summary ->> 'status' <> 'connected'
    or v_verified_at is null
    or p_summary::text ~* '"(credential|apiKey|accessToken|bearerToken|password|secretAccessKey|sessionToken|accessKeyId)"[[:space:]]*:'
    or char_length(coalesce(p_credential_ciphertext, '')) not between 1 and 65536
    or char_length(coalesce(p_credential_nonce, '')) not between 1 and 128
    or char_length(coalesce(p_credential_auth_tag, '')) not between 1 and 128
    or p_credential_key_version not between 1 and 32767
    or not coalesce((
      (p_connector = 'openai'
        and p_summary ->> 'authenticationMethod' in ('api_key', 'access_token')
        and char_length(p_summary ->> 'defaultModel') between 1 and 256
        and p_summary ->> 'defaultModel' ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$')
      or (p_connector = 'anthropic'
        and p_summary ->> 'authenticationMethod' in ('api_key', 'bearer_token')
        and char_length(p_summary ->> 'defaultModel') between 1 and 256
        and p_summary ->> 'defaultModel' ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$')
      or (p_connector = 'gemini'
        and p_summary ->> 'authenticationMethod' in (
          'standard_api_key', 'authorization_api_key'
        ))
      or (p_connector = 'azure_openai'
        and p_summary ->> 'authenticationMethod' in ('api_key', 'entra_token')
        and char_length(p_summary ->> 'endpoint') between 1 and 512)
      or (p_connector = 'bedrock'
        and p_summary ->> 'authenticationMethod' = 'aws_access_keys'
        and char_length(p_summary ->> 'region') between 1 and 32)
      or (p_connector = 'vertex_ai'
        and p_summary ->> 'authenticationMethod' = 'oauth_access_token'
        and char_length(p_summary ->> 'projectId') between 1 and 63
        and char_length(p_summary ->> 'location') between 1 and 64)
    ), false)
  then raise exception 'invalid connector input'; end if;

  return query
  insert into public.project_llm_connectors (
    project_id,
    connector,
    summary,
    credential_ciphertext,
    credential_nonce,
    credential_auth_tag,
    credential_key_version
  )
  values (
    v_project_id,
    p_connector,
    p_summary,
    p_credential_ciphertext,
    p_credential_nonce,
    p_credential_auth_tag,
    p_credential_key_version
  )
  on conflict on constraint project_llm_connectors_pkey do update set
    summary = excluded.summary,
    credential_ciphertext = excluded.credential_ciphertext,
    credential_nonce = excluded.credential_nonce,
    credential_auth_tag = excluded.credential_auth_tag,
    credential_key_version = excluded.credential_key_version
  returning
    project_llm_connectors.connector,
    project_llm_connectors.summary,
    project_llm_connectors.credential_ciphertext,
    project_llm_connectors.credential_nonce,
    project_llm_connectors.credential_auth_tag,
    project_llm_connectors.credential_key_version,
    project_llm_connectors.created_at,
    project_llm_connectors.updated_at;
end;
$$;

revoke all on function public.save_project_llm_connector(
  text, text, jsonb, text, text, text, integer
) from public;

grant execute on function public.save_project_llm_connector(
  text, text, jsonb, text, text, text, integer
) to anon, authenticated;

