import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607300002_add_project_repositories.sql",
  import.meta.url,
);

test("repository tables force RLS and revoke direct client access", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  for (const table of ["project_sessions", "repositories"]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`, "i"),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table} from anon, authenticated`,
        "i",
      ),
    );
  }
});

test("private credentials require complete encrypted fields", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /repositories_private_token_required/i);
  assert.match(migration, /token_ciphertext is not null/i);
  assert.match(migration, /token_nonce is not null/i);
  assert.match(migration, /token_auth_tag is not null/i);
  assert.doesNotMatch(migration, /access_token\s+(?:text|varchar)/i);
});
