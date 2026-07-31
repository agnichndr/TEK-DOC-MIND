import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607310005_add_repository_group_path_selections.sql",
  import.meta.url,
);

test("existing folder scopes migrate to typed selected paths", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /repository - 'folderPath'/i);
  assert.match(migration, /'selectedPaths'/i);
  assert.match(migration, /'type', 'directory'/i);
});

test("database validates project ownership and bounded selected paths", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const save = migration.slice(
    migration.indexOf("create or replace function public.save_project_repository_group"),
    migration.indexOf("revoke all on function"),
  );
  assert.match(save, /sessions\.token_hash = p_session_token_hash/i);
  assert.match(save, /repositories\.project_id = v_project_id/i);
  assert.match(save, /jsonb_array_length\(v_repository -> 'selectedPaths'\) not between 1 and 500/i);
  assert.match(save, /not in \('file', 'directory'\)/i);
});
