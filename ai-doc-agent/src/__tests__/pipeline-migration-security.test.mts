import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608010005_create_project_pipelines.sql",
  import.meta.url,
);

test("pipeline tables force RLS and revoke direct client access", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of [
    "project_pipelines",
    "project_pipeline_nodes",
    "project_pipeline_edges",
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} force row level security`, "i"),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"),
    );
  }
});

test("pipeline RPCs derive project scope from a live session", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(
    sql,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/i,
  );
  assert.match(
    sql,
    /agents\.project_id = v_project_id/i,
  );
  assert.match(
    sql,
    /where pipelines\.id = p_pipeline_id[\s\S]*pipelines\.project_id = v_project_id/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.save_project_pipeline/i,
  );
  assert.doesNotMatch(sql, /grant\s+.+\s+on\s+table/i);
});

test("pipeline graph integrity is enforced in PostgreSQL", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /node_kind = 'source'[\s\S]*agent_id is null/i);
  assert.match(sql, /pipeline contains a cycle/i);
  assert.match(sql, /pipeline contains unreachable nodes/i);
  assert.match(
    sql,
    /references public\.project_agents\(id\) on delete cascade/i,
  );
  assert.match(sql, /delete_pipeline_node_descendants/i);
});
