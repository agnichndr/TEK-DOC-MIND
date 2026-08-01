import { z } from "zod";

import { llmConnectorTypeSchema } from "@/types/llmConnector";

export const MAX_PIPELINE_YAML_LENGTH = 500_000;
export const MAX_PIPELINE_UPLOAD_COUNT = 20;
export const MAX_PIPELINE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PIPELINE_UPLOAD_TOTAL_BYTES = 50 * 1024 * 1024;

const pipelineMediaUrlSchema = z
  .url("Invalid pipeline media URL.")
  .max(2_048, "Pipeline media URL is too long.")
  .refine((value) => value.startsWith("https://"), "Pipeline media URLs must use HTTPS.");

export const pipelineEdgeAnchorSchema = z.enum([
  "right",
  "top",
  "bottom",
  "left",
]);

export const pipelineOutputFileTypeSchema = z.enum([
  "html",
  "xml",
  "md",
  "txt",
  "json",
  "png",
  "jpeg",
  "mermaid",
  "yml",
  "yaml",
  "odt",
  "rtf",
  "docx",
  "pdf",
  "csv",
  "svg",
]);

const pipelineNodeOutputSchema = z.object({
  parentPath: z
    .string()
    .trim()
    .max(512, "Output parent path cannot exceed 512 characters.")
    .transform((value) => value || "/")
    .refine(
      (value) =>
        value.startsWith("/") &&
        !value.split("/").some((segment) => segment === ".."),
      "Output parent path must start with / and cannot contain .. segments.",
    ),
  fileName: z
    .string()
    .trim()
    .min(1, "Enter an output file name.")
    .max(255, "Output file name cannot exceed 255 characters.")
    .refine((value) => !/[\\/]/.test(value), "Output file name cannot contain slashes."),
  fileType: pipelineOutputFileTypeSchema,
  sourceNodeIds: z
    .array(z.uuid("Invalid output source node."))
    .min(1, "An output file requires at least one mapped node.")
    .max(50, "An output file cannot combine more than 50 node outputs.")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Output source nodes must be unique.",
    )
    .optional(),
  sourceHeaders: z
    .record(
      z.uuid("Invalid output header source node."),
      z
        .string()
        .trim()
        .min(1, "Output headers cannot be empty.")
        .max(200, "Output headers cannot exceed 200 characters."),
    )
    .optional(),
});

const pipelinePositionSchema = z.object({
  x: z.number().int().min(0).max(4_000),
  y: z.number().int().min(0).max(4_000),
});

const pipelineSourceNodeSchema = z.object({
  id: z.uuid("Invalid source node."),
  kind: z.literal("source"),
  position: pipelinePositionSchema,
  inputMediaUrls: z
    .array(pipelineMediaUrlSchema)
    .max(MAX_PIPELINE_UPLOAD_COUNT, "A node cannot use more than 20 uploaded files.")
    .refine((urls) => new Set(urls).size === urls.length, "Node media inputs must be unique.")
    .default([]),
  output: pipelineNodeOutputSchema.optional(),
});

const pipelineAgentNodeSchema = z.object({
  id: z.uuid("Invalid agent node."),
  kind: z.literal("agent"),
  agentId: z.uuid("Invalid pipeline agent."),
  position: pipelinePositionSchema,
  inputMediaUrls: z
    .array(pipelineMediaUrlSchema)
    .max(MAX_PIPELINE_UPLOAD_COUNT, "A node cannot use more than 20 uploaded files.")
    .refine((urls) => new Set(urls).size === urls.length, "Node media inputs must be unique.")
    .default([]),
  output: pipelineNodeOutputSchema.optional(),
});

export const pipelineNodeSchema = z.discriminatedUnion("kind", [
  pipelineSourceNodeSchema,
  pipelineAgentNodeSchema,
]);

export const pipelineEdgeSchema = z.object({
  id: z.uuid("Invalid pipeline connection."),
  fromNodeId: z.uuid("Invalid source node."),
  toNodeId: z.uuid("Invalid target node."),
  sourceAnchor: pipelineEdgeAnchorSchema.default("right"),
});

export const projectPipelineInputSchema = z
  .object({
    id: z.uuid("Invalid pipeline.").optional(),
    name: z
      .string()
      .trim()
      .min(2, "Pipeline name must be at least 2 characters.")
      .max(120, "Pipeline name cannot exceed 120 characters."),
    description: z
      .string()
      .trim()
      .max(800, "Description cannot exceed 800 characters."),
    defaultConnector: llmConnectorTypeSchema,
    defaultModel: z
      .string()
      .trim()
      .min(1, "Choose a default pipeline model.")
      .max(256, "Default model identifier is too long.")
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
        "Choose a valid default pipeline model.",
      ),
    nodes: z
      .array(pipelineNodeSchema)
      .min(1, "A pipeline requires its GitHub source node.")
      .max(50, "A pipeline cannot exceed 50 nodes."),
    edges: z
      .array(pipelineEdgeSchema)
      .max(100, "A pipeline cannot exceed 100 connections."),
  })
  .superRefine((pipeline, context) => {
    const nodeIds = new Set(pipeline.nodes.map((node) => node.id));
    if (nodeIds.size !== pipeline.nodes.length) {
      context.addIssue({
        code: "custom",
        message: "Pipeline node IDs must be unique.",
        path: ["nodes"],
      });
    }

    const sourceNodes = pipeline.nodes.filter((node) => node.kind === "source");
    if (sourceNodes.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "A pipeline requires exactly one GitHub source node.",
        path: ["nodes"],
      });
      return;
    }

    const nodesById = new Map(pipeline.nodes.map((node) => [node.id, node]));
    for (const [index, node] of pipeline.nodes.entries()) {
      if (!node.output) continue;
      const sourceNodeIds = node.output.sourceNodeIds ?? [node.id];
      if (!sourceNodeIds.includes(node.id)) {
        context.addIssue({
          code: "custom",
          message: "An output file must include the node marked as its output.",
          path: ["nodes", index, "output", "sourceNodeIds"],
        });
      }
      if (sourceNodeIds.some((sourceId) => !nodesById.has(sourceId))) {
        context.addIssue({
          code: "custom",
          message: "Every output file source must reference a pipeline node.",
          path: ["nodes", index, "output", "sourceNodeIds"],
        });
      }
      if (
        sourceNodeIds.some(
          (sourceId) =>
            sourceId !== node.id && nodesById.get(sourceId)?.kind !== "agent",
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Only agent outputs can be mapped into another output file.",
          path: ["nodes", index, "output", "sourceNodeIds"],
        });
      }
      if (
        node.output.sourceHeaders &&
        Object.keys(node.output.sourceHeaders).some(
          (sourceId) => !sourceNodeIds.includes(sourceId),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Every output header must belong to a mapped source node.",
          path: ["nodes", index, "output", "sourceHeaders"],
        });
      }
    }
    if (!pipeline.nodes.some((node) => node.kind === "agent")) {
      context.addIssue({
        code: "custom",
        message: "A pipeline requires at least one agent node.",
        path: ["nodes"],
      });
    }
    if (!pipeline.nodes.some((node) => node.output)) {
      context.addIssue({
        code: "custom",
        message: "A pipeline requires at least one output file.",
        path: ["nodes"],
      });
    }
    const edgeIds = new Set<string>();
    const edgePairs = new Set<string>();
    const adjacency = new Map<string, string[]>();

    for (const [index, edge] of pipeline.edges.entries()) {
      const fromNode = nodesById.get(edge.fromNodeId);
      const toNode = nodesById.get(edge.toNodeId);
      const pair = `${edge.fromNodeId}:${edge.toNodeId}`;
      if (edgeIds.has(edge.id) || edgePairs.has(pair)) {
        context.addIssue({
          code: "custom",
          message: "Pipeline connections must be unique.",
          path: ["edges", index],
        });
      }
      edgeIds.add(edge.id);
      edgePairs.add(pair);

      if (!fromNode || !toNode) {
        context.addIssue({
          code: "custom",
          message: "Every connection must reference pipeline nodes.",
          path: ["edges", index],
        });
        continue;
      }
      if (toNode.kind === "source" || edge.fromNodeId === edge.toNodeId) {
        context.addIssue({
          code: "custom",
          message: "Connections cannot target the source or the same node.",
          path: ["edges", index],
        });
      }
      adjacency.set(edge.fromNodeId, [
        ...(adjacency.get(edge.fromNodeId) ?? []),
        edge.toNodeId,
      ]);
    }

    const reachable = new Set<string>();
    const pending = [sourceNodes[0].id];
    while (pending.length) {
      const nodeId = pending.pop()!;
      if (reachable.has(nodeId)) continue;
      reachable.add(nodeId);
      pending.push(...(adjacency.get(nodeId) ?? []));
    }
    if (reachable.size !== pipeline.nodes.length) {
      context.addIssue({
        code: "custom",
        message: "Every agent node must connect to the GitHub source flow.",
        path: ["edges"],
      });
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasCycle = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visiting.add(nodeId);
      for (const targetId of adjacency.get(nodeId) ?? []) {
        if (hasCycle(targetId)) return true;
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return false;
    };
    if (hasCycle(sourceNodes[0].id)) {
      context.addIssue({
        code: "custom",
        message: "Pipeline connections cannot contain a cycle.",
        path: ["edges"],
      });
    }
  });

export const deleteProjectPipelineSchema = z.object({
  id: z.uuid("Invalid pipeline."),
});

export const pipelineUploadManifestSchema = z
  .array(
    z.object({
      clientId: z.uuid("Invalid upload reference."),
      nodeIds: z
        .array(z.uuid("Invalid upload node."))
        .min(1, "Each uploaded file must be assigned to a node.")
        .max(50)
        .refine((ids) => new Set(ids).size === ids.length, "Upload node references must be unique."),
    }),
  )
  .max(MAX_PIPELINE_UPLOAD_COUNT, "A pipeline cannot upload more than 20 files at once.")
  .refine(
    (uploads) => new Set(uploads.map((upload) => upload.clientId)).size === uploads.length,
    "Upload references must be unique.",
  );

export type ProjectUpload = {
  id: string;
  sourcePipelineId: string | null;
  fileName: string;
  mediaUrl: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export type PipelineNode = z.infer<typeof pipelineNodeSchema>;
export type PipelineEdge = z.infer<typeof pipelineEdgeSchema>;
export type PipelineEdgeAnchor = z.infer<typeof pipelineEdgeAnchorSchema>;
export type PipelineNodeOutput = z.infer<typeof pipelineNodeOutputSchema>;
export type PipelineOutputFileType = z.infer<typeof pipelineOutputFileTypeSchema>;
export type ProjectPipelineInput = z.infer<typeof projectPipelineInputSchema>;
export type ProjectPipeline = ProjectPipelineInput & {
  id: string;
  yamlDefinition: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPipelineSaveResult = {
  pipeline: ProjectPipeline;
  uploads: ProjectUpload[];
};

export type PipelineUploadManifest = z.infer<typeof pipelineUploadManifestSchema>;

export type ProjectPipelineActionResult<T> =
  | { status: "success"; resource: T }
  | { status: "error"; message: string; fields?: Record<string, string> };
