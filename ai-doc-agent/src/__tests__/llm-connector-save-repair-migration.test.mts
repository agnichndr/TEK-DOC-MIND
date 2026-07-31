import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607310011_fix_llm_connector_save_ambiguity.sql",
  import.meta.url,
);

test("connector save repair uses the named primary-key conflict target", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /on conflict on constraint project_llm_connectors_pkey do update/,
  );
  assert.doesNotMatch(migration, /on conflict \(project_id, connector\)/);
});

test("connector save repair retains session scope, validation, and grants", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/,
  );
  assert.match(migration, /p_summary ->> 'defaultModel'/);
  assert.match(migration, /credential_ciphertext/);
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.save_project_llm_connector/,
  );
  assert.match(migration, /to anon, authenticated/);
});

