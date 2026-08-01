import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608020008_enforce_pipeline_output_assembly.sql",
  import.meta.url,
);

test("pipeline output assembly is enforced after the complete graph is written", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create constraint trigger enforce_pipeline_output_assembly_on_pipeline/i);
  assert.match(sql, /create constraint trigger enforce_pipeline_output_assembly_on_nodes/i);
  assert.match(sql, /deferrable initially deferred/i);
  assert.match(sql, /node_kind = 'agent'/i);
  assert.match(sql, /output_config is not null/i);
  assert.match(sql, /pipeline requires at least one agent node/i);
  assert.match(sql, /pipeline requires at least one output file/i);
});

test("database validates ordered sources and optional output headers", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /sourceNodeIds/);
  assert.match(sql, /sourceHeaders/);
  assert.match(sql, /jsonb_array_length[\s\S]*not between 1 and 50/i);
  assert.match(sql, /count\(distinct values_\.value\)/i);
  assert.match(sql, /sources\.node_kind <> 'agent'/i);
  assert.match(sql, /char_length\(btrim[\s\S]*not between 1 and 200/i);
  assert.match(
    sql,
    /revoke all on function public\.enforce_project_pipeline_output_assembly\(\)[\s\S]*from public, anon, authenticated/i,
  );
});
