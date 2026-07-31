import assert from "node:assert/strict";
import test from "node:test";

import { projectRepositoryGroupInputSchema } from "../types/projectResource.ts";

const validGroup = {
  name: "Architecture",
  description: "Architecture source context.",
  repositories: [
    {
      repositoryId: "0198a25d-8fe8-7ba7-9c70-e8d2af48f907",
      branch: "main",
      selectedPaths: [
        { path: "docs/architecture", type: "directory" },
        { path: "README.md", type: "file" },
      ],
      logicalContext: "Treat ADRs as authoritative decisions.",
    },
  ],
};

test("repository group entries support branch, multiple paths, and context", () => {
  assert.equal(projectRepositoryGroupInputSchema.safeParse(validGroup).success, true);
});

test("selected paths must stay repository-relative", () => {
  for (const path of [
    "/docs",
    "docs/",
    "../secrets",
    "docs/../secrets",
    "docs\\private",
  ]) {
    assert.equal(
      projectRepositoryGroupInputSchema.safeParse({
        ...validGroup,
        repositories: [
          {
            ...validGroup.repositories[0],
            selectedPaths: [{ path, type: "directory" }],
          },
        ],
      }).success,
      false,
    );
  }
});

test("allows multiple files in one scope and the same repository on another branch", () => {
  const result = projectRepositoryGroupInputSchema.safeParse({
    ...validGroup,
    repositories: [
      validGroup.repositories[0],
      { ...validGroup.repositories[0], branch: "release" },
    ],
  });
  assert.equal(result.success, true);
});

test("rejects duplicate selected paths and duplicate repository branches", () => {
  assert.equal(
    projectRepositoryGroupInputSchema.safeParse({
      ...validGroup,
      repositories: [
        {
          ...validGroup.repositories[0],
          selectedPaths: [
            { path: "docs", type: "directory" },
            { path: "docs", type: "directory" },
          ],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    projectRepositoryGroupInputSchema.safeParse({
      ...validGroup,
      repositories: [
        validGroup.repositories[0],
        {
          ...validGroup.repositories[0],
          selectedPaths: [{ path: "src", type: "directory" }],
        },
      ],
    }).success,
    false,
  );
});

test("accepts explicit all-project repository mode", () => {
  const result = projectRepositoryGroupInputSchema.safeParse({
    ...validGroup,
    repositoryMode: "all",
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.repositoryMode, "all");
});
