alter table public.project_agents
  drop constraint project_agents_project_connector_fkey;

alter table public.project_agents
  add constraint project_agents_project_connector_fkey
  foreign key (project_id, connector)
  references public.project_llm_connectors(project_id, connector)
  on delete cascade
  deferrable initially deferred;
