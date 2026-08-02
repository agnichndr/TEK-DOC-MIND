import assert from "node:assert/strict";
import test from "node:test";

import { createProjectDocumentActionInputSchema } from "@/types/projectAction";

const validInput = {
  repositoryGroupId: "11111111-1111-4111-8111-111111111111",
  pipelineId: "22222222-2222-4222-8222-222222222222",
};

test("accepts a repository-group and pipeline mapping", () => {
  assert.equal(createProjectDocumentActionInputSchema.safeParse(validInput).success, true);
});

test("rejects invalid action resource identifiers", () => {
  assert.equal(
    createProjectDocumentActionInputSchema.safeParse({
      ...validInput,
      repositoryGroupId: "not-a-uuid",
    }).success,
    false,
  );
  assert.equal(
    createProjectDocumentActionInputSchema.safeParse({
      ...validInput,
      pipelineId: "not-a-uuid",
    }).success,
    false,
  );
});
