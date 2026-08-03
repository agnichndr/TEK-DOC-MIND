import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608030013_paginate_project_actions.sql",
  import.meta.url,
);
const serviceUrl = new URL(
  "../services/projectActionService.ts",
  import.meta.url,
);

test("action pagination is performed by a bounded project-session RPC", async () => {
  const [sql, service] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(serviceUrl, "utf8"),
  ]);

  assert.match(sql, /create function public\.list_project_actions_page/i);
  assert.match(
    sql,
    /sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/i,
  );
  assert.match(sql, /p_page_size not in \(10, 20, 50\)/i);
  assert.match(sql, /cardinality\(p_repository_group_ids\)[\s\S]*> 100/i);
  assert.match(sql, /cardinality\(p_pipeline_ids\)[\s\S]*> 100/i);
  assert.match(sql, /row_number\(\) over/i);
  assert.match(sql, /revoke all on function public\.list_project_actions_page/i);
  assert.match(sql, /grant execute on function public\.list_project_actions_page/i);
  assert.match(service, /"list_project_actions_page"/);
  assert.doesNotMatch(
    service,
    /listProjectDocumentActionsPage[\s\S]*await listProjectDocumentActions\(/,
  );
});
