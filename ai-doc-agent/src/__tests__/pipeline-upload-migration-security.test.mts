import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608010007_persist_pipeline_uploads_in_azure.sql",
  import.meta.url,
);

test("project upload metadata is project-scoped and file bytes are never stored", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table if not exists public\.project_uploads/i);
  assert.match(sql, /project_id uuid not null references public\.projects/i);
  assert.match(sql, /alter table public\.project_uploads force row level security/i);
  assert.match(sql, /revoke all on table public\.project_uploads from anon, authenticated/i);
  assert.match(sql, /media_url varchar\(2048\)/i);
  assert.match(sql, /blob_name varchar\(1024\)/i);
  assert.doesNotMatch(sql, /\b(bytea|file_data|file_bytes|content_bytes)\b/i);
});

test("upload RPC derives project scope from a live session and checks media ownership", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(
    sql,
    /create or replace function public\.save_project_pipeline_with_uploads/i,
  );
  assert.match(sql, /sessions\.token_hash = p_session_token_hash/i);
  assert.match(sql, /sessions\.expires_at > now\(\)/i);
  assert.match(sql, /uploads\.project_id = v_project_id/i);
  assert.match(sql, /pipeline media does not belong to project/i);
  assert.match(sql, /revoke all on function public\.save_project_pipeline_with_uploads[\s\S]*from public/i);
});
