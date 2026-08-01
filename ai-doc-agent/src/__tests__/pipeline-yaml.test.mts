import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePipelineYaml,
  serializePipelineYaml,
} from "../lib/pipelineYaml.ts";
import type { ProjectPipelineInput } from "../types/pipeline.ts";

const sourceId = "11111111-1111-4111-8111-111111111111";
const agentNodeId = "22222222-2222-4222-8222-222222222222";
const agentId = "33333333-3333-4333-8333-333333333333";
const edgeId = "44444444-4444-4444-8444-444444444444";
const projectId = "55555555-5555-4555-8555-555555555555";
const secondAgentNodeId = "66666666-6666-4666-8666-666666666666";
const secondAgentId = "77777777-7777-4777-8777-777777777777";

function pipeline(): ProjectPipelineInput {
  return {
    name: "Documentation pipeline",
    description: "Portable YAML workflow",
    defaultConnector: "openai",
    defaultModel: "gpt-5.2",
    nodes: [
      {
        id: sourceId,
        kind: "source",
        position: { x: 48, y: 176 },
        inputMediaUrls: [],
      },
      {
        id: agentNodeId,
        kind: "agent",
        agentId,
        position: { x: 338, y: 176 },
        inputMediaUrls: [],
        output: {
          parentPath: "/generated/docs",
          fileName: "architecture",
          fileType: "md",
          sourceNodeIds: [secondAgentNodeId, agentNodeId],
          sourceHeaders: {
            [secondAgentNodeId]: "Research notes",
            [agentNodeId]: "Final architecture",
          },
        },
      },
      {
        id: secondAgentNodeId,
        kind: "agent",
        agentId: secondAgentId,
        position: { x: 338, y: 356 },
        inputMediaUrls: [],
      },
    ],
    edges: [
      {
        id: edgeId,
        fromNodeId: sourceId,
        toNodeId: agentNodeId,
        sourceAnchor: "right",
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        fromNodeId: sourceId,
        toNodeId: secondAgentNodeId,
        sourceAnchor: "bottom",
      },
    ],
  };
}

test("pipeline YAML round-trips defaults, graph data, and edge anchors", () => {
  const yaml = serializePipelineYaml(pipeline(), projectId);
  assert.match(yaml, /^version: 1/m);
  assert.match(yaml, new RegExp(`^projectId: ${projectId}$`, "m"));
  assert.match(yaml, /^defaultConnector: openai/m);
  assert.match(yaml, /^defaultModel: gpt-5\.2/m);
  assert.match(yaml, /sourceAnchor: right/);
  assert.match(yaml, /parentPath: \/generated\/docs/);
  assert.match(yaml, /fileName: architecture/);
  assert.match(
    yaml,
    new RegExp(
      `sourceNodeIds:\\n\\s*- ${secondAgentNodeId}\\n\\s*- ${agentNodeId}`,
    ),
  );
  assert.match(yaml, /sourceHeaders:/);
  assert.match(yaml, /Research notes/);
  assert.match(yaml, /Final architecture/);
  assert.deepEqual(parsePipelineYaml(yaml), { projectId, pipeline: pipeline() });
});

test("pipeline YAML rejects unsupported versions, aliases, and invalid graphs", () => {
  assert.throws(
    () => parsePipelineYaml("version: 2\nname: Invalid"),
    /version must be 1/i,
  );
  assert.throws(
    () => parsePipelineYaml("version: 1\nname: &shared Pipeline"),
    /aliases and anchors/i,
  );
  assert.throws(
    () => parsePipelineYaml(`version: 1\nprojectId: ${projectId}\nname: Missing graph`),
    /required|expected/i,
  );
});
