import { z } from "zod";

import { projectPipelineInputSchema } from "@/types/pipeline";
import { projectRepositoryGroupInputSchema } from "@/types/projectResource";

export const createProjectDocumentActionInputSchema = z.object({
  repositoryGroupId: z.uuid("Select a valid repository group."),
  pipelineId: z.uuid("Select a valid pipeline."),
});

export const projectActionPageSizeSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(50),
]);

export const projectActionSortColumnSchema = z.enum([
  "action",
  "repositoryGroup",
  "pipeline",
  "state",
  "createdAt",
]);

export const projectActionSortDirectionSchema = z.enum(["asc", "desc"]);

export const projectDocumentActionPageQuerySchema = z
  .object({
    page: z.number().int().min(1).max(100_000),
    pageSize: projectActionPageSizeSchema,
    repositoryGroupIds: z.array(z.uuid()).max(100),
    pipelineIds: z.array(z.uuid()).max(100),
    sortBy: projectActionSortColumnSchema,
    sortDirection: projectActionSortDirectionSchema,
  })
  .strict();

export const projectActionStateSchema = z.enum([
  "NEW",
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

export const repositoryAnalysisStateSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);

export const projectActionStageSchema = z.enum([
  "REPOSITORY_ANALYSIS",
  "PIPELINE_PENDING",
  "COMPLETE",
  "FAILED",
]);

export const codeLanguageShareSchema = z.object({
  language: z.string().min(1).max(100),
  bytes: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
});

export const repositoryAnalysisModuleSchema = z.object({
  name: z.string().min(1).max(200),
  repository: z.string().min(1).max(300),
  path: z.string().max(1024),
  purpose: z.string().min(1).max(2000),
});

export const repositoryAnalysisRelationshipSchema = z.object({
  from: z.string().min(1).max(300),
  to: z.string().min(1).max(300),
  relationship: z.string().min(1).max(2000),
  evidence: z.array(z.string().min(1).max(1024)).max(20).default([]),
});

export const repositoryAnalysisRepositorySchema = z.object({
  name: z.string().min(1).max(300),
  role: z.string().min(1).max(500),
  summary: z.string().min(1).max(3000),
  selectedPaths: z.array(z.string().max(1024)).max(500),
  codeLanguages: z.array(codeLanguageShareSchema).default([]),
});

export const repositoryAnalysisFindingSchema = z.object({
  overview: z.string().min(1).max(6000),
  intent: z.string().min(1).max(6000),
  architectureSummary: z.string().min(1).max(8000),
  designPatterns: z.array(z.string().min(1).max(1000)).max(50),
  importantModules: z.array(repositoryAnalysisModuleSchema).max(100),
  repositories: z.array(repositoryAnalysisRepositorySchema).min(1).max(200),
  relationships: z.array(repositoryAnalysisRelationshipSchema).max(100),
  limitations: z.array(z.string().min(1).max(1000)).max(50),
});

export const repositoryAnalysisCoverageSchema = z.object({
  repositoryCount: z.number().int().positive(),
  discoveredFileCount: z.number().int().nonnegative(),
  analyzedFileCount: z.number().int().nonnegative(),
  analyzedBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const projectActionGlobalContextSchema =
  repositoryAnalysisFindingSchema.extend({
    codeLanguages: z.array(codeLanguageShareSchema),
    coverage: repositoryAnalysisCoverageSchema,
    generatedAt: z.iso.datetime(),
    connector: z.string().min(1).max(64),
    model: z.string().min(1).max(256),
  });

export const projectDocumentActionSchema = z.object({
  id: z.uuid(),
  repositoryGroupId: z.uuid(),
  repositoryGroupName: z.string().min(1),
  pipelineId: z.uuid(),
  pipelineName: z.string().min(1),
  actionType: z.literal("CREATE"),
  state: projectActionStateSchema,
  stage: projectActionStageSchema,
  repositoryAnalysisState: repositoryAnalysisStateSchema,
  overview: z.string().nullable(),
  codeLanguages: z.array(codeLanguageShareSchema),
  globalContextBlobName: z.string().nullable(),
  globalContextUrl: z.url().nullable(),
  version: z.number().int().positive(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  repositoryAnalysisCompletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectDocumentActionPageSchema = z.object({
  items: z.array(projectDocumentActionSchema),
  page: z.number().int().positive(),
  pageSize: projectActionPageSizeSchema,
  totalCount: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
});

export const projectActionExecutionContextSchema = z.object({
  actionId: z.uuid(),
  version: z.number().int().positive(),
  projectId: z.uuid(),
  projectName: z.string().min(1).max(100),
  repositoryGroup: projectRepositoryGroupInputSchema.safeExtend({
    id: z.uuid(),
  }),
  pipeline: projectPipelineInputSchema.safeExtend({ id: z.uuid() }),
});

export type CreateProjectDocumentActionInput = z.infer<
  typeof createProjectDocumentActionInputSchema
>;

export type ProjectDocumentAction = z.infer<
  typeof projectDocumentActionSchema
>;

export type ProjectActionPageSize = z.infer<
  typeof projectActionPageSizeSchema
>;

export type ProjectActionSortColumn = z.infer<
  typeof projectActionSortColumnSchema
>;

export type ProjectActionSortDirection = z.infer<
  typeof projectActionSortDirectionSchema
>;

export type ProjectDocumentActionPageQuery = z.infer<
  typeof projectDocumentActionPageQuerySchema
>;

export type ProjectDocumentActionPage = z.infer<
  typeof projectDocumentActionPageSchema
>;

export type ProjectActionGlobalContext = z.infer<
  typeof projectActionGlobalContextSchema
>;

export type RepositoryAnalysisFinding = z.infer<
  typeof repositoryAnalysisFindingSchema
>;

export type CodeLanguageShare = z.infer<typeof codeLanguageShareSchema>;

export type ProjectActionExecutionContext = z.infer<
  typeof projectActionExecutionContextSchema
>;

export type ProjectDocumentActionResult<T> =
  | { status: "success"; resource: T }
  | { status: "error"; message: string; fields?: Record<string, string> };
