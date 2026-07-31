import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607310008_fix_repository_group_save_ambiguity.sql",
  import.meta.url,
);

test("repository-group save repair avoids ambiguous output-column references", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /create or replace function public\.save_project_repository_group/i,
  );
  assert.match(
    migration,
    /on conflict on constraint project_repository_groups_pkey/i,
  );
  assert.doesNotMatch(migration, /on conflict \(id\)/i);
  assert.match(migration, /where groups\.id = p_group_id/i);
});

test("repaired save RPC retains session-derived project isolation", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /sessions\.token_hash = p_session_token_hash/i);
  assert.match(migration, /repositories\.project_id = v_project_id/i);
  assert.match(
    migration,
    /where project_repository_groups\.project_id = v_project_id/i,
  );
});
