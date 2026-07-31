import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608010004_cascade_agents_on_connector_delete.sql",
  import.meta.url,
);

test("connector deletion cascades to agents that depend on it", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /drop constraint project_agents_project_connector_fkey/i,
  );
  assert.match(
    sql,
    /foreign key \(project_id, connector\)[\s\S]*references public\.project_llm_connectors\(project_id, connector\)[\s\S]*on delete cascade/i,
  );
  assert.match(sql, /deferrable initially deferred/i);
  assert.doesNotMatch(sql, /disable row level security/i);
  assert.doesNotMatch(sql, /grant\s+.+\s+on\s+table/i);
});
