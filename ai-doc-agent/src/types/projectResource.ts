import { z } from "zod";

import type { LlmConnectorSummary } from "@/types/llmConnector";

export const repositorySourcePathSchema = z.object({
  path: z
    .string()
    .trim()
    .max(1024, "Repository path is too long.")
    .refine(
      (value) =>
        !value ||
        (!value.startsWith("/") &&
          !value.endsWith("/") &&
          !value.includes("\\") &&
          !value.split("/").some((part) => part === "." || part === "..")),
      "Use a repository-relative POSIX path.",
    ),
  type: z.enum(["file", "directory"]),
});

export const repositoryGroupItemSchema = z.object({
  repositoryId: z.uuid("Invalid repository."),
  branch: z
    .string()
    .trim()
    .min(1, "Select a branch.")
    .max(255, "Branch name is too long."),
  selectedPaths: z
    .array(repositorySourcePathSchema)
    .min(1, "Select at least one folder or file.")
    .max(500, "A repository entry cannot select more than 500 paths.")
    .refine(
      (paths) => new Set(paths.map((item) => item.path)).size === paths.length,
      "Each selected path must be unique.",
    ),
  logicalContext: z
    .string()
    .trim()
    .max(1000, "Logical context cannot exceed 1,000 characters."),
});

export const projectRepositoryGroupInputSchema = z
  .object({
    id: z.uuid("Invalid repository group.").optional(),
    repositoryMode: z.enum(["all", "selected"]).default("selected"),
    name: z
      .string()
      .trim()
      .min(1, "Enter a repository group name.")
      .max(100, "Group name cannot exceed 100 characters."),
    description: z
      .string()
      .trim()
      .max(500, "Group description cannot exceed 500 characters."),
    repositories: z
      .array(repositoryGroupItemSchema)
      .min(1, "Add at least one repository.")
      .max(200, "A group cannot contain more than 200 repository entries."),
  })
  .refine(
    (value) =>
      new Set(
        value.repositories.map(
          (repository) =>
            `${repository.repositoryId}:${repository.branch}`,
        ),
      ).size === value.repositories.length,
    {
      path: ["repositories"],
      message:
        "The same repository and branch can appear only once in a group.",
    },
  );

export const deleteProjectRepositoryGroupSchema = z.object({
  id: z.uuid("Invalid repository group."),
});

export const deleteProjectLlmConnectorSchema = z.object({
  connector: z.enum([
    "openai",
    "anthropic",
    "gemini",
    "azure_openai",
    "bedrock",
    "vertex_ai",
  ]),
});

export type ProjectRepositoryGroupInput = z.infer<
  typeof projectRepositoryGroupInputSchema
>;

export type ProjectRepositoryGroup = Omit<ProjectRepositoryGroupInput, "id"> & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectLlmConnector = LlmConnectorSummary & {
  credentialStored: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectResourceActionResult<T> =
  | { status: "success"; resource: T }
  | { status: "error"; message: string; fields?: Record<string, string> };
