import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608010003_update_project_repository.sql",
  import.meta.url,
);

test("repository updates remain inside the live project session", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /sessions\.expires_at > now\(\)/i);
  assert.match(migration, /repositories\.project_id = v_project_id/i);
  assert.match(migration, /repositories\.id = p_repository_id/i);
  assert.match(migration, /revoke all on function public\.update_project_repository/i);
});

test("repository update action validates input and checks the server session", async () => {
  const source = await readFile(
    new URL("../actions/repositoryActions.ts", import.meta.url),
    "utf8",
  );
  const action = source.slice(
    source.indexOf("export async function updateRepositoryAction"),
    source.indexOf("export async function listRepositoryBranchesAction"),
  );

  assert.match(action, /updateRepositorySchema\.safeParse\(input\)/);
  assert.ok(
    action.indexOf("const sessionToken") <
      action.indexOf("await updateProjectRepository({"),
  );
});
