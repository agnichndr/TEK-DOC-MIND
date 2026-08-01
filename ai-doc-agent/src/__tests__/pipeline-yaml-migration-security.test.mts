import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202608010006_add_pipeline_yaml_defaults_and_anchors.sql",
  import.meta.url,
);

test("pipeline YAML migration persists defaults, YAML, and source anchors", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists default_connector text/i);
  assert.match(sql, /add column if not exists yaml_definition text/i);
  assert.match(sql, /add column if not exists source_anchor text/i);
  assert.match(sql, /add column if not exists output_config jsonb/i);
  assert.match(sql, /nodes\.output_config ->> 'fileType'/i);
  assert.match(sql, /'projectId', pipelines\.project_id/i);
  assert.match(sql, /source_anchor in \('right', 'top', 'bottom', 'left'\)/i);
  assert.match(sql, /project_pipelines_default_connector_fkey/i);
  assert.match(sql, /char_length\(coalesce\(p_yaml_definition/i);
});

test("updated pipeline RPCs retain live-session scope and narrow grants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /sessions\.expires_at > now\(\)/i);
  assert.match(sql, /connectors\.project_id = v_project_id/i);
  assert.match(sql, /revoke all on function public\.save_project_pipeline/i);
  assert.match(sql, /grant execute on function public\.save_project_pipeline/i);
  assert.match(sql, /pipeline contains a cycle/i);
});
