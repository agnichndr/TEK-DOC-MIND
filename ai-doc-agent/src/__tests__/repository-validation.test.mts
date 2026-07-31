import assert from "node:assert/strict";
import test from "node:test";

import { parseGitHubRepositoryUrl } from "../lib/githubUrl.ts";
import {
  addRepositorySchema,
  listRepositoryBranchesSchema,
  listRepositoryContentsSchema,
  updateRepositorySchema,
} from "../types/repository.ts";

test("accepts and normalizes a GitHub repository URL", () => {
  const result = addRepositorySchema.safeParse({
    url: "https://github.com/openai/openai-node.git",
    purpose: "API reference source",
    accessToken: "",
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    parseGitHubRepositoryUrl("https://github.com/openai/openai-node.git"),
    {
      owner: "openai",
      name: "openai-node",
      url: "https://github.com/openai/openai-node",
    },
  );
});

test("validates branch and repository-relative paths before browsing contents", () => {
  assert.equal(
    listRepositoryContentsSchema.safeParse({
      repositoryId: "3f55f9a5-5228-477b-b296-13ed83e13a89",
      branch: "release/docs",
      path: "docs/architecture",
    }).success,
    true,
  );
  assert.equal(
    listRepositoryContentsSchema.safeParse({
      repositoryId: "3f55f9a5-5228-477b-b296-13ed83e13a89",
      branch: "main",
      path: "../other-project",
    }).success,
    false,
  );
});

test("rejects non-GitHub, insecure, credential-bearing, and nested URLs", () => {
  const invalidUrls = [
    "http://github.com/openai/openai-node",
    "https://gitlab.com/openai/openai-node",
    "https://token@github.com/openai/openai-node",
    "https://github.com/openai/openai-node/issues",
  ];

  for (const url of invalidUrls) {
    const result = addRepositorySchema.safeParse({
      url,
      purpose: "",
      accessToken: "",
    });
    assert.equal(result.success, false, url);
  }
});

test("rejects malformed tokens and oversized purpose text", () => {
  const result = addRepositorySchema.safeParse({
    url: "https://github.com/openai/openai-node",
    purpose: "x".repeat(501),
    accessToken: "token with spaces and enough length",
  });

  assert.equal(result.success, false);
  assert.ok(result.error.flatten().fieldErrors.purpose);
  assert.ok(result.error.flatten().fieldErrors.accessToken);
});

test("validates repository IDs before listing GitHub branches", () => {
  assert.equal(
    listRepositoryBranchesSchema.safeParse({
      repositoryId: "3f55f9a5-5228-477b-b296-13ed83e13a89",
    }).success,
    true,
  );
  assert.equal(
    listRepositoryBranchesSchema.safeParse({
      repositoryId: "../../another-project",
    }).success,
    false,
  );
});

test("validates project-scoped repository updates", () => {
  assert.equal(
    updateRepositorySchema.safeParse({
      repositoryId: "3f55f9a5-5228-477b-b296-13ed83e13a89",
      purpose: "Primary API reference",
    }).success,
    true,
  );
  assert.equal(
    updateRepositorySchema.safeParse({
      repositoryId: "../../another-project",
      purpose: "x".repeat(501),
    }).success,
    false,
  );
});
