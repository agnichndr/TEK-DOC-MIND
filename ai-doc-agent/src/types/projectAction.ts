import { z } from "zod";

export const createProjectDocumentActionInputSchema = z.object({
  repositoryGroupId: z.uuid("Select a valid repository group."),
  pipelineId: z.uuid("Select a valid pipeline."),
});

export const projectDocumentActionSchema = z.object({
  id: z.uuid(),
  repositoryGroupId: z.uuid(),
  repositoryGroupName: z.string().min(1),
  pipelineId: z.uuid(),
  pipelineName: z.string().min(1),
  actionType: z.literal("CREATE"),
  state: z.literal("NEW"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CreateProjectDocumentActionInput = z.infer<
  typeof createProjectDocumentActionInputSchema
>;

export type ProjectDocumentAction = z.infer<
  typeof projectDocumentActionSchema
>;

export type ProjectDocumentActionResult<T> =
  | { status: "success"; resource: T }
  | { status: "error"; message: string; fields?: Record<string, string> };
