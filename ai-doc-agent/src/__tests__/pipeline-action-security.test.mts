import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionUrl = new URL("../actions/pipelineActions.ts", import.meta.url);

test("pipeline actions validate input and require a server project session", async () => {
  const source = await readFile(actionUrl, "utf8");
  for (const [schema, service] of [
    ["projectPipelineInputSchema.safeParse(pipelineInput)", "await saveProjectPipeline({"],
    ["deleteProjectPipelineSchema.safeParse({ id })", "await deleteProjectPipeline({"],
  ]) {
    const validation = source.indexOf(schema);
    const call = source.indexOf(service);
    const session = source.lastIndexOf("const token = await sessionToken()", call);
    assert.ok(validation >= 0 && validation < call);
    assert.ok(session >= 0 && session < call);
  }
  assert.ok(
    source.indexOf("pipelineUploadManifestSchema.safeParse(manifestInput)") <
      source.indexOf("await saveProjectPipeline({"),
  );
  assert.match(source, /MAX_PIPELINE_UPLOAD_BYTES/);
  assert.match(source, /MAX_PIPELINE_UPLOAD_TOTAL_BYTES/);
});
