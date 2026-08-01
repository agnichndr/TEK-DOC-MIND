import assert from "node:assert/strict";
import test from "node:test";

import { projectPipelineInputSchema } from "../types/pipeline.ts";
import type { ProjectPipelineInput } from "../types/pipeline.ts";

const sourceId = "11111111-1111-4111-8111-111111111111";
const agentNodeId = "22222222-2222-4222-8222-222222222222";
const agentId = "33333333-3333-4333-8333-333333333333";
const edgeId = "44444444-4444-4444-8444-444444444444";

function validPipeline(): ProjectPipelineInput {
  return {
    name: "Documentation flow",
    description: "Turns repository context into reviewed documentation.",
    defaultConnector: "openai" as const,
    defaultModel: "gpt-5.2",
    nodes: [
      {
        id: sourceId,
        kind: "source" as const,
        position: { x: 48, y: 160 },
        inputMediaUrls: [] as string[],
      },
      {
        id: agentNodeId,
        kind: "agent" as const,
        agentId,
        position: { x: 360, y: 160 },
        inputMediaUrls: [] as string[],
        output: {
          parentPath: "/",
          fileName: "result",
          fileType: "md" as const,
        },
      },
    ],
    edges: [
      {
        id: edgeId,
        fromNodeId: sourceId,
        toNodeId: agentNodeId,
        sourceAnchor: "right",
      },
    ],
  };
}

test("accepts a connected project pipeline", () => {
  assert.equal(projectPipelineInputSchema.safeParse(validPipeline()).success, true);
});

test("accepts unique HTTPS media inputs and rejects unsafe or duplicate URLs", () => {
  const withMedia = validPipeline();
  withMedia.nodes[1] = {
    ...withMedia.nodes[1],
    inputMediaUrls: [
      "https://storageaccount.blob.core.windows.net/uploads/project/pipeline/file.pdf",
    ],
  };
  assert.equal(projectPipelineInputSchema.safeParse(withMedia).success, true);

  withMedia.nodes[1].inputMediaUrls = ["http://example.com/file.pdf"];
  assert.equal(projectPipelineInputSchema.safeParse(withMedia).success, false);

  const duplicateUrl =
    "https://storageaccount.blob.core.windows.net/uploads/project/pipeline/file.pdf";
  withMedia.nodes[1].inputMediaUrls = [duplicateUrl, duplicateUrl];
  assert.equal(projectPipelineInputSchema.safeParse(withMedia).success, false);
});

test("requires exactly one source and rejects disconnected agent nodes", () => {
  const withoutSource = validPipeline();
  withoutSource.nodes = withoutSource.nodes.filter(
    (node) => node.kind !== "source",
  );
  withoutSource.edges = [];
  assert.equal(
    projectPipelineInputSchema.safeParse(withoutSource).success,
    false,
  );

  const disconnected = validPipeline();
  disconnected.edges = [];
  assert.equal(
    projectPipelineInputSchema.safeParse(disconnected).success,
    false,
  );
});

test("requires at least one agent and one output file", () => {
  const withoutAgent = validPipeline();
  withoutAgent.nodes = [
    {
      ...withoutAgent.nodes[0],
      output: {
        parentPath: "/",
        fileName: "source-result",
        fileType: "md",
      },
    },
  ];
  withoutAgent.edges = [];
  assert.equal(projectPipelineInputSchema.safeParse(withoutAgent).success, false);

  const withoutOutput = validPipeline();
  delete withoutOutput.nodes[1].output;
  assert.equal(projectPipelineInputSchema.safeParse(withoutOutput).success, false);
});

test("rejects links to the source and unknown node references", () => {
  const backward = validPipeline();
  backward.edges = [
    {
      id: edgeId,
      fromNodeId: agentNodeId,
      toNodeId: sourceId,
      sourceAnchor: "right",
    },
  ];
  assert.equal(projectPipelineInputSchema.safeParse(backward).success, false);

  const unknown = validPipeline();
  unknown.edges[0].toNodeId = "55555555-5555-4555-8555-555555555555";
  assert.equal(projectPipelineInputSchema.safeParse(unknown).success, false);
});

test("accepts multiple linked inputs but rejects graph cycles", () => {
  const input = validPipeline();
  const secondAgentNodeId = "66666666-6666-4666-8666-666666666666";
  const thirdAgentNodeId = "77777777-7777-4777-8777-777777777777";
  input.nodes.push(
    {
      id: secondAgentNodeId,
      kind: "agent",
      agentId,
      position: { x: 360, y: 340 },
      inputMediaUrls: [] as string[],
    },
    {
      id: thirdAgentNodeId,
      kind: "agent",
      agentId,
      position: { x: 680, y: 240 },
      inputMediaUrls: [] as string[],
    },
  );
  input.edges.push(
    {
      id: "88888888-8888-4888-8888-888888888888",
      fromNodeId: sourceId,
      toNodeId: secondAgentNodeId,
      sourceAnchor: "right",
    },
    {
      id: "99999999-9999-4999-8999-999999999999",
      fromNodeId: agentNodeId,
      toNodeId: thirdAgentNodeId,
      sourceAnchor: "right",
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      fromNodeId: secondAgentNodeId,
      toNodeId: thirdAgentNodeId,
      sourceAnchor: "right",
    },
  );
  assert.equal(projectPipelineInputSchema.safeParse(input).success, true);

  input.edges.push({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    fromNodeId: thirdAgentNodeId,
    toNodeId: agentNodeId,
    sourceAnchor: "right",
  });
  assert.equal(projectPipelineInputSchema.safeParse(input).success, false);
});

test("preserves ordered output-file mappings and validates every source", () => {
  const input = validPipeline();
  const secondAgentNodeId = "66666666-6666-4666-8666-666666666666";
  input.nodes.push({
    id: secondAgentNodeId,
    kind: "agent",
    agentId,
    position: { x: 360, y: 340 },
    inputMediaUrls: [],
  });
  input.edges.push({
    id: "88888888-8888-4888-8888-888888888888",
    fromNodeId: sourceId,
    toNodeId: secondAgentNodeId,
    sourceAnchor: "right",
  });
  input.nodes[1].output = {
    parentPath: "/generated",
    fileName: "combined",
    fileType: "md",
    sourceNodeIds: [secondAgentNodeId, agentNodeId],
    sourceHeaders: {
      [secondAgentNodeId]: "Research",
      [agentNodeId]: "Final review",
    },
  };
  assert.equal(projectPipelineInputSchema.safeParse(input).success, true);

  input.nodes[1].output.sourceHeaders = {
    [secondAgentNodeId]: "",
  };
  assert.equal(projectPipelineInputSchema.safeParse(input).success, false);

  input.nodes[1].output.sourceHeaders = {
    [sourceId]: "Repository",
  };
  assert.equal(projectPipelineInputSchema.safeParse(input).success, false);

  input.nodes[1].output.sourceHeaders = undefined;

  input.nodes[1].output.sourceNodeIds = [secondAgentNodeId];
  assert.equal(projectPipelineInputSchema.safeParse(input).success, false);

  input.nodes[1].output.sourceNodeIds = [
    agentNodeId,
    "99999999-9999-4999-8999-999999999999",
  ];
  assert.equal(projectPipelineInputSchema.safeParse(input).success, false);
});
