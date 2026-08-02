import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608020011_make_github_output_link_optional.sql",
  import.meta.url,
);

test("expanded output connections do not require a GitHub-to-output link", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.enforce_project_pipeline_output_assembly/i);
  assert.doesNotMatch(sql, /v_has_source_output/i);
  assert.doesNotMatch(sql, /pipeline requires an output link from the GitHub source/i);
  assert.match(sql, /pipeline requires at least one agent node/i);
  assert.match(sql, /pipeline requires at least one output file/i);
});

test("expanded output connections persist bounded target positions", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /output_config \? 'position'/i);
  assert.match(sql, /invalid output position/i);
  assert.match(sql, /not between 0 and 4000/i);
  assert.doesNotMatch(sql, /sources\.node_kind <> 'agent'/i);
  assert.match(
    sql,
    /revoke all on function public\.enforce_project_pipeline_output_assembly\(\)[\s\S]*from public, anon, authenticated/i,
  );
});
