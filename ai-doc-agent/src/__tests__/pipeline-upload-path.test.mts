import assert from "node:assert/strict";
import test from "node:test";

import { buildPipelineUploadBlobName } from "../lib/azureBlobPath.ts";

test("builds the required project and pipeline Azure upload folder", () => {
  assert.equal(
    buildPipelineUploadBlobName({
      projectName: "Technical Docs",
      projectId: "11111111-1111-4111-8111-111111111111",
      pipelineName: "Review & Publish",
      pipelineId: "22222222-2222-4222-8222-222222222222",
      uploadId: "33333333-3333-4333-8333-333333333333",
      fileName: "source brief.pdf",
    }),
    "Technical-Docs_11111111-1111-4111-8111-111111111111/Review-Publish_22222222-2222-4222-8222-222222222222/uploads/33333333-3333-4333-8333-333333333333_source-brief.pdf",
  );
});
