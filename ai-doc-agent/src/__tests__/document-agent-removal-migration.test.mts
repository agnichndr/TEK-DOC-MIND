import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607310007_remove_document_agent_builder.sql",
  import.meta.url,
);

test("document-agent removal migration drops the public RPC surface and table", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /drop function if exists public\.create_document_agent/i);
  assert.match(sql, /drop function if exists public\.list_document_agents/i);
  assert.match(sql, /drop function if exists public\.update_document_agent/i);
  assert.match(sql, /drop table if exists public\.document_agents/i);
});

test("resource deletion RPCs no longer depend on document agents", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const resourceFunctions = sql.slice(
    sql.indexOf("create or replace function public.delete_project_repository_group"),
  );

  assert.doesNotMatch(resourceFunctions, /from public\.document_agents/i);
  assert.match(
    resourceFunctions,
    /and project_repository_groups\.project_id = v_project_id/i,
  );
  assert.match(
    resourceFunctions,
    /where project_llm_connectors\.project_id = v_project_id/i,
  );
});
