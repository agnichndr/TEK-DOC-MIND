import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607310012_require_default_model_all_connectors.sql",
  import.meta.url,
);

test("all connector summaries require a validated default model", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /char_length\(coalesce\(p_summary ->> 'defaultModel', ''\)\)/,
  );
  for (const connector of [
    "openai",
    "anthropic",
    "gemini",
    "azure_openai",
    "bedrock",
    "vertex_ai",
  ]) {
    assert.match(migration, new RegExp(`p_connector = '${connector}'`));
  }
});

test("all-provider model migration retains secure scoped upsert", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(
    migration,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/,
  );
  assert.match(
    migration,
    /on conflict on constraint project_llm_connectors_pkey do update/,
  );
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /revoke all on function/);
  assert.match(migration, /to anon, authenticated/);
});
