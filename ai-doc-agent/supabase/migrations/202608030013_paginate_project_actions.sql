create function public.list_project_actions_page(
  p_session_token_hash text,
  p_page integer,
  p_page_size integer,
  p_repository_group_ids uuid[],
  p_pipeline_ids uuid[],
  p_sort_by text,
  p_sort_direction text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_offset bigint;
begin
  if p_page is null or p_page < 1 or p_page > 100000 then
    raise exception 'Invalid action page.' using errcode = '22023';
  end if;
  if p_page_size is null or p_page_size not in (10, 20, 50) then
    raise exception 'Invalid action page size.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_repository_group_ids), 0) > 100
    or array_position(p_repository_group_ids, null) is not null then
    raise exception 'Invalid repository group filter.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_pipeline_ids), 0) > 100
    or array_position(p_pipeline_ids, null) is not null then
    raise exception 'Invalid pipeline filter.' using errcode = '22023';
  end if;
  if p_sort_by is null
    or p_sort_by not in ('action', 'repositoryGroup', 'pipeline', 'state', 'createdAt') then
    raise exception 'Invalid action sort column.' using errcode = '22023';
  end if;
  if p_sort_direction is null or p_sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid action sort direction.' using errcode = '22023';
  end if;

  v_offset := (p_page::bigint - 1) * p_page_size;

  return (
    with filtered_actions as (
      select
        actions.id,
        actions.repository_group_id,
        (actions.repository_group_snapshot ->> 'name')::text as repository_group_name,
        actions.pipeline_id,
        (actions.pipeline_snapshot ->> 'name')::text as pipeline_name,
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
        and (
          coalesce(cardinality(p_repository_group_ids), 0) = 0
          or actions.repository_group_id = any(p_repository_group_ids)
        )
        and (
          coalesce(cardinality(p_pipeline_ids), 0) = 0
          or actions.pipeline_id = any(p_pipeline_ids)
        )
    ), ordered_actions as (
      select
        filtered_actions.*,
        row_number() over (
          order by
            case when p_sort_by = 'action' and p_sort_direction = 'asc' then id end asc,
            case when p_sort_by = 'action' and p_sort_direction = 'desc' then id end desc,
            case when p_sort_by = 'repositoryGroup' and p_sort_direction = 'asc' then repository_group_name end asc,
            case when p_sort_by = 'repositoryGroup' and p_sort_direction = 'desc' then repository_group_name end desc,
            case when p_sort_by = 'pipeline' and p_sort_direction = 'asc' then pipeline_name end asc,
            case when p_sort_by = 'pipeline' and p_sort_direction = 'desc' then pipeline_name end desc,
            case when p_sort_by = 'state' and p_sort_direction = 'asc' then state end asc,
            case when p_sort_by = 'state' and p_sort_direction = 'desc' then state end desc,
            case when p_sort_by = 'createdAt' and p_sort_direction = 'asc' then created_at end asc,
            case when p_sort_by = 'createdAt' and p_sort_direction = 'desc' then created_at end desc,
            case when p_sort_direction = 'asc' then id end asc,
            case when p_sort_direction = 'desc' then id end desc
        ) as sort_ordinal
      from filtered_actions
    ), paged_actions as (
      select *
      from ordered_actions
      where sort_ordinal > v_offset
        and sort_ordinal <= v_offset + p_page_size
    )
    select jsonb_build_object(
      'items', coalesce(
        (
          select jsonb_agg(
            to_jsonb(paged_actions) - 'sort_ordinal'
            order by sort_ordinal
          )
          from paged_actions
        ),
        '[]'::jsonb
      ),
      'total_count', (select count(*) from filtered_actions)
    )
  );
end;
$$;

revoke all on function public.list_project_actions_page(
  text, integer, integer, uuid[], uuid[], text, text
) from public;

grant execute on function public.list_project_actions_page(
  text, integer, integer, uuid[], uuid[], text, text
) to anon, authenticated;
