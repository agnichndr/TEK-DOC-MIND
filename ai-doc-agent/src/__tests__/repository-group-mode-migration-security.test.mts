import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607310006_add_all_repositories_group_mode.sql",
  import.meta.url,
);

test("repository groups persist selected or all-project mode", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /add column repository_mode text not null default 'selected'/i);
  assert.match(migration, /repository_mode in \('all', 'selected'\)/i);
  assert.match(
    migration,
    /on conflict on constraint project_repository_groups_pkey/i,
  );
  assert.doesNotMatch(migration, /on conflict \(id\)/i);
});

test("all mode resolves current repositories and default branches server-side", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /when groups\.repository_mode = 'all'/i);
  assert.match(migration, /'branch', repositories\.default_branch/i);
  assert.match(migration, /repositories\.project_id = groups\.project_id/i);
});

test("all mode prevents deleting repositories it automatically covers", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const deletion = migration.slice(
    migration.indexOf("create or replace function public.delete_project_repository"),
    migration.indexOf("revoke all on function"),
  );
  assert.match(deletion, /groups\.project_id = v_project_id/i);
  assert.match(deletion, /groups\.repository_mode = 'all'/i);
});
