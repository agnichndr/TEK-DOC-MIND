import "server-only";

import { randomUUID } from "node:crypto";

import { buildPipelineUploadBlobName } from "@/lib/azureBlobPath";
import { callSupabaseRpc } from "@/lib/supabase/server";
import { getProjectWorkspace, hashOpaqueToken } from "@/services/projectService";
import {
  deletePipelineBlob,
  uploadPipelineBlob,
} from "@/services/azureBlobService";
import { serializePipelineYaml } from "@/lib/pipelineYaml";
import type { Json } from "@/types/database.types";
import {
  projectPipelineInputSchema,
  type ProjectPipeline,
  type ProjectPipelineInput,
  type ProjectPipelineSaveResult,
  type ProjectUpload,
} from "@/types/pipeline";

type ProjectPipelineRow = {
  id: string;
  name: string;
  description: string;
  default_connector: string;
  default_model: string;
  yaml_definition: string;
  nodes: Json;
  edges: Json;
  created_at: string;
  updated_at: string;
};

type ProjectUploadRow = {
  id: string;
  source_pipeline_id: string | null;
  original_file_name: string;
  media_url: string;
  content_type: string;
  size_bytes: number | string;
  created_at: string;
};

type NewProjectUpload = {
  id: string;
  originalFileName: string;
  mediaUrl: string;
  blobName: string;
  contentType: string;
  sizeBytes: number;
};

function mapProjectPipeline(row: ProjectPipelineRow): ProjectPipeline {
  const parsed = projectPipelineInputSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    defaultConnector: row.default_connector,
    defaultModel: row.default_model,
    nodes: row.nodes,
    edges: row.edges,
  });
  return {
    ...parsed,
    id: row.id,
    yamlDefinition: row.yaml_definition,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pipelineNodesForRpc(input: ProjectPipelineInput): Json {
  return input.nodes.map((node) => ({
    id: node.id,
    node_kind: node.kind,
    agent_id: node.kind === "agent" ? node.agentId : null,
    position_x: node.position.x,
    position_y: node.position.y,
    output_config: node.output ?? null,
  }));
}

function pipelineEdgesForRpc(input: ProjectPipelineInput): Json {
  return input.edges.map((edge) => ({
    id: edge.id,
    from_node_id: edge.fromNodeId,
    to_node_id: edge.toNodeId,
    source_anchor: edge.sourceAnchor,
  }));
}

function pipelineNodeMediaForRpc(input: ProjectPipelineInput): Json {
  return input.nodes.map((node) => ({
    node_id: node.id,
    media_urls: node.inputMediaUrls,
  }));
}

function uploadsForRpc(uploads: NewProjectUpload[]): Json {
  return uploads.map((upload) => ({
    id: upload.id,
    original_file_name: upload.originalFileName,
    media_url: upload.mediaUrl,
    blob_name: upload.blobName,
    content_type: upload.contentType,
    size_bytes: upload.sizeBytes,
  }));
}

function mapProjectUpload(row: ProjectUploadRow): ProjectUpload {
  return {
    id: row.id,
    sourcePipelineId: row.source_pipeline_id,
    fileName: row.original_file_name,
    mediaUrl: row.media_url,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at,
  };
}

export async function listProjectPipelines(
  sessionToken: string,
): Promise<ProjectPipeline[]> {
  const rows = await callSupabaseRpc<ProjectPipelineRow[]>(
    "list_project_pipelines",
    { p_session_token_hash: hashOpaqueToken(sessionToken) },
  );
  return rows.map(mapProjectPipeline);
}

export async function listProjectUploads(
  sessionToken: string,
): Promise<ProjectUpload[]> {
  const rows = await callSupabaseRpc<ProjectUploadRow[]>("list_project_uploads", {
    p_session_token_hash: hashOpaqueToken(sessionToken),
  });
  return rows.map(mapProjectUpload);
}

export async function saveProjectPipeline(
  input: ProjectPipelineInput & {
    sessionToken: string;
    uploads: Array<{ file: File; nodeIds: string[] }>;
  },
): Promise<ProjectPipelineSaveResult> {
  const pipeline = projectPipelineInputSchema.parse(input);
  const project = await getProjectWorkspace(input.sessionToken);
  if (!project) throw new Error("Project session is unavailable.");
  const pipelineId = pipeline.id ?? randomUUID();
  const newUploads: NewProjectUpload[] = [];

  try {
    for (const upload of input.uploads) {
      const uploadId = randomUUID();
      const blobName = buildPipelineUploadBlobName({
        projectName: project.name,
        projectId: project.id,
        pipelineName: pipeline.name,
        pipelineId,
        uploadId,
        fileName: upload.file.name,
      });
      const blob = await uploadPipelineBlob({ blobName, file: upload.file });
      newUploads.push({
        id: uploadId,
        originalFileName: upload.file.name,
        mediaUrl: blob.mediaUrl,
        blobName,
        contentType: blob.contentType,
        sizeBytes: upload.file.size,
      });
    }

    const nodes = pipeline.nodes.map((node) => {
      const uploadedUrls = input.uploads.flatMap((upload, index) =>
        upload.nodeIds.includes(node.id) ? [newUploads[index].mediaUrl] : [],
      );
      return {
        ...node,
        inputMediaUrls: [...node.inputMediaUrls, ...uploadedUrls],
      };
    });
    const persistedPipeline = projectPipelineInputSchema.parse({
      ...pipeline,
      id: pipelineId,
      nodes,
    });
    const rows = await callSupabaseRpc<ProjectPipelineRow[]>(
      "save_project_pipeline_with_uploads",
      {
        p_session_token_hash: hashOpaqueToken(input.sessionToken),
        p_pipeline_id: pipelineId,
        p_name: persistedPipeline.name,
        p_description: persistedPipeline.description,
        p_default_connector: persistedPipeline.defaultConnector,
        p_default_model: persistedPipeline.defaultModel,
        p_yaml_definition: serializePipelineYaml(persistedPipeline, project.id),
        p_nodes: pipelineNodesForRpc(persistedPipeline),
        p_edges: pipelineEdgesForRpc(persistedPipeline),
        p_node_media: pipelineNodeMediaForRpc(persistedPipeline),
        p_uploads: uploadsForRpc(newUploads),
      },
    );
    if (!rows[0]) throw new Error("Pipeline save returned no data.");
    const createdAt = new Date().toISOString();
    return {
      pipeline: mapProjectPipeline(rows[0]),
      uploads: newUploads.map((upload) => ({
        id: upload.id,
        sourcePipelineId: pipelineId,
        fileName: upload.originalFileName,
        mediaUrl: upload.mediaUrl,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        createdAt,
      })),
    };
  } catch (error) {
    await Promise.allSettled(
      newUploads.map((upload) => deletePipelineBlob(upload.blobName)),
    );
    throw error;
  }
}

export async function deleteProjectPipeline(input: {
  sessionToken: string;
  id: string;
}): Promise<boolean> {
  return callSupabaseRpc<boolean>("delete_project_pipeline", {
    p_session_token_hash: hashOpaqueToken(input.sessionToken),
    p_pipeline_id: input.id,
  });
}
