import "server-only";

import { callSupabaseRpc } from "@/lib/supabase/server";
import { hashOpaqueToken } from "@/services/projectService";
import {
  projectActionExecutionContextSchema,
  projectDocumentActionPageQuerySchema,
  projectDocumentActionPageSchema,
  projectDocumentActionSchema,
  type CodeLanguageShare,
  type CreateProjectDocumentActionInput,
  type ProjectActionExecutionContext,
  type ProjectActionGlobalContext,
  type ProjectDocumentAction,
  type ProjectDocumentActionPage,
  type ProjectDocumentActionPageQuery,
} from "@/types/projectAction";
import type { Json } from "@/types/database.types";

type ProjectDocumentActionRow = {
  id: string;
  repository_group_id: string;
  repository_group_name: string;
  pipeline_id: string;
  pipeline_name: string;
  action_type: string;
  state: string;
  stage: string;
  repository_analysis_state: string;
  overview: string | null;
  code_languages: Json;
  global_context_blob_name: string | null;
  global_context_url: string | null;
  action_version: number;
  error_message: string | null;
  started_at: string | null;
  repository_analysis_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectActionExecutionContextRow = {
  action_id: string;
  action_version: number;
  project_id: string;
  project_name: string;
  repository_group_snapshot: Json;
  pipeline_snapshot: Json;
};

type ProjectDocumentActionPagePayload = {
  items: ProjectDocumentActionRow[];
  total_count: number;
};

function mapProjectDocumentAction(
  row: ProjectDocumentActionRow,
): ProjectDocumentAction {
  return projectDocumentActionSchema.parse({
    id: row.id,
    repositoryGroupId: row.repository_group_id,
    repositoryGroupName: row.repository_group_name,
    pipelineId: row.pipeline_id,
    pipelineName: row.pipeline_name,
    actionType: row.action_type,
    state: row.state,
    stage: row.stage,
    repositoryAnalysisState: row.repository_analysis_state,
    overview: row.overview,
    codeLanguages: row.code_languages,
    globalContextBlobName: row.global_context_blob_name,
    globalContextUrl: row.global_context_url,
    version: row.action_version,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    repositoryAnalysisCompletedAt: row.repository_analysis_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapExecutionContext(
  row: ProjectActionExecutionContextRow,
): ProjectActionExecutionContext {
  return projectActionExecutionContextSchema.parse({
    actionId: row.action_id,
    version: row.action_version,
    projectId: row.project_id,
    projectName: row.project_name,
    repositoryGroup: row.repository_group_snapshot,
    pipeline: row.pipeline_snapshot,
  });
}

export async function listProjectDocumentActionsPage(
  sessionToken: string,
  input: ProjectDocumentActionPageQuery,
): Promise<ProjectDocumentActionPage> {
  const parsed = projectDocumentActionPageQuerySchema.parse(input);
  const payload = await callSupabaseRpc<ProjectDocumentActionPagePayload>(
    "list_project_actions_page",
    {
      p_session_token_hash: hashOpaqueToken(sessionToken),
      p_page: parsed.page,
      p_page_size: parsed.pageSize,
      p_repository_group_ids: parsed.repositoryGroupIds,
      p_pipeline_ids: parsed.pipelineIds,
      p_sort_by: parsed.sortBy,
      p_sort_direction: parsed.sortDirection,
    },
  );
  const totalCount = Number(payload.total_count);
  const totalPages = Math.max(1, Math.ceil(totalCount / parsed.pageSize));

  if (parsed.page > totalPages) {
    return listProjectDocumentActionsPage(sessionToken, {
      ...parsed,
      page: totalPages,
    });
  }

  return projectDocumentActionPageSchema.parse({
    items: payload.items.map(mapProjectDocumentAction),
    page: parsed.page,
    pageSize: parsed.pageSize,
    totalCount,
    totalPages,
  });
}

export async function createProjectDocumentAction(
  input: CreateProjectDocumentActionInput & { sessionToken: string },
): Promise<ProjectDocumentAction> {
  const rows = await callSupabaseRpc<ProjectDocumentActionRow[]>(
    "create_project_document_action",
    {
      p_session_token_hash: hashOpaqueToken(input.sessionToken),
      p_repository_group_id: input.repositoryGroupId,
      p_pipeline_id: input.pipelineId,
    },
  );
  if (!rows[0]) throw new Error("Document action creation returned no data.");
  return mapProjectDocumentAction(rows[0]);
}

export async function claimProjectActionRepositoryAnalysis(input: {
  sessionToken: string;
  actionId: string;
}): Promise<ProjectActionExecutionContext | null> {
  const rows = await callSupabaseRpc<ProjectActionExecutionContextRow[]>(
    "claim_project_action_repository_analysis",
    {
      p_session_token_hash: hashOpaqueToken(input.sessionToken),
      p_action_id: input.actionId,
    },
  );
  return rows[0] ? mapExecutionContext(rows[0]) : null;
}

export async function completeProjectActionRepositoryAnalysis(input: {
  sessionToken: string;
  actionId: string;
  overview: string;
  codeLanguages: CodeLanguageShare[];
  globalContext: ProjectActionGlobalContext;
  blobName: string;
  mediaUrl: string;
}): Promise<boolean> {
  return callSupabaseRpc<boolean>(
    "complete_project_action_repository_analysis",
    {
      p_session_token_hash: hashOpaqueToken(input.sessionToken),
      p_action_id: input.actionId,
      p_overview: input.overview,
      p_code_languages: input.codeLanguages as Json,
      p_global_context: input.globalContext as Json,
      p_global_context_blob_name: input.blobName,
      p_global_context_url: input.mediaUrl,
    },
  );
}

export async function failProjectActionRepositoryAnalysis(input: {
  sessionToken: string;
  actionId: string;
  message: string;
}): Promise<boolean> {
  return callSupabaseRpc<boolean>("fail_project_action_repository_analysis", {
    p_session_token_hash: hashOpaqueToken(input.sessionToken),
    p_action_id: input.actionId,
    p_error_message: input.message.slice(0, 500),
  });
}
