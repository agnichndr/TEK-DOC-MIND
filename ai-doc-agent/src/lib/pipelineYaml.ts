import { dump, load } from "js-yaml";

import {
  MAX_PIPELINE_YAML_LENGTH,
  projectPipelineInputSchema,
  type ProjectPipelineInput,
} from "@/types/pipeline";

export function serializePipelineYaml(
  pipeline: ProjectPipelineInput,
  projectId: string,
) {
  const parsed = projectPipelineInputSchema.parse(pipeline);
  return dump(
    {
      version: 1,
      projectId,
      name: parsed.name,
      description: parsed.description,
      defaultConnector: parsed.defaultConnector,
      defaultModel: parsed.defaultModel,
      nodes: parsed.nodes,
      edges: parsed.edges,
    },
    { lineWidth: 100, noRefs: true, sortKeys: false },
  );
}

export function parsePipelineYaml(value: string): {
  projectId: string;
  pipeline: ProjectPipelineInput;
} {
  if (!value.trim()) throw new Error("Pipeline YAML cannot be empty.");
  if (value.length > MAX_PIPELINE_YAML_LENGTH) {
    throw new Error("Pipeline YAML cannot exceed 500 KB.");
  }
  if (/(^|[\s:\-,[{])(?:&|\*)[A-Za-z0-9_-]+(?=$|[\s,\]}])/m.test(value)) {
    throw new Error("Pipeline YAML aliases and anchors are not supported.");
  }
  let document: unknown;
  try {
    document = load(value);
  } catch {
    throw new Error("Pipeline YAML contains invalid syntax.");
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Pipeline YAML must contain a mapping document.");
  }
  const { version, projectId, ...pipeline } = document as Record<string, unknown>;
  if (version !== 1) throw new Error("Pipeline YAML version must be 1.");
  if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    throw new Error("Pipeline YAML must contain a valid project ID.");
  }
  const parsed = projectPipelineInputSchema.safeParse(pipeline);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid pipeline YAML.");
  }
  return { projectId, pipeline: parsed.data };
}
