import "server-only";

import { callSupabaseRpc } from "@/lib/supabase/server";
import { hashOpaqueToken } from "@/services/projectService";
import {
  projectDocumentActionSchema,
  type CreateProjectDocumentActionInput,
  type ProjectDocumentAction,
} from "@/types/projectAction";

type ProjectDocumentActionRow = {
  id: string;
  repository_group_id: string;
  repository_group_name: string;
  pipeline_id: string;
  pipeline_name: string;
  action_type: string;
  state: string;
  created_at: string;
  updated_at: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listProjectDocumentActions(
  sessionToken: string,
): Promise<ProjectDocumentAction[]> {
  const rows = await callSupabaseRpc<ProjectDocumentActionRow[]>(
    "list_project_actions",
    { p_session_token_hash: hashOpaqueToken(sessionToken) },
  );
  return rows.map(mapProjectDocumentAction);
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
