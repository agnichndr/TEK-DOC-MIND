create table if not exists public.project_uploads (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_pipeline_id uuid references public.project_pipelines(id) on delete set null,
  original_file_name varchar(255) not null,
  media_url varchar(2048) not null,
  blob_name varchar(1024) not null,
  content_type varchar(255) not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint project_uploads_file_name_check check (
    char_length(original_file_name) between 1 and 255
    and original_file_name !~ '[/\\]'
    and original_file_name !~ '[[:cntrl:]]'
  ),
  constraint project_uploads_media_url_check check (
    char_length(media_url) between 1 and 2048
    and media_url ~ '^https://[a-z0-9]{3,24}\.blob\.core\.windows\.net/'
  ),
  constraint project_uploads_blob_name_check check (
    char_length(blob_name) between 1 and 1024
    and blob_name !~ '(^|/)\.\.(/|$)'
    and blob_name !~ '[[:cntrl:]]'
  ),
  constraint project_uploads_content_type_check check (
    char_length(content_type) between 1 and 255
    and content_type !~ '[[:cntrl:]]'
  ),
  constraint project_uploads_size_check check (
    size_bytes between 1 and 10485760
  ),
  constraint project_uploads_project_media_unique unique (project_id, media_url),
  constraint project_uploads_blob_name_unique unique (blob_name)
);

create index if not exists project_uploads_project_created_idx
  on public.project_uploads(project_id, created_at, id);

alter table public.project_uploads enable row level security;
alter table public.project_uploads force row level security;
revoke all on table public.project_uploads from anon, authenticated;

alter table public.project_pipeline_nodes
  add column if not exists input_media_urls jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_pipeline_nodes_input_media_urls_check'
      and conrelid = 'public.project_pipeline_nodes'::regclass
  ) then
    alter table public.project_pipeline_nodes
      add constraint project_pipeline_nodes_input_media_urls_check check (
        jsonb_typeof(input_media_urls) = 'array'
        and jsonb_array_length(input_media_urls) <= 20
      );
  end if;
end;
$$;

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
        'inputMediaUrls', nodes.input_media_urls,
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

create or replace function public.list_project_uploads(p_session_token_hash text)
returns table (
  id uuid,
  source_pipeline_id uuid,
  original_file_name text,
  media_url text,
  content_type text,
  size_bytes bigint,
  created_at timestamptz
)
language sql security definer set search_path = '' stable
as $$
  select
    uploads.id,
    uploads.source_pipeline_id,
    uploads.original_file_name::text,
    uploads.media_url::text,
    uploads.content_type::text,
    uploads.size_bytes,
    uploads.created_at
  from public.project_sessions sessions
  join public.project_uploads uploads
    on uploads.project_id = sessions.project_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  order by uploads.created_at, uploads.id;
$$;

create or replace function public.save_project_pipeline_with_uploads(
  p_session_token_hash text,
  p_pipeline_id uuid,
  p_name text,
  p_description text,
  p_default_connector text,
  p_default_model text,
  p_yaml_definition text,
  p_nodes jsonb,
  p_edges jsonb,
  p_node_media jsonb,
  p_uploads jsonb
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
begin
  select sessions.project_id into v_project_id
  from public.project_sessions sessions
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now()
  limit 1;
  if not found then return; end if;

  if jsonb_typeof(p_nodes) <> 'array'
    or jsonb_typeof(p_node_media) <> 'array'
    or jsonb_typeof(p_uploads) <> 'array'
  then raise exception 'invalid pipeline upload input'; end if;

  if jsonb_array_length(p_node_media) <> jsonb_array_length(p_nodes)
    or jsonb_array_length(p_uploads) > 20
    or (
      select coalesce(sum((uploads.size_bytes)::bigint), 0)
      from jsonb_to_recordset(p_uploads) as uploads(size_bytes bigint)
    ) > 52428800
  then raise exception 'invalid pipeline upload input'; end if;

  perform * from public.save_project_pipeline(
    p_session_token_hash,
    p_pipeline_id,
    p_name,
    p_description,
    p_default_connector,
    p_default_model,
    p_yaml_definition,
    p_nodes,
    p_edges
  );

  if not exists (
    select 1 from public.project_pipelines pipelines
    where pipelines.id = p_pipeline_id and pipelines.project_id = v_project_id
  ) then raise exception 'invalid pipeline scope'; end if;

  if (
    select count(distinct media.node_id)
    from jsonb_to_recordset(p_node_media) as media(node_id uuid, media_urls jsonb)
  ) <> jsonb_array_length(p_node_media)
    or exists (
      select 1
      from jsonb_to_recordset(p_node_media) as media(node_id uuid, media_urls jsonb)
      left join public.project_pipeline_nodes nodes
        on nodes.pipeline_id = p_pipeline_id and nodes.id = media.node_id
      where media.node_id is null
        or nodes.id is null
        or jsonb_typeof(media.media_urls) <> 'array'
    )
  then raise exception 'invalid pipeline node media'; end if;

  if exists (
      select 1
      from jsonb_to_recordset(p_node_media) as media(node_id uuid, media_urls jsonb)
      where jsonb_array_length(media.media_urls) > 20
        or jsonb_array_length(media.media_urls) <> (
          select count(distinct media_values.value)
          from jsonb_array_elements_text(media.media_urls) media_values(value)
        )
        or exists (
          select 1 from jsonb_array_elements(media.media_urls) media_values(value)
          where jsonb_typeof(media_values.value) <> 'string'
            or char_length(media_values.value #>> '{}') not between 1 and 2048
            or media_values.value #>> '{}' !~ '^https://[a-z0-9]{3,24}\.blob\.core\.windows\.net/'
        )
    )
  then raise exception 'invalid pipeline node media'; end if;

  if (
    select count(distinct uploads.id)
    from jsonb_to_recordset(p_uploads) as uploads(id uuid)
  ) <> jsonb_array_length(p_uploads)
    or exists (
      select 1 from jsonb_to_recordset(p_uploads) as uploads(
        id uuid,
        original_file_name text,
        media_url text,
        blob_name text,
        content_type text,
        size_bytes bigint
      )
      where uploads.id is null
        or char_length(uploads.original_file_name) not between 1 and 255
        or uploads.original_file_name ~ '[/\\]'
        or uploads.original_file_name ~ '[[:cntrl:]]'
        or char_length(uploads.media_url) not between 1 and 2048
        or uploads.media_url !~ '^https://[a-z0-9]{3,24}\.blob\.core\.windows\.net/'
        or char_length(uploads.blob_name) not between 1 and 1024
        or uploads.blob_name ~ '(^|/)\.\.(/|$)'
        or uploads.blob_name ~ '[[:cntrl:]]'
        or char_length(uploads.content_type) not between 1 and 255
        or uploads.content_type ~ '[[:cntrl:]]'
        or uploads.size_bytes not between 1 and 10485760
    )
  then raise exception 'invalid project uploads'; end if;

  insert into public.project_uploads (
    id,
    project_id,
    source_pipeline_id,
    original_file_name,
    media_url,
    blob_name,
    content_type,
    size_bytes
  )
  select
    uploads.id,
    v_project_id,
    p_pipeline_id,
    uploads.original_file_name,
    uploads.media_url,
    uploads.blob_name,
    uploads.content_type,
    uploads.size_bytes
  from jsonb_to_recordset(p_uploads) as uploads(
    id uuid,
    original_file_name text,
    media_url text,
    blob_name text,
    content_type text,
    size_bytes bigint
  );

  if exists (
    select 1
    from jsonb_to_recordset(p_node_media) as media(node_id uuid, media_urls jsonb)
    cross join lateral jsonb_array_elements_text(media.media_urls) urls(media_url)
    left join public.project_uploads uploads
      on uploads.project_id = v_project_id and uploads.media_url = urls.media_url
    where uploads.id is null
  ) then raise exception 'pipeline media does not belong to project'; end if;

  update public.project_pipeline_nodes nodes
  set input_media_urls = media.media_urls
  from jsonb_to_recordset(p_node_media) as media(node_id uuid, media_urls jsonb)
  where nodes.pipeline_id = p_pipeline_id and nodes.id = media.node_id;

  return query
  select listed.*
  from public.list_project_pipelines(p_session_token_hash) listed
  where listed.id = p_pipeline_id;
end;
$$;

create or replace function public.list_project_upload_blob_names(p_session_token_hash text)
returns table (blob_name text)
language sql security definer set search_path = '' stable
as $$
  select uploads.blob_name::text
  from public.project_sessions sessions
  join public.project_uploads uploads on uploads.project_id = sessions.project_id
  where sessions.token_hash = p_session_token_hash
    and sessions.expires_at > now();
$$;

revoke all on function public.list_project_pipelines(text) from public;
revoke all on function public.list_project_uploads(text) from public;
revoke all on function public.save_project_pipeline(
  text, uuid, text, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.save_project_pipeline_with_uploads(
  text, uuid, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb
) from public;
revoke all on function public.list_project_upload_blob_names(text) from public;

grant execute on function public.list_project_pipelines(text) to anon, authenticated;
grant execute on function public.list_project_uploads(text) to anon, authenticated;
grant execute on function public.save_project_pipeline_with_uploads(
  text, uuid, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb
) to anon, authenticated;
grant execute on function public.list_project_upload_blob_names(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
