create or replace function public.enforce_project_pipeline_output_assembly()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline_id uuid;
  v_output record;
begin
  if tg_table_name = 'project_pipelines' then
    v_pipeline_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_pipeline_id := case
      when tg_op = 'DELETE' then old.pipeline_id
      else new.pipeline_id
    end;
  end if;

  if not exists (
    select 1
    from public.project_pipelines pipelines
    where pipelines.id = v_pipeline_id
  ) then
    return null;
  end if;

  if not exists (
    select 1
    from public.project_pipeline_nodes nodes
    where nodes.pipeline_id = v_pipeline_id
      and nodes.node_kind = 'source'
  ) then
    raise exception 'pipeline requires a GitHub source node';
  end if;

  if not exists (
    select 1
    from public.project_pipeline_nodes nodes
    where nodes.pipeline_id = v_pipeline_id
      and nodes.node_kind = 'agent'
  ) then
    raise exception 'pipeline requires at least one agent node';
  end if;

  if not exists (
    select 1
    from public.project_pipeline_nodes nodes
    where nodes.pipeline_id = v_pipeline_id
      and nodes.output_config is not null
  ) then
    raise exception 'pipeline requires at least one output file';
  end if;

  for v_output in
    select nodes.id, nodes.output_config
    from public.project_pipeline_nodes nodes
    where nodes.pipeline_id = v_pipeline_id
      and nodes.output_config is not null
  loop
    if v_output.output_config ? 'sourceNodeIds' then
      if jsonb_typeof(v_output.output_config -> 'sourceNodeIds') <> 'array' then
        raise exception 'invalid output source mapping';
      end if;
      if jsonb_array_length(v_output.output_config -> 'sourceNodeIds') > 50 then
        raise exception 'invalid output source mapping';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(v_output.output_config -> 'sourceNodeIds') values_(value)
        where jsonb_typeof(values_.value) <> 'string'
          or values_.value #>> '{}' !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      ) then
        raise exception 'invalid output source mapping';
      end if;

      if jsonb_array_length(v_output.output_config -> 'sourceNodeIds') <> (
        select count(distinct values_.value)
        from jsonb_array_elements_text(
          v_output.output_config -> 'sourceNodeIds'
        ) values_(value)
      ) then
        raise exception 'invalid output source mapping';
      end if;

      if exists (
        select 1
        from jsonb_array_elements_text(
          v_output.output_config -> 'sourceNodeIds'
        ) values_(value)
        left join public.project_pipeline_nodes sources
          on sources.pipeline_id = v_pipeline_id
          and sources.id = values_.value::uuid
        where sources.id is null
      ) then
        raise exception 'invalid output source mapping';
      end if;

    end if;

    if v_output.output_config ? 'position' then
      if jsonb_typeof(v_output.output_config -> 'position') <> 'object'
        or jsonb_typeof(v_output.output_config -> 'position' -> 'x') <> 'number'
        or jsonb_typeof(v_output.output_config -> 'position' -> 'y') <> 'number'
      then
        raise exception 'invalid output position';
      end if;
      if (v_output.output_config -> 'position' ->> 'x')::numeric not between 0 and 4000
        or (v_output.output_config -> 'position' ->> 'y')::numeric not between 0 and 4000
        or mod((v_output.output_config -> 'position' ->> 'x')::numeric, 1) <> 0
        or mod((v_output.output_config -> 'position' ->> 'y')::numeric, 1) <> 0
      then
        raise exception 'invalid output position';
      end if;
    end if;

    if v_output.output_config ? 'sourceHeaders' then
      if jsonb_typeof(v_output.output_config -> 'sourceHeaders') <> 'object' then
        raise exception 'invalid output source headers';
      end if;
      if (
        select count(*)
        from jsonb_object_keys(
          v_output.output_config -> 'sourceHeaders'
        ) header_keys(key)
      ) > 50 then
        raise exception 'invalid output source headers';
      end if;

      if exists (
        select 1
        from jsonb_each(v_output.output_config -> 'sourceHeaders') headers(key, value)
        where headers.key !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or jsonb_typeof(headers.value) <> 'string'
          or char_length(btrim(headers.value #>> '{}')) not between 1 and 200
          or case
            when v_output.output_config ? 'sourceNodeIds' then
              not (
                v_output.output_config -> 'sourceNodeIds'
                  @> jsonb_build_array(headers.key)
              )
            else headers.key <> v_output.id::text
          end
      ) then
        raise exception 'invalid output source headers';
      end if;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.enforce_project_pipeline_output_assembly()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
