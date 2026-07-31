import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607310001_add_confirmed_deletions.sql",
  import.meta.url,
);

test("deletions require a live project session and exact resource name", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /project_sessions\.expires_at > now\(\)/i);
  assert.match(migration, /repositories\.name = p_repository_name/i);
  assert.match(migration, /projects\.name = p_project_name/i);
  assert.match(
    migration,
    /repositories\.project_id = v_project_id/i,
  );
});

test("deletion RPCs expose only narrow execute permissions", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  for (const signature of [
    "delete_project_repository\\(text, uuid, text\\)",
    "delete_project\\(text, text\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature}`, "i"),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${signature}`, "i"),
    );
  }
});
