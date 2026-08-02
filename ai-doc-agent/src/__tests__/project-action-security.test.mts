import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionUrl = new URL("../actions/projectActionActions.ts", import.meta.url);
const migrationUrl = new URL(
  "../../supabase/migrations/202608020009_create_project_actions.sql",
  import.meta.url,
);

test("document action creation validates input and requires a live server session", async () => {
  const source = await readFile(actionUrl, "utf8");
  const validation = source.indexOf(
    "createProjectDocumentActionInputSchema.safeParse(input)",
  );
  const session = source.indexOf("(await cookies()).get(PROJECT_SESSION_COOKIE)");
  const service = source.indexOf("await createProjectDocumentAction({");

  assert.ok(validation >= 0 && validation < session);
  assert.ok(session >= 0 && session < service);
  assert.doesNotMatch(source, /projectId/);
  assert.doesNotMatch(source, /actionType:/);
  assert.doesNotMatch(source, /state:/);
});

test("project actions enforce RLS and same-project resource mappings", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /alter table public\.project_actions enable row level security/i);
  assert.match(sql, /alter table public\.project_actions force row level security/i);
  assert.match(sql, /revoke all on table public\.project_actions from anon, authenticated/i);
  assert.match(
    sql,
    /foreign key \(project_id, repository_group_id\)[\s\S]*references public\.project_repository_groups\(project_id, id\)/i,
  );
  assert.match(
    sql,
    /foreign key \(project_id, pipeline_id\)[\s\S]*references public\.project_pipelines\(project_id, id\)/i,
  );
  assert.match(
    sql,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/i,
  );
  assert.match(sql, /'CREATE',[\s\n]*'NEW'/i);
  assert.match(sql, /revoke all on function public\.create_project_document_action/i);
  assert.match(sql, /grant execute on function public\.create_project_document_action/i);
});
